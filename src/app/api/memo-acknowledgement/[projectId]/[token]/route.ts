import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { findAll, findAllMaster, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import {
  buildMemoAcknowledgedLineFlex,
  buildMemoPdfHtml,
  createMemoDocumentNo,
  parseMemoAttachments,
  safeJsonStringify,
  type MemoEvidenceRecord,
  type MemoRecord,
} from "@/lib/siteMemos";

type PublicProject = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  client?: string;
  drive_folder_id?: string;
  site_sheet_id?: string;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

function isImageMimeType(value?: string | number) {
  return String(value || "").startsWith("image/");
}

async function withEmbeddableImageUrl<T extends { file_id?: string; file_url?: string; mime_type?: string | number }>(item: T) {
  if (!item.file_id || !isImageMimeType(item.mime_type)) return item;
  try {
    const file = await downloadFile(item.file_id);
    const mimeType = file.mimeType || String(item.mime_type || "image/jpeg");
    return {
      ...item,
      file_url: `data:${mimeType};base64,${file.buffer.toString("base64")}`,
      mime_type: mimeType,
    };
  } catch (error) {
    console.warn(`Failed to embed memo acknowledgement image ${item.file_id}:`, error);
    return item;
  }
}

async function prepareMemoPdfAssets(memo: MemoRecord, evidence: MemoEvidenceRecord[]) {
  const attachments = await Promise.all(
    parseMemoAttachments(memo.attachments_json).map((item) => withEmbeddableImageUrl(item))
  );
  const hydratedEvidence = await Promise.all(evidence.map((item) => withEmbeddableImageUrl(item)));

  return {
    memo: {
      ...memo,
      attachments_json: safeJsonStringify(attachments),
    },
    evidence: hydratedEvidence,
  };
}

async function getPublicContext(projectId: string, token: string) {
  if (!isSupabaseBackend()) await ensureMasterSchema();
  const projects = await findAllMaster("Projects") as unknown as PublicProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) return { error: "ไม่พบโครงการ", status: 404 as const };

  const siteSheetId = text(project.site_sheet_id);
  if (!siteSheetId) return { error: "โครงการยังไม่ได้ตั้งค่า Site Sheet", status: 400 as const };

  if (!isSupabaseBackend()) await ensureSchema(siteSheetId);
  const [memos, evidence] = await Promise.all([
    findAll("Site_Memos", siteSheetId) as unknown as Promise<MemoRecord[]>,
    findAll("Site_Memo_Evidence", siteSheetId) as unknown as Promise<MemoEvidenceRecord[]>,
  ]);
  const memo = memos.find((row) => row.project_id === project.project_id && text(row.acknowledgement_token) === token);
  if (!memo?._rowIndex) return { error: "ลิงก์รับทราบไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  return {
    project,
    siteSheetId,
    memo,
    memos: memos.filter((row) => row.project_id === project.project_id),
    evidence: evidence.filter((row) => row.project_id === project.project_id),
  };
}

