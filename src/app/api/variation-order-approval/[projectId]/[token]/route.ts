import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { findOrCreateFolder, uploadFile } from "@/lib/drive";
import { sendLineMessages } from "@/lib/line";
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer";
import { getPublicAppOrigin } from "@/lib/publicUrl";
import { findAll, findAllMaster, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import {
  asVoItemRowType,
  asVoType,
  buildVoApprovedLineFlex,
  buildVoReviewResultLineFlex,
  calculateVoTotals,
  numberValue,
  safeJsonParse,
  safeJsonStringify,
  resolveVoItemChangeType,
  signedVoItemAmount,
  type VoItemRecord,
  type VoRecord,
} from "@/lib/variationOrders";
import { buildApprovalCertificateHtml } from "@/lib/variationOrderDocuments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

type PublicProject = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  client?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
};

type SheetRecord = Record<string, string | number | undefined>;
type PublicItemDecision = {
  item_key: string;
  item_no: string | number;
  description: string;
  amount: string | number;
  change_type?: "add" | "deduct";
  decision?: "approved" | "rejected";
  note: string;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Other";
}

async function getPublicContext(projectId: string, token: string) {
  if (!isSupabaseBackend()) await ensureMasterSchema();
  const projects = await findAllMaster("Projects") as unknown as PublicProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) return { error: "ไม่พบโครงการ", status: 404 as const };

  const siteSheetId = text(project.site_sheet_id);
  if (!siteSheetId) return { error: "โครงการยังไม่ได้ตั้งค่า Site Sheet", status: 400 as const };

  const schemaResult = isSupabaseBackend() ? null : await ensureSchema(siteSheetId);
  const [voRows, backendItemRows, documentRows] = await Promise.all([
    findAll("Variation_Orders", siteSheetId) as Promise<VoRecord[]>,
    findAll("VO_Items", siteSheetId) as Promise<VoItemRecord[]>,
    findAll("VO_Documents", siteSheetId) as Promise<SheetRecord[]>,
  ]);
  const vo = voRows.find((row) => row.project_id === project.project_id && text(row.approval_token) === token);
  if (!vo?._rowIndex) return { error: "ลิงก์อนุมัติไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  const backendItems = backendItemRows
    .filter((item) => item.project_id === project.project_id && item.vo_id === vo.vo_id)
    .sort((a, b) => numberValue(a.sort_order || a.item_no) - numberValue(b.sort_order || b.item_no));
  let items = backendItems;
  if (schemaResult?.success) {
    const sheetItems = (await findAllRaw("VO_Items", siteSheetId) as VoItemRecord[])
      .filter((item) => item.project_id === project.project_id && item.vo_id === vo.vo_id)
      .sort((a, b) => numberValue(a.sort_order || a.item_no) - numberValue(b.sort_order || b.item_no));
    if (sheetItems.length > 0) items = sheetItems;
  } else if (schemaResult && items.length === 0) {
    return { error: "กำลังปรับโครงสร้างรายการ VO กรุณารีเฟรชอีกครั้ง", status: 503 as const };
  }
  const documents = documentRows.filter((document) => document.project_id === project.project_id && document.vo_id === vo.vo_id);
  return { project, siteSheetId, vo, items, documents };
}

