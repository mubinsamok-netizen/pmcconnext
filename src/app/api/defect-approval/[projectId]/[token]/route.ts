import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { buildDefectApprovedLineFlex, type DefectRoundRecord } from "@/lib/defects";
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
  const rounds = await findAll("Defect_Rounds", siteSheetId) as unknown as DefectRoundRecord[];
  const round = rounds.find((row) => row.project_id === project.project_id && text(row.approval_token) === token);
  if (!round?._rowIndex) return { error: "ลิงก์รับงานแก้ไขไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  return { project, siteSheetId, round };
}

function publicPayload(project: PublicProject, round: DefectRoundRecord) {
  return {
    project: {
      project_id: project.project_id,
      name: project.name || project.project_id,
      client: project.client || "",
    },
    round: {
      round_id: round.round_id,
      document_no: round.document_no || "",
      title: round.title || "",
      status: round.status || "",
      inspection_date: round.inspection_date || "",
      inspector_name: round.inspector_name || "",
      item_count: round.item_count || "",
      open_count: round.open_count || "",
      acknowledged_by: round.acknowledged_by || "",
      acknowledged_date: round.acknowledged_date || "",
      acknowledgement_note: round.acknowledgement_note || "",
      pdf_url: round.tracking_pdf_url || round.pdf_url || "",
    },
  };
}

async function getFallbackRowIndex(siteSheetId: string, round: DefectRoundRecord) {
  const numericRowIndex = Number(round._rowIndex);
  if (Number.isFinite(numericRowIndex)) return numericRowIndex;

  const rawRows = await findAllRaw("Defect_Rounds", siteSheetId);
  return rawRows.find((row) => row.round_id === round.round_id)?._rowIndex;
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.round) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิดรายการรับงานแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const acknowledgedBy = text(body.acknowledged_by) || text(context.project.client) || "ลูกค้า";
    const acknowledgementNote = text(body.acknowledgement_note) || "ลูกค้ายอมรับงานแก้ไข Defect แล้ว";
    const acknowledgedAt = new Date().toISOString();
    const patch = {
      status: "acknowledged",
      acknowledged_by: acknowledgedBy,
      acknowledged_channel: "Customer Approval Link",
      acknowledged_date: acknowledgedAt,
      acknowledgement_note: acknowledgementNote,
      locked_at: acknowledgedAt,
    };

    if (context.round.status !== "acknowledged" && context.round.status !== "closed") {
      await update(
        "Defect_Rounds",
        context.round.round_id || context.round._rowIndex || "",
        patch,
        context.siteSheetId,
        await getFallbackRowIndex(context.siteSheetId, context.round)
      );
      await writeAuditLog({
        actor: { name: acknowledgedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "defects",
        action: "customer_accepted_defect_via_link",
        targetId: context.round.round_id,
        summary: `ลูกค้ายอมรับงานแก้ไข Defect: ${context.round.document_no || context.round.round_id}`,
        before: context.round,
        after: patch,
      });

      const lineGroupId = text(context.round.line_group_id);
      if (lineGroupId) {
        await sendLineMessages([buildDefectApprovedLineFlex({
          projectName: text(context.round.project_name || context.project.name),
          projectId: context.project.project_id,
          documentNo: text(context.round.document_no),
          title: text(context.round.title || "Defect close"),
          acknowledgedBy,
          acknowledgedAt,
          pdfUrl: text(context.round.tracking_pdf_url || context.round.pdf_url),
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after defect approval:", error));
      }
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, { ...context.round, ...patch }),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกรับงานแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}
