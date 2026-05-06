import { drive, DRIVE_ROOT_FOLDER_ID } from "./google";
import { Readable } from "stream";

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
    const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    const response = await drive.files.list({
      q: query,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "files(id, name, webViewLink)",
      spaces: "drive",
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0];
    } else {
      return await createFolder(folderName, parentId);
    }
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

export async function setupProjectFolders(projectName: string) {
  const projectFolder = await findOrCreateFolder(projectName);
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