async function getFallbackRowIndex(siteSheetId: string, vo: VoRecord) {
  const numericRowIndex = Number(vo._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("Variation_Orders", siteSheetId);
  return rawRows.find((row) => row.vo_id === vo.vo_id)?._rowIndex;
}

function latestPdf(documents: SheetRecord[], type?: string) {
  return documents
    .filter((document) => !type || document.document_type === type)
    .reverse()
    .find((document) => text(document.pdf_url));
}

function rejectionReason(value: unknown) {
  try {
    const rejection = JSON.parse(text(value)) as { reason?: unknown };
    return text(rejection.reason);
  } catch {
    return "";
  }
}

function getItemKey(item: VoItemRecord, index: number) {
  return `${text(item.item_no || index + 1)}:${text(item.description)}`;
}

function getDecisionItems(items: VoItemRecord[]) {
  const groupItems = items.filter((item) => asVoItemRowType(text(item.row_type)) === "group");
  if (groupItems.length === 0) {
    return items.filter((item) => asVoItemRowType(text(item.row_type)) !== "note" && text(item.description));
  }

  return items.filter((item) => {
    const rowType = asVoItemRowType(text(item.row_type));
    if (!text(item.description) || rowType === "note") return false;
    if (rowType === "detail") return true;
    if (rowType !== "group") return false;
    return !items.some((candidate) => (
      asVoItemRowType(text(candidate.row_type)) === "detail" &&
      text(candidate.parent_item_no) === text(item.item_no) &&
      text(candidate.description)
    ));
  });
}

function storedItemDecisions(vo: VoRecord) {
  const evidence = safeJsonParse<Record<string, unknown>>(text(vo.evidence_json), {});
  const rejection = safeJsonParse<Record<string, unknown>>(text(vo.rejection_json), {});
  const decisions = Array.isArray(evidence.item_decisions)
    ? evidence.item_decisions
    : Array.isArray(rejection.item_decisions)
      ? rejection.item_decisions
      : [];
  return decisions as PublicItemDecision[];
}

function normalizeSubmittedItemDecisions(value: unknown, items: VoItemRecord[], vo: VoRecord) {
  const submitted = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  const defaultToApproved = submitted.length === 0;
  const decisionItems = getDecisionItems(items);

  return decisionItems.map((item, index) => {
    const key = getItemKey(item, index);
    const itemNo = item.item_no || index + 1;
    const match = submitted.find((decision) => (
      text(decision.item_key) === key ||
      (text(decision.item_no) === text(itemNo) && text(decision.description) === text(item.description))
    ));
    const decisionText = text(match?.decision);
    const decision = decisionText === "approved" || decisionText === "rejected"
      ? decisionText
      : defaultToApproved
        ? "approved"
        : undefined;

    return {
      item_key: key,
      item_no: itemNo,
      description: text(item.description),
      amount: signedVoItemAmount(item, items, asVoType(String(vo.vo_type || "VO+"))),
      change_type: resolveVoItemChangeType(item, items, asVoType(String(vo.vo_type || "VO+"))),
      decision,
      note: text(match?.note),
    };
  }) as PublicItemDecision[];
}

function decisionSummary(decisions: PublicItemDecision[]) {
  const approved = decisions.filter((item) => item.decision === "approved");
  const rejected = decisions.filter((item) => item.decision === "rejected");
  return {
    total_items: decisions.length,
    approved_items: approved.length,
    rejected_items: rejected.length,
    approved_amount: approved.reduce((sum, item) => sum + numberValue(item.amount), 0),
    rejected_amount: rejected.reduce((sum, item) => sum + numberValue(item.amount), 0),
  };
}

function publicPayload(project: PublicProject, vo: VoRecord, items: VoItemRecord[], documents: SheetRecord[]) {
  const voSheet = latestPdf(documents, "vo-sheet") || latestPdf(documents);
  const approvalPdf = latestPdf(documents, "approval");
  const attachments = documents
    .filter((document) => document.document_type === "supporting-evidence" && text(document.pdf_url))
    .map((document) => ({
      id: text(document.document_id),
      name: text(document.title) || text(document.document_no) || "หลักฐานแนบ",
      url: text(document.pdf_url),
    }));
  const calculation = calculateVoTotals({
    items,
    defaultVoType: asVoType(String(vo.vo_type || "VO+")),
    tax: { vat_exempt: true },
  });
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    vo: {
      vo_id: vo.vo_id,
      vo_type: vo.vo_type || "",
      title: vo.title || "",
      description: vo.description || "",
      status: vo.status || "pending_approval",
      client_name: vo.client_name || project.client || "",
      approval_deadline: vo.approval_deadline || "",
      grand_total: vo.grand_total || 0,
      net_payable: vo.net_payable || vo.grand_total || 0,
      increase_total: calculation.increase_total,
      decrease_total: calculation.decrease_total,
      net_change: calculation.net_change,
      extension_days: vo.extension_days || 0,
      customer_approved_at: vo.customer_approved_at || "",
      customer_approved_by: vo.customer_approved_by || "",
      customer_approval_note: vo.customer_approval_note || "",
      rejection_reason: rejectionReason(vo.rejection_json),
      pdf_url: text(voSheet?.pdf_url),
      approval_pdf_url: text(approvalPdf?.pdf_url),
      attachments,
      item_decisions: storedItemDecisions(vo),
      items: items.map((item) => {
        const hasCostBreakdown = text(item.material_unit_price) !== "" || text(item.labor_unit_price) !== "";
        return {
          item_no: item.item_no,
          sort_order: item.sort_order,
          row_type: asVoItemRowType(text(item.row_type)),
          change_type: resolveVoItemChangeType(item, items, asVoType(String(vo.vo_type || "VO+"))),
          parent_item_no: item.parent_item_no,
          description: item.description || "",
          unit: item.unit || "",
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          material_unit_price: hasCostBreakdown ? item.material_unit_price || 0 : 0,
          material_amount: hasCostBreakdown ? item.material_amount || 0 : 0,
          labor_unit_price: hasCostBreakdown ? item.labor_unit_price || 0 : item.unit_price || 0,
          labor_amount: hasCostBreakdown ? item.labor_amount || 0 : item.amount || 0,
          amount: item.amount || 0,
        };
      }),
    },
  };
}

