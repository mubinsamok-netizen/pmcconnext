import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createResumableUploadSession, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { drive } from "@/lib/google";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { findAllRaw, findRowWithValidHeaders, insert } from "@/lib/sheetsCrud";
import { ensureSiteTableSchema } from "@/lib/sheetsSetup";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";
import { getSupabaseDocumentVersions, getSupabaseProjectDocuments } from "@/lib/supabaseReadModel";
import { isSupabaseBackend, readWithSheetsFallback } from "@/lib/supabaseRest";

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Other";
}

function isSheetsReadQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Quota exceeded") && message.includes("Read requests");
}

function textValue(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function isPdfFile(fileName: string, mimeType: string) {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

type DocumentRow = Awaited<ReturnType<typeof getSupabaseProjectDocuments>>[number];
const recentSheetDocumentReads = new Map<string, {
  expires: number;
  rows: Promise<DocumentRow[]>;
}>();

async function getSheetDocumentRows(siteSheetId: string) {
  try {
    return await findAllRaw("Project_Documents", siteSheetId) as DocumentRow[];
  } catch (error: unknown) {
    if (!isSheetsReadQuotaError(error)) throw error;
    console.warn("Project document version lookup skipped because Sheets read quota is temporarily exceeded.");
    return [];
  }
}

function readSheetDocumentsForUpload(siteSheetId: string, reuseRecent: boolean) {
  const now = Date.now();
  const recent = recentSheetDocumentReads.get(siteSheetId);
  if (reuseRecent && recent && recent.expires > now) return recent.rows;

  const rows = getSheetDocumentRows(siteSheetId);
  if (recentSheetDocumentReads.size >= 128) {
    const oldest = recentSheetDocumentReads.keys().next().value;
    if (oldest) recentSheetDocumentReads.delete(oldest);
  }
  recentSheetDocumentReads.set(siteSheetId, { expires: now + 10_000, rows });
  const discard = () => {
    if (recentSheetDocumentReads.get(siteSheetId)?.rows === rows) recentSheetDocumentReads.delete(siteSheetId);
  };
  void rows.then((data) => { if (!data.length) discard(); }, discard);
  return rows;
}

async function getDocumentRows(siteSheetId: string, projectId: string, rememberSheetRead = false) {
  const readSheets = () => rememberSheetRead
    ? readSheetDocumentsForUpload(siteSheetId, false)
    : getSheetDocumentRows(siteSheetId);
  if (!isSupabaseBackend()) return readSheets();

  const readSupabase = () => getSupabaseProjectDocuments(projectId);

  return readWithSheetsFallback("project_documents", readSupabase, readSheets);
}

async function getNextDocumentVersion(
  siteSheetId: string,
  projectId: string,
  category: string,
  title: string,
  useScopedRead = false,
) {
  const matchesDocument = (row: DocumentRow) => row.project_id === projectId &&
    String(row.category || "") === category &&
    String(row.title || "") === title;
  const versionNumber = (row: { version_number?: string | number | null }) => Number(row.version_number || 0);
  const readSheetVersions = async () => (await readSheetDocumentsForUpload(siteSheetId, true))
    .filter(matchesDocument)
    .map((row) => Number(row.version_number || 0));
  let versions: number[];
  if (!useScopedRead) {
    versions = (await getDocumentRows(siteSheetId, projectId)).filter(matchesDocument).map((row) => Number(row.version_number || 0));
  } else if (isSupabaseBackend()) {
    versions = await readWithSheetsFallback(
      "project_documents",
      async () => (await getSupabaseDocumentVersions(projectId, category, title)).map(versionNumber),
      readSheetVersions,
    );
  } else {
    versions = await readSheetVersions();
  }
  const currentVersions = versions.filter(Number.isFinite);
  return Math.max(0, ...currentVersions) + 1;
}

async function findUploadedDocument(siteSheetId: string, projectId: string, driveFileId: string) {
  const readSheets = () => getSheetDocumentRows(siteSheetId);
  const rows = isSupabaseBackend()
    ? await readWithSheetsFallback("project_documents", () => getSupabaseProjectDocuments(projectId, false, false, driveFileId), readSheets)
    : await readSheets();
  return rows.find((row) => row.project_id === projectId && String(row.drive_file_id || "") === driveFileId);
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId), false, { readOnly: true });
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const rows = await getDocumentRows(context.siteSheetId, context.project.project_id, true);
    const documents = rows
      .filter((row) => row.project_id === context.project.project_id)
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());

    return NextResponse.json({ success: true, data: documents, project: context.project });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

