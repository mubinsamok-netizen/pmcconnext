import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import {
  DEFAULT_CUSTOMER_DECISIONS,
  buildCustomerDecisionLineFlex,
  buildCustomerDecisionPdfHtml,
  buildCustomerDecisionLineMessage,
  createCustomerDecisionDocumentNo,
  createCustomerDecisionId,
  parseDecisionEvidenceFiles,
  safeJsonStringify,
  type CustomerDecisionRecord,
  type CustomerDecisionUploadPayload,
} from "@/lib/customerDecisions";
import { downloadFile, findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { findAll, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";

type RouteContext = Awaited<ReturnType<typeof getSiteApiContext>> & {
  session: {
    user: {
      email?: string | null;
      name?: string | null;
      role?: string | null;
      googleSub?: string | null;
    };
  };
  project: Record<string, string | number | undefined> & {
    project_id: string;
    name?: string;
    line_group_id?: string;
    line_group_name?: string;
  };
  siteSheetId: string;
};

const TEST_LINE_GROUP_ID = process.env.DECISION_LINE_TEST_GROUP_ID || "C512b905da442874d3bcc318e02a731c9";

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Other";
}

function actor(context: RouteContext) {
  return {
    email: context.session.user.email || "",
    name: context.session.user.name || "",
    role: context.session.user.role || "",
    googleSub: context.session.user.googleSub || "",
  };
}

function isDecisionLineTestMode() {
  return process.env.DECISION_LINE_TEST_MODE !== "false";
}

function lineTargetFor(context: RouteContext) {
  if (isDecisionLineTestMode()) return TEST_LINE_GROUP_ID;
  return text(context.project.line_group_id) || TEST_LINE_GROUP_ID;
}

function normalizeDecision(row: CustomerDecisionRecord) {
  return {
    ...row,
    decision_status: row.decision_status || "ยังไม่ถึงเวลา",
    evidence_files_json: row.evidence_files_json || "[]",
    active: row.active || "TRUE",
  };
}

function decodeDataUrl(dataUrl?: string) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function parseUploads(value: unknown) {
  return (Array.isArray(value) ? value : []) as CustomerDecisionUploadPayload[];
}

async function getDecisionRootFolder(context: RouteContext) {
  const rootFolderId = String(context.project.drive_folder_id || "").trim();
  if (!rootFolderId) return null;
  const decisionRoot = await findOrCreateFolder("Customer Decisions", rootFolderId);
  return decisionRoot.id || rootFolderId;
}

async function getDecisionFolder(context: RouteContext, decisionId: string) {
  const rootFolderId = await getDecisionRootFolder(context);
  if (!rootFolderId) return null;
  const decisionFolder = await findOrCreateFolder(safeFolderName(decisionId), rootFolderId);
  return decisionFolder.id || rootFolderId;
}

async function uploadDecisionFiles(context: RouteContext, decisionId: string, uploads: CustomerDecisionUploadPayload[]) {
  const files = uploads.filter((file) => file?.dataUrl && file.name).slice(0, 10);
  if (files.length === 0) return [];

  const decisionFolderId = await getDecisionFolder(context, decisionId);
  if (!decisionFolderId) throw new Error("Project Drive folder is not configured");
  const targetFolder = await findOrCreateFolder("Evidence", decisionFolderId);
  const folderId = targetFolder.id || decisionFolderId;

  const uploaded = await Promise.all(files.map(async (file) => {
    const decoded = decodeDataUrl(file.dataUrl);
    if (!decoded || !file.name) return null;
    const uploadedFile = await uploadFile(
      `${Date.now()}-${safeFolderName(file.name)}`,
      file.type || decoded.mimeType || "application/octet-stream",
      decoded.buffer,
      folderId
    );
    return {
      file_id: uploadedFile.id || "",
      file_name: file.name,
      file_url: uploadedFile.webViewLink || uploadedFile.webContentLink || "",
      mime_type: file.type || decoded.mimeType || "application/octet-stream",
    };
  }));

  return uploaded.filter((file): file is NonNullable<typeof file> => Boolean(file));
}

async function attachEvidenceDataUrls(decision: CustomerDecisionRecord) {
  const evidenceFiles = parseDecisionEvidenceFiles(decision.evidence_files_json);
  const hydrated = await Promise.all(evidenceFiles.map(async (file) => {
    if (!file.file_id || !String(file.mime_type || "").startsWith("image/")) return file;
    try {
      const downloaded = await downloadFile(file.file_id);
      const mimeType = downloaded.mimeType || file.mime_type || "image/jpeg";
      return {
        ...file,
        mime_type: mimeType,
        data_url: `data:${mimeType};base64,${downloaded.buffer.toString("base64")}`,
      };
    } catch (error) {
      console.warn(`Failed to embed decision evidence ${file.file_id}:`, error);
      return file;
    }
  }));

  return {
    ...decision,
    evidence_files_json: safeJsonStringify(hydrated),
  };
}

async function getRows(context: RouteContext) {
  return await findAll("Customer_Decisions", context.siteSheetId) as unknown as CustomerDecisionRecord[];
}

async function seedDefaultRows(context: RouteContext) {
  const projectId = context.project.project_id;
  await Promise.all(DEFAULT_CUSTOMER_DECISIONS.map((item, index) => insert("Customer_Decisions", {
    decision_id: createCustomerDecisionId(),
    project_id: projectId,
    document_no: "",
    phase: item.phase,
    title: item.title,
    decision_before: item.decision_before,
    decision_status: item.decision_status,
    impact_if_changed: item.impact_if_changed,
    result_note: "",
    evidence_note: "",
    evidence_files_json: "[]",
    notified_at: "",
    notified_by_name: "",
    notified_by_email: "",
    line_group_id: "",
    line_message: "",
    decided_at: "",
    decided_by: "",
    pdf_file_id: "",
    pdf_url: "",
    issued_at: "",
    issued_by_name: "",
    issued_by_email: "",
    order_index: String(index + 1),
    active: "TRUE",
  }, context.siteSheetId)));
}

async function getDecisionData(context: RouteContext) {
  let rows = await getRows(context);
  const projectRows = rows.filter((row) => row.project_id === context.project.project_id);

  if (projectRows.length === 0) {
    await seedDefaultRows(context);
    rows = await getRows(context);
  }

  return rows
    .filter((row) => row.project_id === context.project.project_id && row.active !== "FALSE")
    .map(normalizeDecision)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
}

async function handleSave(body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const payload = {
    project_id: context.project.project_id,
    phase: text(body.phase),
    title: text(body.title),
    decision_before: text(body.decision_before),
    decision_status: text(body.decision_status) || "ยังไม่ถึงเวลา",
    impact_if_changed: text(body.impact_if_changed),
    result_note: text(body.result_note),
    evidence_note: text(body.evidence_note),
    decided_at: text(body.decided_at),
    decided_by: text(body.decided_by),
    order_index: text(body.order_index),
    active: "TRUE",
  };

  if (!payload.phase || !payload.title || !payload.decision_before || !payload.impact_if_changed) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลรายการตัดสินใจให้ครบ" }, { status: 400 });
  }

  if (decisionId) {
    const rows = await getRows(context);
    const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
    if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 404 });
    const nextEvidenceFiles = [
      ...parseDecisionEvidenceFiles(current.evidence_files_json),
      ...await uploadDecisionFiles(context, decisionId, parseUploads(body.evidence_uploads)),
    ];
    const patch = {
      ...payload,
      evidence_files_json: safeJsonStringify(nextEvidenceFiles),
    };

    await update("Customer_Decisions", Number(current._rowIndex), patch, context.siteSheetId);
    await writeAuditLog({
      actor: actor(context),
      projectId: context.project.project_id,
      module: "customer_decisions",
      action: "updated",
      targetId: decisionId,
      summary: `แก้ไขรายการต้องตัดสินใจ: ${payload.title}`,
      before: current,
      after: patch,
    });

    return NextResponse.json({ success: true });
  }

  const nextRows = await getDecisionData(context);
  const createdId = createCustomerDecisionId();
  const nextEvidenceFiles = await uploadDecisionFiles(context, createdId, parseUploads(body.evidence_uploads));
  const created = {
    decision_id: createdId,
    ...payload,
    document_no: "",
    evidence_files_json: safeJsonStringify(nextEvidenceFiles),
    pdf_file_id: "",
    pdf_url: "",
    issued_at: "",
    issued_by_name: "",
    issued_by_email: "",
    order_index: payload.order_index || String(nextRows.length + 1),
  };
  await insert("Customer_Decisions", created, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "created",
    targetId: created.decision_id,
    summary: `เพิ่มรายการต้องตัดสินใจ: ${created.title}`,
    after: created,
  });

  return NextResponse.json({ success: true, data: created });
}

