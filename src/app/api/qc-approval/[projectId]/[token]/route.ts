import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { sendLineMessages } from "@/lib/line";
import { buildQcApprovedLineFlex, getQcApprovalReadiness, parseQcEvidence, parseQcItems, type QcChecklistRecord } from "@/lib/qcChecklists";
import { findAll, findAllMaster, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";

type PublicProject = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  client?: string;
  site_sheet_id?: string;
};

function text(value: unknown) {
  return String(value || "").trim();
}

async function getPublicContext(projectId: string, token: string) {
  await ensureMasterSchema();
  const projects = await findAllMaster("Projects") as unknown as PublicProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) return { error: "ไม่พบโครงการ", status: 404 as const };

  const siteSheetId = text(project.site_sheet_id);
  if (!siteSheetId) return { error: "โครงการยังไม่ได้ตั้งค่า Site Sheet", status: 400 as const };

  await ensureSchema(siteSheetId);
  const rows = await findAll("QC_Checklists", siteSheetId) as unknown as QcChecklistRecord[];
  const checklist = rows.find((row) => row.project_id === project.project_id && row.active !== "FALSE" && text(row.approval_token) === token);
  if (!checklist?._rowIndex) return { error: "ลิงก์อนุมัติไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  return { project, siteSheetId, checklist };
}

function publicPayload(project: PublicProject, checklist: QcChecklistRecord) {
  const items = parseQcItems(checklist.items_json);
  const evidence = parseQcEvidence(checklist.evidence_files_json);
  const readiness = getQcApprovalReadiness(items);
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    checklist: {
      qc_id: checklist.qc_id,
      document_no: checklist.document_no || "",
      category: checklist.category || "",
      phase: checklist.phase || "",
      title: checklist.title || "",
      status: checklist.status || "sent_to_customer",
      approval_status: checklist.approval_status || "pending",
      inspection_date: checklist.inspection_date || "",
      inspected_by_name: checklist.inspected_by_name || "",
      customer_approved_at: checklist.customer_approved_at || "",
      customer_approved_by: checklist.customer_approved_by || "",
      customer_approval_note: checklist.customer_approval_note || "",
      pdf_url: checklist.pdf_url || "",
      evidence_count: evidence.length,
      can_approve: readiness.ready,
      approval_block_reason: readiness.ready ? "" : readiness.reason,
      items,
    },
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.checklist) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิดรายการอนุมัติไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const readiness = getQcApprovalReadiness(parseQcItems(context.checklist.items_json));
    if (!readiness.ready) return NextResponse.json({ error: readiness.reason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนลูกค้าอนุมัติ" }, { status: 400 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const approvedBy = text(body.customer_approved_by) || text(context.project.client) || "ลูกค้า";
    const approvedAt = new Date().toISOString();
    const patch = {
      status: "customer_approved",
      approval_status: "approved",
      customer_approved_at: approvedAt,
      customer_approved_by: approvedBy,
      customer_approval_note: text(body.customer_approval_note),
    };

    if (context.checklist.approval_status !== "approved") {
      await update("QC_Checklists", Number(context.checklist._rowIndex), patch, context.siteSheetId);
      await writeAuditLog({
        actor: { name: approvedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "qc_checklists",
        action: "customer_approved_via_link",
        targetId: context.checklist.qc_id,
        summary: `ลูกค้าอนุมัติ QC Checklist: ${context.checklist.title || context.checklist.qc_id}`,
        before: context.checklist,
        after: patch,
      });

      const lineGroupId = text(context.checklist.line_group_id);
      if (lineGroupId) {
        await sendLineMessages([buildQcApprovedLineFlex({
          projectName: text(context.project.name),
          projectId: context.project.project_id,
          documentNo: text(context.checklist.document_no),
          title: text(context.checklist.title),
          approvedBy,
          approvedAt,
          pdfUrl: text(context.checklist.pdf_url),
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after QC approval:", error));
      }
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, { ...context.checklist, ...patch }),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกอนุมัติไม่สำเร็จ" }, { status: 500 });
  }
}
