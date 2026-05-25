import { NextResponse } from "next/server";
import { insert, update, findAll, findAllRaw } from "@/lib/sheetsCrud";
import { ensureSchema } from "@/lib/sheetsSetup";
import { getProjectContext } from "@/lib/siteContext";
import { isSupabaseBackend } from "@/lib/supabaseRest";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function findMaterialRowIndex(sheetId: string, projectId: string | undefined, materialId: string) {
  const rows = await findAllRaw("Materials", sheetId);
  const match = rows.find((row) => {
    if (String(row.material_id || "").trim() !== materialId) return false;
    return !projectId || String(row.project_id || "").trim() === projectId;
  });
  return match?._rowIndex;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const { sheetId } = await getProjectContext(projectId);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);
    
    let materials = await findAll("Materials", sheetId);
    if (projectId) {
      materials = materials.filter(m => m.project_id === projectId);
    }
    
    return NextResponse.json({ success: true, data: materials });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, name, supplier, quantity, unit, cost, order_date, delivery_date, status } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    if (!isSupabaseBackend()) await ensureSchema(sheetId);

    const materialData = {
      material_id: `MAT-${Date.now().toString().slice(-6)}`,
      project_id,
      name,
      supplier: supplier || "",
      quantity: quantity || "0",
      qty_actual: quantity || "0",
      unit: unit || "หน่วย",
      cost: cost || "0",
      order_date: order_date || "",
      delivery_date: delivery_date || "",
      status: status || "Pending"
    };

    const result = await insert("Materials", materialData, sheetId);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { _rowIndex, material_id, project_id, ...updates } = body;
    const materialId = typeof material_id === "string" ? material_id.trim() : "";
    const legacyRowIndex = _rowIndex ? String(_rowIndex) : "";

    if (!materialId && !legacyRowIndex) {
      return NextResponse.json({ error: "Missing material_id for update" }, { status: 400 });
    }

    const { sheetId } = await getProjectContext(project_id);
    const fallbackRowIndex = legacyRowIndex || (materialId ? await findMaterialRowIndex(sheetId, project_id, materialId) : undefined);
    const rowKey = isSupabaseBackend() && materialId ? materialId : legacyRowIndex || materialId;
    await update("Materials", rowKey, { ...updates, ...(materialId ? { material_id: materialId } : {}) }, sheetId, fallbackRowIndex);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
