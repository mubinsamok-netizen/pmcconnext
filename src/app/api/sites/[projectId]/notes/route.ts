import { NextResponse } from "next/server";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { findAll, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";

type RouteContext = Awaited<ReturnType<typeof getSiteApiContext>> & {
  session: {
    user: {
      email?: string | null;
      name?: string | null;
    };
  };
  project: Record<string, string | number | undefined> & { project_id: string };
  siteSheetId: string;
};

type NoteRow = Record<string, string | number | undefined> & {
  note_id: string;
  project_id: string;
  title?: string;
  body?: string;
  category?: string;
  priority?: string;
  pinned?: string;
  archived?: string;
  attachments_json?: string;
  created_at?: string;
  updated_at?: string;
  _rowIndex?: number | string;
};

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

function text(value: unknown) {
  return String(value || "").trim();
}

function boolText(value: unknown) {
  const raw = String(value || "").toLowerCase();
  return raw === "true" || raw === "on" || raw === "1" ? "TRUE" : "FALSE";
}

function jsonStringify(value: unknown) {
  return JSON.stringify(value ?? []);
}

async function getNotes(context: RouteContext) {
  const rows = await findAll("Site_Notes", context.siteSheetId) as unknown as NoteRow[];
  return rows
    .filter((row) => row.project_id === context.project.project_id)
    .sort((a, b) => {
      const pinnedDelta = (String(b.pinned || "") === "TRUE" ? 1 : 0) - (String(a.pinned || "") === "TRUE" ? 1 : 0);
      if (pinnedDelta !== 0) return pinnedDelta;
      return new Date(String(b.updated_at || b.created_at || 0)).getTime() - new Date(String(a.updated_at || a.created_at || 0)).getTime();
    });
}

async function getNoteFolder(context: RouteContext, noteId: string) {
  const rootFolderId = String(context.project.drive_folder_id || "").trim();
  if (!rootFolderId) return null;
  const notesRoot = await findOrCreateFolder("Site Notes", rootFolderId);
  return await findOrCreateFolder(safeFolderName(noteId), notesRoot.id || rootFolderId);
}

async function uploadNoteAttachments(context: RouteContext, noteId: string, files: File[]) {
  if (files.length === 0) return [];
  const folder = await getNoteFolder(context, noteId);
  if (!folder?.id) throw new Error("Project Drive folder is not configured");

  return await Promise.all(files.slice(0, 8).map(async (file) => {
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadFile(
      `${Date.now()}-${safeFolderName(file.name)}`,
      file.type || "application/octet-stream",
      bytes,
      folder.id || ""
    );
    return {
      file_id: uploaded.id || "",
      file_name: file.name,
      stored_name: uploaded.name || "",
      file_url: uploaded.webViewLink || uploaded.webContentLink || "",
      mime_type: file.type || "application/octet-stream",
      file_size: String(file.size),
    };
  }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    return NextResponse.json({
      success: true,
      project: context.project,
      data: await getNotes(context as RouteContext),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function createNote(req: Request, context: RouteContext) {
  const formData = await req.formData();
  const title = text(formData.get("title"));
  const body = text(formData.get("body"));
  if (!title && !body) return NextResponse.json({ error: "กรุณากรอกหัวข้อหรือรายละเอียด" }, { status: 400 });

  const noteId = makeId("NOTE");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  const attachments = await uploadNoteAttachments(context, noteId, files);
  const actorName = context.session.user.name || "";
  const actorEmail = context.session.user.email || "";
  const payload = {
    note_id: noteId,
    project_id: context.project.project_id,
    title: title || "บันทึกหน้างาน",
    body,
    category: text(formData.get("category")) || "general",
    priority: text(formData.get("priority")) || "normal",
    pinned: boolText(formData.get("pinned")),
    archived: "FALSE",
    follow_up_date: text(formData.get("follow_up_date")),
    linked_module: text(formData.get("linked_module")),
    linked_ref: text(formData.get("linked_ref")),
    attachments_json: jsonStringify(attachments),
    created_by_name: actorName,
    created_by_email: actorEmail,
    updated_by_name: actorName,
    updated_by_email: actorEmail,
  };

  const result = await insert("Site_Notes", payload, context.siteSheetId);
  return NextResponse.json({ success: true, data: result.inserted });
}

async function patchNote(body: Record<string, unknown>, context: RouteContext) {
  const noteId = text(body.note_id);
  if (!noteId) return NextResponse.json({ error: "ไม่พบ note_id" }, { status: 400 });

  const rows = await getNotes(context);
  const current = rows.find((row) => row.note_id === noteId);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบบันทึกหน้างาน" }, { status: 404 });

  const patch: Record<string, string> = {
    updated_by_name: context.session.user.name || "",
    updated_by_email: context.session.user.email || "",
  };
  if (body.title !== undefined) patch.title = text(body.title);
  if (body.body !== undefined) patch.body = text(body.body);
  if (body.category !== undefined) patch.category = text(body.category);
  if (body.priority !== undefined) patch.priority = text(body.priority);
  if (body.follow_up_date !== undefined) patch.follow_up_date = text(body.follow_up_date);
  if (body.linked_module !== undefined) patch.linked_module = text(body.linked_module);
  if (body.linked_ref !== undefined) patch.linked_ref = text(body.linked_ref);
  if (body.pinned !== undefined) patch.pinned = boolText(body.pinned);
  if (body.archived !== undefined) patch.archived = boolText(body.archived);

  await update("Site_Notes", noteId, patch, context.siteSheetId, current._rowIndex);
  return NextResponse.json({ success: true, data: { ...current, ...patch } });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const routeContext = context as RouteContext;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) return createNote(req, routeContext);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (text(body.action) === "update_note") return patchNote(body, routeContext);
    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
