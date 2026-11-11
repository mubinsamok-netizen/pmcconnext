import { auth, drive, DRIVE_ROOT_FOLDER_ID } from "./google";
import { Readable } from "stream";

const FOLDER_LOOKUP_CACHE_TTL_MS = 60 * 60 * 1000;
const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFolderFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  webViewLink?: string | null;
  webContentLink?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  parents?: string[] | null;
  folderPath: string;
  isFolder: boolean;
};

const folderLookupCache = new Map<string, {
  expiresAt: number;
  folder: {
    id?: string | null;
    name?: string | null;
    webViewLink?: string | null;
  };
}>();

function getFolderCacheKey(folderName: string, parentId: string) {
  return `${parentId}:${folderName}`;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function createFolder(folderName: string, parentId: string = DRIVE_ROOT_FOLDER_ID) {
  try {
    const fileMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      supportsAllDrives: true,
      fields: "id, name, webViewLink",
    });

    return file.data;
  } catch (error) {
    console.error(`Error creating folder ${folderName}:`, error);
    throw error;
  }
}

export async function findOrCreateFolder(folderName: string, parentId: string = DRIVE_ROOT_FOLDER_ID) {
  try {
    const cacheKey = getFolderCacheKey(folderName, parentId);
    const cached = folderLookupCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.folder;
    }

    const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    const response = await drive.files.list({
      q: query,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "files(id, name, webViewLink)",
      spaces: "drive",
    });

    const folder = response.data.files && response.data.files.length > 0
      ? response.data.files[0]
      : await createFolder(folderName, parentId);
    folderLookupCache.set(cacheKey, {
      expiresAt: Date.now() + FOLDER_LOOKUP_CACHE_TTL_MS,
      folder,
    });
    return folder;
  } catch (error) {
    console.error(`Error finding/creating folder ${folderName}:`, error);
    throw error;
  }
}

export async function uploadFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  parentId: string
) {
  try {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata = {
      name: fileName,
      parents: [parentId],
    };

    const media = {
      mimeType,
      body: stream,
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      supportsAllDrives: true,
      fields: "id, name, webViewLink, webContentLink",
    });

    return file.data;
  } catch (error) {
    console.error(`Error uploading file ${fileName}:`, error);
    throw error;
  }
}

const DRIVE_LIST_PARENTS_PER_QUERY = 20;
const DRIVE_LIST_CONCURRENCY = 5;
const driveNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export async function listDriveFolderFiles(
  folderId: string,
  options: {
    recursive?: boolean;
    maxDepth?: number;
    pageSize?: number;
    maxFiles?: number;
  } = {}
) {
  const rootFolderId = folderId.trim();
  if (!rootFolderId) return [] as DriveFolderFile[];

  const recursive = options.recursive ?? true;
  const maxDepth = options.maxDepth ?? 4;
  const pageSize = options.pageSize ?? 100;
  const maxFiles = options.maxFiles ?? 500;
  type RawFile = { id: string; name: string; mimeType: string; isFolder: boolean; parentId: string; item: Omit<DriveFolderFile, "folderPath"> };
  const childrenByParent = new Map<string, RawFile[]>();
  const visitedFolders = new Set<string>([rootFolderId]);
  let collected = 0;

  // One request reads one page from a parent group; the scheduler reserves its budget.
  async function readParents(parentIds: string[], requestPageSize: number, pageToken?: string) {
    const parentSet = new Set(parentIds);
    const parentsQuery = parentIds.map((id) => `'${escapeDriveQueryValue(id)}' in parents`).join(" or ");
    const response = await drive.files.list({
      q: `(${parentsQuery}) and trashed = false`,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "nextPageToken, files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, parents)",
      spaces: "drive",
      pageSize: requestPageSize,
      pageToken,
      orderBy: "folder,name_natural",
    });

    for (const file of response.data.files || []) {
      const id = file.id || "";
      if (!id) continue;
      const parentId = (file.parents || []).find((parent) => parentSet.has(parent)) || (parentIds.length === 1 ? parentIds[0] : "");
      if (!parentId) continue;
      const name = file.name || id;
      const mimeType = file.mimeType || "application/octet-stream";
      const isFolder = mimeType === GOOGLE_DRIVE_FOLDER_MIME;
      const siblings = childrenByParent.get(parentId) || [];
      siblings.push({
        id, name, mimeType, isFolder, parentId,
        item: {
          id,
          name,
          mimeType,
          size: file.size || null,
          webViewLink: file.webViewLink || null,
          webContentLink: file.webContentLink || null,
          createdTime: file.createdTime || null,
          modifiedTime: file.modifiedTime || null,
          parents: file.parents || null,
          isFolder,
        },
      });
      childrenByParent.set(parentId, siblings);
      collected += 1;
    }

    return response.data.nextPageToken || undefined;
  }

  let level = [rootFolderId];
  for (let depth = 0; level.length > 0 && collected < maxFiles; depth += 1) {
    const chunks: string[][] = [];
    for (let index = 0; index < level.length; index += DRIVE_LIST_PARENTS_PER_QUERY) {
      chunks.push(level.slice(index, index + DRIVE_LIST_PARENTS_PER_QUERY));
    }
    const pending = chunks.map((parentIds) => ({ parentIds, pageToken: undefined as string | undefined }));
    while (pending.length > 0 && collected < maxFiles) {
      const remaining = maxFiles - collected;
      // Reserve a page budget for every in-flight request. Their combined results
      // cannot exceed the limit, even when all five requests return a full page.
      const slots = Math.min(DRIVE_LIST_CONCURRENCY, pending.length, Math.max(1, Math.floor(remaining / 100)));
      const wave = pending.splice(0, slots);
      const requestPageSize = Math.min(pageSize, Math.floor(remaining / slots));
      const nextTokens = await Promise.all(wave.map(({ parentIds, pageToken }) => (
        readParents(parentIds, requestPageSize, pageToken)
      )));
      wave.forEach((request, index) => {
        if (nextTokens[index]) pending.push({ ...request, pageToken: nextTokens[index] });
      });
    }

    if (!recursive || depth >= maxDepth) break;
    const nextLevel: string[] = [];
    for (const parentId of level) {
      for (const child of childrenByParent.get(parentId) || []) {
        if (!child.isFolder || visitedFolders.has(child.id)) continue;
        visitedFolders.add(child.id);
        nextLevel.push(child.id);
      }
    }
    level = nextLevel;
  }

  // Emit in the same order as a folder-by-folder walk: folders first, natural name order, children after their folder.
  const results: DriveFolderFile[] = [];
  const emitted = new Set<string>();
  function emit(parentId: string, folderPath: string) {
    if (emitted.has(parentId)) return;
    emitted.add(parentId);
    const children = [...(childrenByParent.get(parentId) || [])].sort((a, b) => (
      Number(b.isFolder) - Number(a.isFolder) || driveNameCollator.compare(a.name, b.name)
    ));
    for (const child of children) {
      if (results.length >= maxFiles) return;
      results.push({ ...child.item, folderPath });
      if (child.isFolder) emit(child.id, folderPath ? `${folderPath} / ${child.name}` : child.name);
    }
  }
  emit(rootFolderId, "");
  return results;
}