async function handleDelete(body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการลบ" }, { status: 404 });

  await update("Customer_Decisions", Number(current._rowIndex), { active: "FALSE" }, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "deleted",
    targetId: decisionId,
    summary: `ลบรายการต้องตัดสินใจ: ${current.title || decisionId}`,
    before: current,
    after: { active: "FALSE" },
  });

  return NextResponse.json({ success: true });
}

async function handleNotify(req: Request, body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการแจ้งเตือน" }, { status: 404 });

  const message = buildCustomerDecisionLineMessage({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    phase: text(current.phase),
    title: text(current.title),
    decisionBefore: text(current.decision_before),
    impactIfChanged: text(current.impact_if_changed),
  });
  const evidenceFiles = parseDecisionEvidenceFiles(current.evidence_files_json);
  const firstEvidenceUrl = text(evidenceFiles.find((file) => file.file_url)?.file_url);
  const flexMessage = buildCustomerDecisionLineFlex({
    projectName: text(context.project.name),
    projectId: context.project.project_id,
    documentNo: text(current.document_no),
    phase: text(current.phase),
    status: text(current.decision_status),
    title: text(current.title),
    decisionBefore: text(current.decision_before),
    impactIfChanged: text(current.impact_if_changed),
    pdfUrl: text(current.pdf_url),
    evidenceUrl: firstEvidenceUrl,
    evidenceCount: evidenceFiles.length,
  });
  const targetLineGroupId = lineTargetFor(context);

  await sendLineMessages([flexMessage], targetLineGroupId);

  const patch = {
    decision_status: "ส่งแจ้งเตือนแล้ว",
    notified_at: new Date().toISOString(),
    notified_by_name: context.session.user.name || "",
    notified_by_email: context.session.user.email || "",
    line_group_id: targetLineGroupId,
    line_message: message,
  };

  await update("Customer_Decisions", Number(current._rowIndex), patch, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "line_notified",
    targetId: decisionId,
    summary: `ส่ง LINE แจ้งเตือนรายการต้องตัดสินใจ: ${current.title || decisionId}`,
    before: current,
    after: { ...patch, test_mode: isDecisionLineTestMode() },
  });

  return NextResponse.json({ success: true, data: { test_mode: isDecisionLineTestMode(), line_group_id: targetLineGroupId } });
}

