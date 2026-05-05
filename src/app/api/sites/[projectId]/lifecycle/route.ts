import { NextResponse } from "next/server";
import { findAll, insert, update } from "@/lib/sheetsCrud";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";

const lifecycleFields = [
  "current_status",
  "design_start_date",
  "design_done_date",
  "contract_signed_date",
  "drawing_start_date",
  "drawing_done_date",
  "permit_submitted_date",
  "permit_received_date",
  "permit_expiry_date",
  "temporary_electric_install_date",
  "temporary_electric_expiry_date",
  "temporary_water_install_date",
  "temporary_water_expiry_date",
  "demolition_waiting_date",
  "demolition_done_date",
  "construction_start_date",
  "construction_end_date",
  "notes",
];

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const rows = await findAll("Project_Lifecycle", context.siteSheetId);
    const lifecycle = rows.find((row) => row.project_id === context.project.project_id) || null;

    return NextResponse.json({ success: true, data: lifecycle, project: context.project });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId), true);
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const body = await req.json();
    const rows = await findAll("Project_Lifecycle", context.siteSheetId);
    const current = rows.find((row) => row.project_id === context.project.project_id);
    const patch: Record<string, string> = {};

    lifecycleFields.forEach((field) => {
      if (body[field] !== undefined) patch[field] = String(body[field] || "");
    });

    if (current?._rowIndex) {
      await update("Project_Lifecycle", Number(current._rowIndex), patch, context.siteSheetId);
      return NextResponse.json({ success: true, data: { ...current, ...patch } });
    }

    const data = {
      lifecycle_id: makeId("LFC"),
      project_id: context.project.project_id,
      current_status: "design",
      ...patch,
    };
    const result = await insert("Project_Lifecycle", data, context.siteSheetId);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