async function getFallbackRowIndex(siteSheetId: string, memo: MemoRecord) {
  const numericRowIndex = Number(memo._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("Site_Memos", siteSheetId);
  return rawRows.find((row) => row.memo_id === memo.memo_id)?._rowIndex;
}

async function getMemoFolder(project: PublicProject, memoId: string) {
  const rootFolderId = text(project.drive_folder_id);
  if (!rootFolderId) return null;
  const memoRoot = await findOrCreateFolder("Site Memos", rootFolderId);
  const memoFolder = await findOrCreateFolder(safeFolderName(memoId), memoRoot.id || rootFolderId);
  return memoFolder.id || memoRoot.id || rootFolderId;
}

async function refreshMemoPdf(req: Request, context: Awaited<ReturnType<typeof getPublicContext>>, memo: MemoRecord, evidence: MemoEvidenceRecord[]) {
  if ("error" in context) throw new Error(context.error);

  const memoFolderId = await getMemoFolder(context.project, memo.memo_id);
  if (!memoFolderId) throw new Error("Project Drive folder is not configured");

  const documentNo = text(memo.document_no) || createMemoDocumentNo(context.project.project_id, context.memos);
  const origin = new URL(req.url).origin;
  const pdfAssets = await prepareMemoPdfAssets({ ...memo, document_no: documentNo }, evidence);
  const html = buildMemoPdfHtml({
    memo: pdfAssets.memo,
    project: context.project,
    logoUrl: `${origin}/logo.png`,
    evidence: pdfAssets.evidence,
  });
  const pdfFolder = await findOrCreateFolder("PDF", memoFolderId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || memoFolderId);

  return {
    document_no: documentNo,
    pdf_file_id: uploaded.id || "",
    pdf_url: uploaded.webViewLink || uploaded.webContentLink || "",
  };
}

function publicPayload(project: PublicProject, memo: MemoRecord, evidence: MemoEvidenceRecord[]) {
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    memo: {
      memo_id: memo.memo_id,
      document_no: memo.document_no || "",
      memo_type: memo.memo_type || "",
      title: memo.title || "",
      issue_date: memo.issue_date || "",
      event_date: memo.event_date || "",
      detail: memo.detail || "",
      status: memo.status || "",
      customer_name: memo.customer_name || project.client || "",
      pdf_url: memo.pdf_url || "",
      acknowledged_by: memo.acknowledged_by || "",
      acknowledged_date: memo.acknowledged_date || "",
      acknowledgement_note: memo.acknowledgement_note || "",
      evidence_count: evidence.filter((item) => item.memo_id === memo.memo_id).length,
    },
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.memo, context.evidence) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิด Memo ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const acknowledgedBy = text(body.acknowledged_by) || text(context.memo.customer_name) || text(context.project.client) || "ลูกค้า";
    const acknowledgementNote = text(body.acknowledgement_note) || "ลูกค้ากดรับทราบผ่านลิงก์ LINE";
    const acknowledgedAt = new Date().toISOString();
    const alreadyAcknowledged = ["acknowledged", "extension_approved", "closed"].includes(text(context.memo.status));

    let nextMemo = context.memo;
    let refreshedPdf: Record<string, string> = {};
    let nextEvidence = context.evidence;

    if (!alreadyAcknowledged) {
      const evidenceRow: MemoEvidenceRecord = {
        evidence_id: `MME-${Date.now()}`,
        memo_id: context.memo.memo_id,
        project_id: context.project.project_id,
        channel: "LINE acknowledgement link",
        acknowledged_by: acknowledgedBy,
        acknowledged_date: acknowledgedAt,
        file_name: "",
        file_id: "",
        file_url: "",
        mime_type: "",
        notes: acknowledgementNote,
        uploaded_by_name: acknowledgedBy,
        uploaded_by_email: "",
        created_at: acknowledgedAt,
      };
      await insert("Site_Memo_Evidence", evidenceRow, context.siteSheetId);
      nextEvidence = [...context.evidence, evidenceRow];

      const patch = {
        status: "acknowledged",
        acknowledged_by: acknowledgedBy,
        acknowledged_channel: "LINE acknowledgement link",
        acknowledged_date: acknowledgedAt,
        acknowledgement_note: acknowledgementNote,
        updated_at: acknowledgedAt,
      };
      nextMemo = { ...context.memo, ...patch };
      refreshedPdf = await refreshMemoPdf(req, context, nextMemo, nextEvidence);
      nextMemo = { ...nextMemo, ...refreshedPdf };

      await update(
        "Site_Memos",
        context.memo.memo_id || context.memo._rowIndex || "",
        { ...patch, ...refreshedPdf },
        context.siteSheetId,
        await getFallbackRowIndex(context.siteSheetId, context.memo)
      );
      await writeAuditLog({
        actor: { name: acknowledgedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "site_memos",
        action: "customer_acknowledged_via_link",
        targetId: context.memo.memo_id,
        summary: `ลูกค้ารับทราบ Memo: ${context.memo.title || context.memo.memo_id}`,
        before: context.memo,
        after: { ...patch, ...refreshedPdf },
      });

      const lineGroupId = text(context.memo.line_group_id);
      if (lineGroupId) {
        await sendLineMessages([buildMemoAcknowledgedLineFlex({
          projectName: text(context.project.name),
          projectId: context.project.project_id,
          documentNo: text(nextMemo.document_no),
          title: text(nextMemo.title),
          acknowledgedBy,
          acknowledgedAt: formatBangkokDateTime(acknowledgedAt),
          pdfUrl: text(nextMemo.pdf_url),
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after memo acknowledgement:", error));
      }
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, nextMemo, nextEvidence),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกรับทราบ Memo ไม่สำเร็จ" }, { status: 500 });
  }
}