async function handleIssuePdf(req: Request, body: Record<string, unknown>, context: RouteContext) {
  const decisionId = text(body.decision_id);
  const rows = await getRows(context);
  const current = rows.find((row) => row.decision_id === decisionId && row.project_id === context.project.project_id);
  if (!current?._rowIndex) return NextResponse.json({ error: "ไม่พบรายการที่ต้องการออก PDF" }, { status: 404 });

  const decisionFolderId = await getDecisionFolder(context, decisionId);
  if (!decisionFolderId) return NextResponse.json({ error: "Project Drive folder is not configured" }, { status: 400 });

  const documentNo = text(current.document_no) || createCustomerDecisionDocumentNo(context.project.project_id, rows);
  const issuedAt = new Date().toISOString();
  const decisionForPdf = await attachEvidenceDataUrls({
    ...current,
    document_no: documentNo,
    issued_at: issuedAt,
    issued_by_name: context.session.user.name || "",
    issued_by_email: context.session.user.email || "",
  });
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const html = buildCustomerDecisionPdfHtml({
    decision: decisionForPdf,
    project: context.project,
    logoUrl: `${origin}/logo.png`,
  });

  const pdfFolder = await findOrCreateFolder("PDF", decisionFolderId);
  const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolder.id || decisionFolderId);
  const pdfUrl = uploaded.webViewLink || uploaded.webContentLink || "";
  const patch = {
    document_no: documentNo,
    pdf_file_id: uploaded.id || "",
    pdf_url: pdfUrl,
    issued_at: issuedAt,
    issued_by_name: context.session.user.name || "",
    issued_by_email: context.session.user.email || "",
  };

  await update("Customer_Decisions", Number(current._rowIndex), patch, context.siteSheetId);
  await writeAuditLog({
    actor: actor(context),
    projectId: context.project.project_id,
    module: "customer_decisions",
    action: "pdf_issued",
    targetId: decisionId,
    summary: `ออก PDF รายการต้องตัดสินใจ ${documentNo}`,
    before: current,
    after: { ...patch, pdf_url: pdfUrl },
  });

  return NextResponse.json({ success: true, data: { ...current, ...patch } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    const data = await getDecisionData(routeContext);

    return NextResponse.json({
      success: true,
      project: routeContext.project,
      data,
      line: {
        test_mode: isDecisionLineTestMode(),
        target_group_id: lineTargetFor(routeContext),
        target_group_name: isDecisionLineTestMode() ? "Decision LINE Test Group" : text(routeContext.project.line_group_name),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const routeContext = context as RouteContext;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action) || "save";

    if (action === "save") return handleSave(body, routeContext);
    if (action === "delete") return handleDelete(body, routeContext);
    if (action === "notify_line") return handleNotify(req, body, routeContext);
    if (action === "issue_pdf") return handleIssuePdf(req, body, routeContext);

    return NextResponse.json({ error: "ไม่รู้จัก action นี้" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