async function getVoFolder(project: PublicProject, voId: string) {
  const rootFolderId = text(project.drive_folder_id);
  if (!rootFolderId) return null;
  const voRoot = await findOrCreateFolder("Variation Orders", rootFolderId);
  const voFolder = await findOrCreateFolder(safeFolderName(voId), voRoot.id || rootFolderId);
  return voFolder.id || null;
}

async function insertApprovalDocument({
  project,
  siteSheetId,
  vo,
  items,
  approvedBy,
}: {
  project: PublicProject;
  siteSheetId: string;
  vo: VoRecord;
  items: VoItemRecord[];
  approvedBy: string;
}) {
  const documentNo = `${vo.vo_id}-APPROVAL`;
  const html = buildApprovalCertificateHtml({ vo, items, project });
  let pdfFileId = "";
  let pdfUrl = "";
  const voFolderId = await getVoFolder(project, vo.vo_id);
  try {
    if (voFolderId) {
      const pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
      const uploaded = await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, voFolderId);
      pdfFileId = uploaded.id || "";
      pdfUrl = uploaded.webViewLink || uploaded.webContentLink || "";
    }
  } catch (error) {
    console.warn(`Failed to render/upload VO approval PDF ${documentNo}:`, error);
  }

  await insert("VO_Documents", {
    document_id: `VOD-${Date.now()}`,
    vo_id: vo.vo_id,
    project_id: project.project_id,
    document_type: "approval",
    document_no: documentNo,
    title: "หนังสือรับรองการอนุมัติงานเพิ่ม-ลด",
    html_snapshot: html,
    pdf_file_id: pdfFileId,
    pdf_url: pdfUrl,
    created_by_name: approvedBy,
    created_by_email: "",
  }, siteSheetId);

  return { html, pdfUrl, pdfFileId };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status, headers: NO_STORE_HEADERS });
    return NextResponse.json(
      { success: true, data: publicPayload(context.project, context.vo, context.items, context.documents) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "เปิดรายการอนุมัติ VO ไม่สำเร็จ" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const approvedBy = text(body.approved_by) || text(context.vo.client_name) || text(context.project.client) || "ลูกค้า";
    const submittedApprovalNote = text(body.approval_note);
    const approvalNote = submittedApprovalNote || "ลูกค้ากดอนุมัติผ่านลิงก์ LINE";
    const approvedAt = new Date().toISOString();
    const currentStatus = text(context.vo.status);
    const itemDecisions = normalizeSubmittedItemDecisions(body.item_decisions, context.items, context.vo);
    const summary = decisionSummary(itemDecisions);

    if (currentStatus === "approved") {
      return NextResponse.json({ success: true, data: publicPayload(context.project, context.vo, context.items, context.documents) });
    }
    if (currentStatus !== "pending_approval") {
      return NextResponse.json({ error: "VO นี้ไม่ได้อยู่ในสถานะรออนุมัติ" }, { status: 400 });
    }
    if (itemDecisions.some((item) => item.decision !== "approved" && item.decision !== "rejected")) {
      return NextResponse.json({ error: "กรุณาเลือกอนุมัติหรือไม่อนุมัติให้ครบทุกรายการ" }, { status: 400 });
    }
    if (summary.rejected_items > 0 && !submittedApprovalNote) {
      return NextResponse.json({ error: "กรุณาระบุหมายเหตุรวมเมื่อมีรายการที่ไม่อนุมัติ" }, { status: 400 });
    }

    const evidencePayload = {
      method: "customer_public_link",
      client_approved_by: approvedBy,
      client_approved_email: "",
      client_approved_date: approvedAt.slice(0, 10),
      channel: "LINE approval link",
      evidence_type: "digital_consent",
      evidence_description: approvalNote,
      digital_consent: true,
      approved_at: approvedAt,
      item_decisions: itemDecisions,
      item_decision_summary: summary,
    };
    if (summary.rejected_items > 0) {
      const rejectionPayload = {
        rejected_by: approvedBy,
        rejected_email: "",
        rejected_date: approvedAt.slice(0, 10),
        rejected_at: approvedAt,
        channel: "LINE approval link",
        reason: `ลูกค้าไม่อนุมัติ ${summary.rejected_items} จาก ${summary.total_items} รายการ กรุณาตรวจหมายเหตุรวมและออก VO ฉบับแก้ไข`,
        note: approvalNote,
        item_decisions: itemDecisions,
        item_decision_summary: summary,
      };
      const patch = {
        status: "rejected",
        evidence_json: safeJsonStringify(evidencePayload),
        rejection_json: safeJsonStringify(rejectionPayload),
        task_plan_status: "",
        customer_approved_at: approvedAt,
        customer_approved_by: approvedBy,
        customer_approval_note: approvalNote,
      };
      const nextVo = { ...context.vo, ...patch } as VoRecord;
      await update(
        "Variation_Orders",
        context.vo.vo_id || context.vo._rowIndex || "",
        patch,
        context.siteSheetId,
        () => getFallbackRowIndex(context.siteSheetId, context.vo)
      );
      await writeAuditLog({
        actor: { name: approvedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "variation_orders",
        action: "customer_rejected_items_via_link",
        targetId: context.vo.vo_id,
        summary: `ลูกค้าส่งผลพิจารณา VO มีรายการไม่อนุมัติ: ${context.vo.vo_id}`,
        before: context.vo,
        after: patch,
      });

      const lineGroupId = text(context.vo.line_group_id);
      if (lineGroupId) {
        const publicOrigin = getPublicAppOrigin({ request: req }) || new URL(req.url).origin;
        const reviewUrl = new URL(
          `/variation-order-approval/${encodeURIComponent(context.project.project_id)}/${encodeURIComponent(token)}`,
          publicOrigin,
        ).toString();
        const dashboardUrl = new URL(
          `/dashboard/sites/${encodeURIComponent(context.project.project_id)}/variation-orders`,
          publicOrigin,
        ).toString();
        await sendLineMessages([buildVoReviewResultLineFlex({
          projectName: text(context.project.name),
          projectId: context.project.project_id,
          voId: context.vo.vo_id,
          title: text(context.vo.title),
          approvedItems: summary.approved_items,
          rejectedItems: summary.rejected_items,
          approvedAmount: summary.approved_amount,
          reviewedBy: approvedBy,
          reviewedAt: approvedAt,
          note: approvalNote,
          reviewUrl,
          dashboardUrl,
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after VO item rejection:", error));
      }

      return NextResponse.json({
        success: true,
        data: publicPayload(context.project, nextVo, context.items, context.documents),
      });
    }

    const patch = {
      status: "approved",
      evidence_json: safeJsonStringify(evidencePayload),
      task_plan_status: "pending_plan",
      customer_approved_at: approvedAt,
      customer_approved_by: approvedBy,
      customer_approval_note: approvalNote,
    };

    const nextVo = { ...context.vo, ...patch } as VoRecord;
    await update(
      "Variation_Orders",
      context.vo.vo_id || context.vo._rowIndex || "",
      patch,
      context.siteSheetId,
      () => getFallbackRowIndex(context.siteSheetId, context.vo)
    );
    const approvalDocument = await insertApprovalDocument({
      project: context.project,
      siteSheetId: context.siteSheetId,
      vo: nextVo,
      items: context.items,
      approvedBy,
    });
    const documents = [
      ...context.documents,
      { document_type: "approval", pdf_url: approvalDocument.pdfUrl, pdf_file_id: approvalDocument.pdfFileId },
    ];

    await writeAuditLog({
      actor: { name: approvedBy, role: "Customer" },
      projectId: context.project.project_id,
      module: "variation_orders",
      action: "customer_approved_via_link",
      targetId: context.vo.vo_id,
      summary: `ลูกค้าอนุมัติ VO ผ่านลิงก์ LINE: ${context.vo.vo_id}`,
      before: context.vo,
      after: patch,
    });

    const lineGroupId = text(context.vo.line_group_id);
    if (lineGroupId) {
      await sendLineMessages([buildVoApprovedLineFlex({
        projectName: text(context.project.name),
        projectId: context.project.project_id,
        voId: context.vo.vo_id,
        title: text(context.vo.title),
        approvedBy,
        approvedAt,
        total: context.vo.grand_total,
        pdfUrl: approvalDocument.pdfUrl || text(latestPdf(context.documents, "vo-sheet")?.pdf_url),
      })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after VO approval:", error));
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, nextVo, context.items, documents),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกอนุมัติ VO ไม่สำเร็จ" }, { status: 500 });
  }
}