type DocumentFolder = Awaited<ReturnType<typeof findOrCreateFolder>>;
const uploadFolders = new Map<string, { expires: number; folder: Promise<DocumentFolder> }>();

function getUploadFolder(root: string, category: string, refresh = false) {
  const name = safeFolderName(category);
  const key = JSON.stringify([root, name]);
  const cached = uploadFolders.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return cached.folder;

  const folder = findOrCreateFolder("Project Documents", root, refresh)
    .then((parent) => findOrCreateFolder(name, parent.id || root, refresh))
    .catch((error: unknown) => {
      if (uploadFolders.get(key)?.folder === folder) uploadFolders.delete(key);
      throw error;
    });
  if (uploadFolders.size >= 256) uploadFolders.delete(uploadFolders.keys().next().value!);
  uploadFolders.set(key, { expires: Date.now() + 60_000, folder });
  return folder;
}

function uploadBinding(projectId: string, email: string, category: string, title: string, fileName: string, size: number, version: string, notes: string) {
  return createHash("sha256").update(JSON.stringify([projectId, email.trim().toLowerCase(), category, title, fileName, size, version, notes])).digest("hex");
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const started = performance.now();
  const metrics: string[] = [];
  const measure = async <T,>(label: string, action: () => Promise<T>) => {
    const at = performance.now();
    try {
      return await action();
    } finally {
      metrics.push(`${label};dur=${(performance.now() - at).toFixed(2)}`);
    }
  };
  const respond = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Server-Timing": [...metrics, `total;dur=${(performance.now() - started).toFixed(2)}`].join(", ") },
  });
  try {
    const { projectId } = await params;
    const contentType = req.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await req.json().catch(() => ({})) as Record<string, unknown>
      : null;
    const action = textValue(body?.action);
    const verified = body?.verify_upload === true;
    const checkDocumentHeaders = verified && action === "complete_upload" && !isSupabaseBackend();
    const context = await measure("site_context", () => getSiteApiContext(decodeURIComponent(projectId), false, {
      readOnly: (verified && action === "create_upload_session") || checkDocumentHeaders,
      onTiming: (phase, duration) => metrics.push(`${phase};dur=${duration.toFixed(2)}`),
    }));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    if (!hasPermission(context.session.user?.role, "siteDocument.upload")) {
      return NextResponse.json({ error: permissionDeniedMessage("siteDocument.upload") }, { status: 403 });
    }

    const driveFolderId = String(context.project.drive_folder_id || "").trim();
    if (!driveFolderId) {
      return NextResponse.json({ error: "Project has no Google Drive folder" }, { status: 400 });
    }

    if (body) {
      const category = textValue(body.category) || "other";
      const fileName = safeFolderName(textValue(body.file_name) || "document.pdf");
      const mimeType = textValue(body.mime_type) || "application/pdf";
      const size = numberValue(body.file_size);
      const title = textValue(body.title) || fileName;
      const notes = textValue(body.notes);
      const email = context.session.user?.email || "";
      if (verified && !email) return respond({ error: "ไม่พบผู้ใช้อัปโหลด" }, 403);

      if (action === "open_category_folder") {
        const documentsFolder = await findOrCreateFolder("Project Documents", driveFolderId);
        const categoryFolder = await findOrCreateFolder(safeFolderName(category), documentsFolder.id || driveFolderId);

        return NextResponse.json({
          success: true,
          data: {
            folder_id: categoryFolder.id || driveFolderId,
            folder_url: categoryFolder.webViewLink || `https://drive.google.com/drive/folders/${categoryFolder.id || driveFolderId}`,
            category,
          },
        });
      }

      if (action === "create_upload_session") {
        if (!isPdfFile(fileName, mimeType)) {
          return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF" }, { status: 400 });
        }
        if (!Number.isFinite(size) || size <= 0) {
          return NextResponse.json({ error: "ขนาดไฟล์ไม่ถูกต้อง" }, { status: 400 });
        }

        const [versionNumber, categoryFolder, reserved] = await Promise.all([
          measure("version_read", () => getNextDocumentVersion(context.siteSheetId, context.project.project_id, category, title, verified)),
          measure("drive_folders", () => getUploadFolder(driveFolderId, category)),
          verified ? measure("drive_allocate", async () => {
            const result = await drive.files.generateIds({ count: 1, space: "drive" });
            const id = result.data.ids?.[0];
            if (!id) throw new Error("Google Drive ไม่สามารถจองรหัสไฟล์ได้");
            return id;
          }) : undefined,
        ]);
        const storedName = `v${versionNumber}-${Date.now()}-${fileName}`;
        const openSession = (folder: DocumentFolder) => createResumableUploadSession({
          fileName: storedName,
          mimeType: verified ? "application/pdf" : mimeType,
          size,
          parentId: folder.id || driveFolderId,
          origin: new URL(req.url).origin,
          fileId: reserved,
          appProperties: reserved ? {
            pmcDocument: uploadBinding(context.project.project_id, email, category, title, fileName, size, String(versionNumber), notes),
          } : undefined,
        });
        const { uploadUrl } = await measure("drive_session", async () => {
          try {
            return await openSession(categoryFolder);
          } catch (error) {
            if ((error as { status?: number }).status !== 404) throw error;
            const refreshed = await measure("drive_folders_refresh", () => getUploadFolder(driveFolderId, category, true));
            return openSession(refreshed);
          }
        });

        return respond({
          success: true,
          data: {
            upload_url: uploadUrl,
            drive_file_id: reserved,
            folder_id: categoryFolder.id || driveFolderId,
            folder_url: categoryFolder.webViewLink || `https://drive.google.com/drive/folders/${categoryFolder.id || driveFolderId}`,
            category,
            title,
            notes,
            version_number: String(versionNumber),
            file_name: fileName,
            stored_name: storedName,
            mime_type: mimeType,
            file_size: String(size),
          },
        });
      }

      if (action === "complete_upload") {
        const driveFileId = textValue(body.drive_file_id);
        let driveUrl = textValue(body.drive_url);
        const versionNumber = textValue(body.version_number) || "1";
        let existing: DocumentRow | undefined;

        if (verified) {
          if (!/^[a-zA-Z0-9_-]{10,}$/.test(driveFileId)) return respond({ error: "รหัสไฟล์ไม่ถูกต้อง" }, 400);

          const verifyDriveFile = () => measure("drive_verify", async () => {
            try {
              const result = await drive.files.get({
                fileId: driveFileId,
                supportsAllDrives: true,
                fields: "id,size,mimeType,trashed,appProperties,webViewLink,webContentLink",
              });
              return result.data;
            } catch (error) {
              if ((error as { code?: number }).code === 404) return null;
              throw error;
            }
          });
          const readDocumentSheet = () => findRowWithValidHeaders("Project_Documents", context.siteSheetId, {
            project_id: context.project.project_id,
            drive_file_id: driveFileId,
          });
          const savedDocument = measure("document_read", checkDocumentHeaders
            ? readDocumentSheet
            : () => findUploadedDocument(context.siteSheetId, context.project.project_id, driveFileId))
            .then((data) => ({ data }), (error: unknown) => ({ error }));
          const file = await verifyDriveFile();
          if (!file) return respond({ error: "ยังไม่พบไฟล์ใน Drive กรุณาลองยืนยันอีกครั้ง" }, 409);
          const expected = uploadBinding(context.project.project_id, email, category, title, fileName, size, versionNumber, notes);
          if (file.trashed || file.appProperties?.pmcDocument !== expected || String(size) !== file.size || file.mimeType !== "application/pdf") {
            return respond({ error: "ข้อมูลไฟล์ใน Drive ไม่ตรงกับรายการอัปโหลด" }, 400);
          }
          driveUrl = file.webViewLink || file.webContentLink || `https://drive.google.com/file/d/${driveFileId}/view`;
          const result = await savedDocument;
          if (checkDocumentHeaders && ("error" in result || result.data === null)) {
            const schema = await measure("site_schema", () => ensureSiteTableSchema(context.siteSheetId, "Project_Documents"));
            const reread = schema.success ? await measure("document_reread", readDocumentSheet) : null;
            if (reread === null) {
              return respond({ error: "ตรวจสอบโครงสร้าง Google Sheets ไม่สำเร็จ กรุณาลองใหม่อีกครั้งเพื่อป้องกันข้อมูลคลาดเคลื่อน" }, 503);
            }
            existing = reread;
          } else {
            if ("error" in result) throw result.error;
            existing = result.data ?? undefined;
          }
        }

        if (!driveFileId || !driveUrl) {
          return NextResponse.json({ error: "ไม่พบข้อมูลไฟล์จาก Google Drive" }, { status: 400 });
        }

        if (!verified) {
          const rows = await measure("document_read", () => getDocumentRows(context.siteSheetId, context.project.project_id));
          existing = rows.find((row) => row.project_id === context.project.project_id && String(row.drive_file_id || "") === driveFileId);
        }
        if (existing) {
          return respond({ success: true, data: existing });
        }

        const data = {
          document_id: makeId("DOC"),
          project_id: context.project.project_id,
          category,
          title,
          version_number: versionNumber,
          file_name: fileName,
          mime_type: mimeType,
          file_size: String(size),
          drive_file_id: driveFileId,
          drive_url: driveUrl,
          notes,
          uploaded_by_email: context.session.user?.email || "",
          uploaded_by_name: context.session.user?.name || "",
        };
        const result = await measure("document_write", () => insert("Project_Documents", data, context.siteSheetId));
        recentSheetDocumentReads.delete(context.siteSheetId);

        return respond({ success: true, data: result.inserted });
      }

      return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์ PDF" }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF" }, { status: 400 });
    }

    const category = String(formData.get("category") || "other");
    const title = String(formData.get("title") || file.name).trim() || file.name;
    const notes = String(formData.get("notes") || "");
    const versionNumber = await getNextDocumentVersion(context.siteSheetId, context.project.project_id, category, title);

    const documentsFolder = await findOrCreateFolder("Project Documents", driveFolderId);
    const categoryFolder = await findOrCreateFolder(safeFolderName(category), documentsFolder.id || driveFolderId);
    const bytes = Buffer.from(await file.arrayBuffer());
    const storedName = `v${versionNumber}-${Date.now()}-${file.name}`;
    const uploaded = await uploadFile(storedName, file.type || "application/pdf", bytes, categoryFolder.id || driveFolderId);

    const data = {
      document_id: makeId("DOC"),
      project_id: context.project.project_id,
      category,
      title,
      version_number: String(versionNumber),
      file_name: file.name,
      mime_type: file.type || "application/pdf",
      file_size: String(file.size),
      drive_file_id: uploaded.id || "",
      drive_url: uploaded.webViewLink || uploaded.webContentLink || "",
      notes,
      uploaded_by_email: context.session.user?.email || "",
      uploaded_by_name: context.session.user?.name || "",
    };
    const result = await insert("Project_Documents", data, context.siteSheetId);
    recentSheetDocumentReads.delete(context.siteSheetId);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return respond({ error: getErrorMessage(error) }, 500);
  }
}
