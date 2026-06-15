import { NextResponse } from "next/server";
import { createResumableUploadSession, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { findAllRaw, insert } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";
import { getSupabaseProjectDocuments } from "@/lib/supabaseReadModel";
import { isSupabaseBackend, readWithSheetsFallback, shouldFallbackToSheets } from "@/lib/supabaseRest";

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

function mergeRowsById(primary: DocumentRow[], fallback: DocumentRow[]) {
  const merged = new Map<string, DocumentRow>();

  fallback.forEach((row, index) => {
    const key = String(row.document_id || row._rowIndex || `fallback-${index}`);
    merged.set(key, row);
  });

  primary.forEach((row, index) => {
    const key = String(row.document_id || row._rowIndex || `primary-${index}`);
    merged.set(key, row);
  });

  return Array.from(merged.values());
}

async function getSheetDocumentRows(siteSheetId: string) {
  try {
    return await findAllRaw("Project_Documents", siteSheetId) as DocumentRow[];
  } catch (error: unknown) {
    if (!isSheetsReadQuotaError(error)) throw error;
    console.warn("Project document version lookup skipped because Sheets read quota is temporarily exceeded.");
    return [];
  }
}

async function getDocumentRows(siteSheetId: string, projectId: string) {
  if (!isSupabaseBackend()) return getSheetDocumentRows(siteSheetId);

  const readSupabase = () => getSupabaseProjectDocuments(projectId);
  const readSheets = () => getSheetDocumentRows(siteSheetId);

  if (!shouldFallbackToSheets()) return readSupabase();

  return readWithSheetsFallback("project_documents", async () => {
    const [supabaseRows, sheetRows] = await Promise.all([
      readSupabase(),
      readSheets(),
    ]);
    return mergeRowsById(supabaseRows, sheetRows);
  }, readSheets);
}

function getNextVersion(
  rows: DocumentRow[],
  projectId: string,
  category: string,
  title: string
) {
  const currentVersions = rows
    .filter((row) => (
      row.project_id === projectId &&
      String(row.category || "") === category &&
      String(row.title || "") === title
    ))
    .map((row) => Number(row.version_number || 0))
    .filter(Number.isFinite);
  return Math.max(0, ...currentVersions) + 1;
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const rows = await getDocumentRows(context.siteSheetId, context.project.project_id);
    const documents = rows
      .filter((row) => row.project_id === context.project.project_id)
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());

    return NextResponse.json({ success: true, data: documents, project: context.project });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    if (!hasPermission(context.session.user?.role, "siteDocument.upload")) {
      return NextResponse.json({ error: permissionDeniedMessage("siteDocument.upload") }, { status: 403 });
    }

    const driveFolderId = String(context.project.drive_folder_id || "").trim();
    if (!driveFolderId) {
      return NextResponse.json({ error: "Project has no Google Drive folder" }, { status: 400 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const action = textValue(body.action);
      const category = textValue(body.category) || "other";
      const fileName = safeFolderName(textValue(body.file_name) || "document.pdf");
      const mimeType = textValue(body.mime_type) || "application/pdf";
      const size = numberValue(body.file_size);
      const title = textValue(body.title) || fileName;
      const notes = textValue(body.notes);

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

        const [rows, documentsFolder] = await Promise.all([
          getDocumentRows(context.siteSheetId, context.project.project_id),
          findOrCreateFolder("Project Documents", driveFolderId),
        ]);
        const categoryFolder = await findOrCreateFolder(safeFolderName(category), documentsFolder.id || driveFolderId);
        const versionNumber = getNextVersion(rows, context.project.project_id, category, title);
        const storedName = `v${versionNumber}-${Date.now()}-${fileName}`;
        const { uploadUrl } = await createResumableUploadSession({
          fileName: storedName,
          mimeType,
          size,
          parentId: categoryFolder.id || driveFolderId,
        });

        return NextResponse.json({
          success: true,
          data: {
            upload_url: uploadUrl,
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
        const driveUrl = textValue(body.drive_url);
        const versionNumber = textValue(body.version_number) || "1";

        if (!driveFileId || !driveUrl) {
          return NextResponse.json({ error: "ไม่พบข้อมูลไฟล์จาก Google Drive" }, { status: 400 });
        }

        const rows = await getDocumentRows(context.siteSheetId, context.project.project_id);
        const existing = rows.find((row) => String(row.drive_file_id || "") === driveFileId);
        if (existing) {
          return NextResponse.json({ success: true, data: existing });
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
        const result = await insert("Project_Documents", data, context.siteSheetId);

        return NextResponse.json({ success: true, data: result.inserted });
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
    const rows = await getDocumentRows(context.siteSheetId, context.project.project_id);
    const versionNumber = getNextVersion(rows, context.project.project_id, category, title);

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

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
