import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import {
  buildDefectListAcknowledgedLineFlex,
  todayBangkok,
  type DefectItemRecord,
  type DefectRoundRecord,
} from "@/lib/defects";
import { sendLineMessages } from "@/lib/line";
import { findAll, findAllMaster, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { ensureMasterSchema, ensureSchema } from "@/lib/sheetsSetup";
import { makeId } from "@/lib/siteApi";
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
  const [rounds, items] = await Promise.all([
    findAll("Defect_Rounds", siteSheetId) as unknown as Promise<DefectRoundRecord[]>,
    findAll("Defect_Items", siteSheetId) as unknown as Promise<DefectItemRecord[]>,
  ]);
  const round = rounds.find((row) => row.project_id === project.project_id && text(row.approval_token) === token);
  if (!round?._rowIndex) return { error: "ลิงก์รับทราบรายการไม่ถูกต้องหรือหมดอายุ", status: 404 as const };

  return {
    project,
    siteSheetId,
    round,
    items: items
      .filter((row) => row.project_id === project.project_id && row.round_id === round.round_id)
      .sort((a, b) => Number(a.item_no || 0) - Number(b.item_no || 0)),
  };
}

function publicPayload(project: PublicProject, round: DefectRoundRecord, items: DefectItemRecord[]) {
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
      item_count: round.item_count || items.length,
      open_count: round.open_count || "",
      acknowledged_by: round.acknowledged_by || "",
      acknowledged_date: round.acknowledged_date || "",
      acknowledgement_note: round.acknowledgement_note || "",
      locked_at: round.locked_at || "",
      pdf_url: round.pdf_url || "",
    },
    items: items.map((item) => ({
      item_id: item.item_id,
      item_no: item.item_no || "",
      zone: item.zone || "",
      discipline: item.discipline || "",
      work_category: item.work_category || "",
      description: item.description || "",
      cause: item.cause || "",
      status: item.status || "",
      owner: item.owner || "",
      due_date: item.due_date || "",
      remarks: item.remarks || "",
    })),
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
    return NextResponse.json({ success: true, data: publicPayload(context.project, context.round, context.items) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปิดรายการรับทราบไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const { projectId, token } = await params;
    const context = await getPublicContext(decodeURIComponent(projectId), decodeURIComponent(token));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const acknowledgedBy = text(body.acknowledged_by) || text(context.project.client) || "ลูกค้า";
    const acknowledgementNote = text(body.acknowledgement_note) || "ลูกค้ารับทราบรายการ Defect แล้ว";
    const acknowledgedDate = todayBangkok();
    const lockedAt = new Date().toISOString();
    const patch = {
      status: "in_progress",
      acknowledged_by: acknowledgedBy,
      acknowledged_channel: "Customer Acknowledgement Link",
      acknowledged_date: acknowledgedDate,
      acknowledgement_note: acknowledgementNote,
      locked_at: lockedAt,
    };

    if (!["acknowledged", "closed"].includes(text(context.round.status)) && !text(context.round.locked_at)) {
      await update(
        "Defect_Rounds",
        context.round.round_id || context.round._rowIndex || "",
        patch,
        context.siteSheetId,
        await getFallbackRowIndex(context.siteSheetId, context.round)
      );
      await insert("Defect_Evidence", {
        evidence_id: makeId("DFE"),
        round_id: context.round.round_id,
        project_id: context.project.project_id,
        evidence_type: "customer_acknowledgement",
        channel: "Customer Link",
        acknowledged_by: acknowledgedBy,
        acknowledged_date: acknowledgedDate,
        file_name: "Customer acknowledgement link",
        file_id: "",
        file_url: "",
        mime_type: "",
        notes: acknowledgementNote,
        uploaded_by_name: acknowledgedBy,
        uploaded_by_email: "",
      }, context.siteSheetId);
      await writeAuditLog({
        actor: { name: acknowledgedBy, role: "Customer" },
        projectId: context.project.project_id,
        module: "defects",
        action: "customer_acknowledged_defect_list_via_link",
        targetId: context.round.round_id,
        summary: `ลูกค้ารับทราบรายการ Defect: ${context.round.document_no || context.round.round_id}`,
        before: context.round,
        after: patch,
      });

      const lineGroupId = text(context.round.line_group_id) || text(context.project.line_group_id);
      if (lineGroupId) {
        await sendLineMessages([buildDefectListAcknowledgedLineFlex({
          projectName: text(context.round.project_name || context.project.name),
          projectId: context.project.project_id,
          documentNo: text(context.round.document_no),
          title: text(context.round.title || "Defect list"),
          acknowledgedBy,
          acknowledgedAt: lockedAt,
          pdfUrl: text(context.round.pdf_url),
        })], lineGroupId).catch((error) => console.warn("Failed to notify LINE after defect acknowledgement:", error));
      }
    }

    return NextResponse.json({
      success: true,
      data: publicPayload(context.project, { ...context.round, ...patch }, context.items),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกรับทราบรายการไม่สำเร็จ" }, { status: 500 });
  }
}
