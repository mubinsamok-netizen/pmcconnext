import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { buildCustomerDecisionApprovedLineFlex, parseDecisionEvidenceFiles, type CustomerDecisionRecord } from "@/lib/customerDecisions";
import { sendLineMessages } from "@/lib/line";
import { findAll, findAllMaster, findAllRaw, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";

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
  if (!isSupabaseBackend()) await ensureMasterSchema();
  const projects = await findAllMaster("Projects") as unknown as PublicProject[];
  const project = projects.find((item) => item.project_id === projectId && item.active !== "FALSE");
  if (!project) return { error: "ไม่พบโครงการ", status: 404 as const };

  const siteSheetId = text(project.site_sheet_id);
  if (!siteSheetId) return { error: "โครงการยังไม่ได้ตั้งค่า Site Sheet", status: 400 as const };

  if (!isSupabaseBackend()) await ensureSchema(siteSheetId);
  const rows = await findAll("Customer_Decisions", siteSheetId) as unknown as CustomerDecisionRecord[];
  const decision = rows.find((row) => row.project_id === project.project_id && row.active !== "FALSE" && text(row.approval_token) === token);
  if (!decision?._rowIndex) return { error: "ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  return { project, siteSheetId, decision };
}

function publicPayload(project: PublicProject, decision: CustomerDecisionRecord) {
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    decision: {
      decision_id: decision.decision_id,
      document_no: decision.document_no || "",
      phase: decision.phase || "",
      title: decision.title || "",
      decision_before: decision.decision_before || "",
      decision_status: decision.decision_status || "รอลูกค้า",
      impact_if_changed: decision.impact_if_changed || "",
      result_note: decision.result_note || "",
      evidence_note: decision.evidence_note || "",
      evidence_count: parseDecisionEvidenceFiles(decision.evidence_files_json).length,
      decided_at: decision.decided_at || "",
      decided_by: decision.decided_by || "",
      pdf_url: decision.pdf_url || "",
    },
  };
}

async function getFallbackRowIndex(siteSheetId: string, decision: CustomerDecisionRecord) {
  const numericRowIndex = Number(decision._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("Customer_Decisions", siteSheetId);
  return rawRows.find((row) => row.decision_id === decision.decision_id)?._rowIndex;
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.decision) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิดรายการยืนยันไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const decidedBy = text(body.decided_by) || text(context.project.client) || "ลูกค้า";
    const resultNote = text(body.result_note) || "ลูกค้ายืนยันรายการนี้แล้ว";
    const decidedAt = new Date().toISOString();
    const patch = {
      decision_status: "ยืนยันแล้ว",
      decided_at: decidedAt,
      decided_by: decidedBy,
      result_note: resultNote,
    };

    if (context.decision.decision_status !== "ยืนยันแล้ว") {
      await update(
        "Customer_Decisions",
        context.decision.decision_id || context.decision._rowIndex || "",
        patch,
        context.siteSheetId,
        await getFallbackRowIndex(context.siteSheetId, context.decision)
      );
      await writeAuditLog({
        actor: { name: decidedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "customer_decisions",
        action: "customer_confirmed_via_link",
        targetId: context.decision.decision_id,
        summary: `ลูกค้ายืนยันรายการที่ต้องตัดสินใจ: ${context.decision.title || context.decision.decision_id}`,
        before: context.decision,
        after: patch,
      });

      const lineGroupId = text(context.decision.line_group_id);
      if (lineGroupId) {
        await sendLineMessages([buildCustomerDecisionApprovedLineFlex({
          projectName: text(context.project.name),
          projectId: context.project.project_id,
          documentNo: text(context.decision.document_no),
          title: text(context.decision.title),
          decidedBy,
          decidedAt,
          pdfUrl: text(context.decision.pdf_url),
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after customer decision approval:", error));
      }
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, { ...context.decision, ...patch }),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกยืนยันไม่สำเร็จ" }, { status: 500 });
  }
}
