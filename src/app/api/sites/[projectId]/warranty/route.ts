import { NextResponse } from "next/server";
import { findAll, findAllRaw, insert, update } from "@/lib/sheetsCrud";
import { addYears, isIsoDate } from "@/lib/projectLifecycle";
import { getErrorMessage, getSiteApiContext, makeId } from "@/lib/siteApi";

const warrantyFields = [
  "handover_date",
  "structure_retention_date",
  "structure_expiry_date",
  "structure_notes",
  "roof_retention_date",
  "roof_expiry_date",
  "roof_notes",
  "architecture_retention_date",
  "architecture_expiry_date",
  "architecture_notes",
];

type WarrantyRow = Awaited<ReturnType<typeof findAll>>[number];

async function getFallbackRowIndex(siteSheetId: string, warrantyId: string, current?: WarrantyRow) {
  const currentRowIndex = Number(current?._rowIndex);
  if (Number.isFinite(currentRowIndex)) return currentRowIndex;

  const rawRows = await findAllRaw("Project_Warranty", siteSheetId);
  return rawRows.find((row) => row.warranty_id === warrantyId)?._rowIndex;
}

function withCalculatedExpiry(patch: Record<string, string>) {
  const handoverDate = patch.handover_date || "";
  if (!isIsoDate(handoverDate)) return patch;

  return {
    ...patch,
    structure_expiry_date: patch.structure_expiry_date || addYears(handoverDate, 20),
    roof_expiry_date: patch.roof_expiry_date || addYears(handoverDate, 5),
    architecture_expiry_date: patch.architecture_expiry_date || addYears(handoverDate, 1),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const context = await getSiteApiContext(decodeURIComponent(projectId));
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const rows = await findAll("Project_Warranty", context.siteSheetId);
    const warranty = rows.find((row) => row.project_id === context.project.project_id) || null;

    return NextResponse.json({ success: true, data: warranty, project: context.project });
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
    const rows = await findAll("Project_Warranty", context.siteSheetId);
    const current = rows.find((row) => row.project_id === context.project.project_id);
    let patch: Record<string, string> = {};

    warrantyFields.forEach((field) => {
      if (body[field] !== undefined) patch[field] = String(body[field] || "");
    });
    patch = withCalculatedExpiry({ ...current, ...patch } as Record<string, string>);

    if (current?._rowIndex) {
      const warrantyId = String(current.warranty_id || "");
      const fallbackRowIndex = warrantyId ? await getFallbackRowIndex(context.siteSheetId, warrantyId, current) : current._rowIndex;
      await update("Project_Warranty", warrantyId || current._rowIndex, patch, context.siteSheetId, fallbackRowIndex);
      return NextResponse.json({ success: true, data: { ...current, ...patch } });
    }

    const data = {
      warranty_id: makeId("WRN"),
      project_id: context.project.project_id,
      ...patch,
    };
    const result = await insert("Project_Warranty", data, context.siteSheetId);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
