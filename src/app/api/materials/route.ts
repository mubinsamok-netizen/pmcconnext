import { NextResponse } from "next/server";
import { insert, update, findAll } from "@/lib/sheetsCrud";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    
    let materials = await findAll("Materials");
    if (projectId) {
      materials = materials.filter(m => m.project_id === projectId);
    }
    
    return NextResponse.json({ success: true, data: materials });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, name, supplier, quantity, unit, cost, order_date, delivery_date, status } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const materialData = {
      material_id: `MAT-${Date.now().toString().slice(-6)}`,
      project_id,
      name,
      supplier: supplier || "",
      quantity: quantity || "0",
      unit: unit || "หน่วย",
      cost: cost || "0",
      order_date: order_date || "",
      delivery_date: delivery_date || "",
      status: status || "Pending"
    };

    const result = await insert("Materials", materialData);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { _rowIndex, ...updates } = body;

    if (!_rowIndex) {
      return NextResponse.json({ error: "Missing _rowIndex for update" }, { status: 400 });
    }

    await update("Materials", _rowIndex, updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