async function getDriveAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) throw new Error("Unable to create Google Drive upload session");
  return token;
}

export async function createResumableUploadSession({
  fileName,
  mimeType,
  size,
  parentId,
}: {
  fileName: string;
  mimeType: string;
  size: number;
  parentId: string;
}) {
  const token = await getDriveAccessToken();
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(size || 0),
    },
    body: JSON.stringify({
      name: fileName,
      mimeType: mimeType || "application/octet-stream",
      parents: [parentId],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive upload session failed: ${errorText || response.statusText}`);
  }

  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new Error("Google Drive did not return an upload URL");

  return { uploadUrl };
}

export async function downloadFile(fileId: string) {
  try {
    const [metadataResponse, fileResponse] = await Promise.all([
      drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: "id, name, mimeType, size",
      }),
      drive.files.get(
        {
          fileId,
          alt: "media",
          supportsAllDrives: true,
        },
        {
          responseType: "arraybuffer",
        }
      ),
    ]);

    return {
      id: metadataResponse.data.id || fileId,
      name: metadataResponse.data.name || fileId,
      mimeType: metadataResponse.data.mimeType || "application/octet-stream",
      size: Number(metadataResponse.data.size || 0),
      buffer: Buffer.from(fileResponse.data as ArrayBuffer),
    };
  } catch (error) {
    console.error(`Error downloading file ${fileId}:`, error);
    throw error;
  }
}

export async function createGoogleDocFromHtml(fileName: string, html: string, parentId: string) {
  try {
    const stream = new Readable();
    stream.push(Buffer.from(html, "utf8"));
    stream.push(null);

    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: "application/vnd.google-apps.document",
        parents: [parentId],
      },
      media: {
        mimeType: "text/html",
        body: stream,
      },
      supportsAllDrives: true,
      fields: "id, name, webViewLink",
    });

    return file.data;
  } catch (error) {
    console.error(`Error creating Google Doc ${fileName}:`, error);
    throw error;
  }
}

export async function exportGoogleDocToPdf(fileId: string) {
  try {
    const response = await drive.files.export(
      {
        fileId,
        mimeType: "application/pdf",
      },
      {
        responseType: "arraybuffer",
      }
    );

    return Buffer.from(response.data as ArrayBuffer);
  } catch (error) {
    console.error(`Error exporting Google Doc ${fileId} to PDF:`, error);
    throw error;
  }
}

export async function deleteDriveFile(fileId: string) {
  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
  } catch (error) {
    console.warn(`Failed to delete Drive file ${fileId}:`, error);
  }
}

export async function setupProjectFolders(projectName: string, parentId: string = DRIVE_ROOT_FOLDER_ID) {
  const projectFolder = await findOrCreateFolder(projectName, parentId);
  if (!projectFolder.id) throw new Error("Failed to create project folder");

  const subfolders = [
    "Drawings",
    "Photos",
    "Contracts",
    "Daily Reports",
    "BOQ & Budget"
  ];

  const createdFolders: Record<string, string> = {
    root: projectFolder.id
  };

  for (const sub of subfolders) {
    const subfolder = await findOrCreateFolder(sub, projectFolder.id);
    if (subfolder.id) {
      createdFolders[sub] = subfolder.id;
    }
  }

  return createdFolders;
}
