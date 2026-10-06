import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

type LaborRateInput = {
  rate_id?: unknown;
  category?: unknown;
  work_name?: unknown;
  description?: unknown;
  unit?: unknown;
  min_rate?: unknown;
  standard_rate?: unknown;
  max_rate?: unknown;
  area?: unknown;
  price_scope?: unknown;
  effective_date?: unknown;
  source?: unknown;
  notes?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberText(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : "0";
}

function isActive(record: Record<string, unknown>) {
  return text(record.active || "TRUE").toLowerCase() !== "false";
}

function normalize(value: unknown) {
  return text(value).toLocaleLowerCase("th-TH");
}

function laborRatePayload(body: LaborRateInput) {
  return {
    category: text(body.category),
    work_name: text(body.work_name),
    description: text(body.description),
    unit: text(body.unit),
    min_rate: numberText(body.min_rate),
    standard_rate: numberText(body.standard_rate),
    max_rate: numberText(body.max_rate),
    area: text(body.area),
    price_scope: text(body.price_scope),
    effective_date: text(body.effective_date),
    source: text(body.source),
    notes: text(body.notes),
    active: "TRUE",
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถจัดการข้อมูลค่าแรงได้";
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !hasPermission(session.user.role, "team.manage")) {
    return NextResponse.json({ error: permissionDeniedMessage("team.manage") }, { status: 403 });
  }
  return null;
}

function isDuplicate(
  item: Record<string, unknown>,
  payload: ReturnType<typeof laborRatePayload>,
  exceptId = "",
) {
  return isActive(item) &&
    text(item.rate_id) !== exceptId &&
    normalize(item.category) === normalize(payload.category) &&
    normalize(item.work_name) === normalize(payload.work_name) &&
    normalize(item.unit) === normalize(payload.unit) &&
    normalize(item.area) === normalize(payload.area);
}

export async function GET() {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    await ensureMasterSchema();
    const rates = await findAllMaster("LaborRates");
    return NextResponse.json({ success: true, data: rates.filter(isActive) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    await ensureMasterSchema();
    const body = await request.json() as LaborRateInput;
    const payload = laborRatePayload(body);
    if (!payload.category || !payload.work_name || !payload.unit || Number(payload.standard_rate) <= 0) {
      return NextResponse.json({ error: "กรุณากรอกหมวดงาน รายการงาน หน่วย และราคากลาง" }, { status: 400 });
    }
    if (Number(payload.min_rate) > Number(payload.standard_rate) || (Number(payload.max_rate) > 0 && Number(payload.standard_rate) > Number(payload.max_rate))) {
      return NextResponse.json({ error: "ช่วงราคาต้องเรียงจากราคาต่ำสุด ราคากลาง และราคาสูงสุด" }, { status: 400 });
    }
    const rates = await findAllMaster("LaborRates");
    if (rates.some((item) => isDuplicate(item, payload))) {
      return NextResponse.json({ error: "มีรายการค่าแรงนี้ในพื้นที่และหน่วยเดียวกันแล้ว" }, { status: 400 });
    }
    const result = await insertMaster("LaborRates", {
      rate_id: `LR-${randomUUID().slice(0, 8).toUpperCase()}`,
      ...payload,
    });
    return NextResponse.json({ success: true, data: result.inserted }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    await ensureMasterSchema();
    const body = await request.json() as LaborRateInput;
    const rateId = text(body.rate_id);
    const payload = laborRatePayload(body);
    if (!rateId || !payload.category || !payload.work_name || !payload.unit || Number(payload.standard_rate) <= 0) {
      return NextResponse.json({ error: "ข้อมูลค่าแรงไม่ครบถ้วน" }, { status: 400 });
    }
    if (Number(payload.min_rate) > Number(payload.standard_rate) || (Number(payload.max_rate) > 0 && Number(payload.standard_rate) > Number(payload.max_rate))) {
      return NextResponse.json({ error: "ช่วงราคาต้องเรียงจากราคาต่ำสุด ราคากลาง และราคาสูงสุด" }, { status: 400 });
    }
    const rates = await findAllMaster("LaborRates");
    const current = rates.find((item) => text(item.rate_id) === rateId && isActive(item));
    if (!current) return NextResponse.json({ error: "ไม่พบรายการค่าแรงที่ต้องการแก้ไข" }, { status: 404 });
    if (rates.some((item) => isDuplicate(item, payload, rateId))) {
      return NextResponse.json({ error: "มีรายการค่าแรงนี้ในพื้นที่และหน่วยเดียวกันแล้ว" }, { status: 400 });
    }
    await updateMaster("LaborRates", rateId, payload, current._rowIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    await ensureMasterSchema();
    const rateId = text(new URL(request.url).searchParams.get("rate_id"));
    if (!rateId) return NextResponse.json({ error: "ไม่พบรหัสค่าแรง" }, { status: 400 });
    const rates = await findAllMaster("LaborRates");
    const current = rates.find((item) => text(item.rate_id) === rateId && isActive(item));
    if (!current) return NextResponse.json({ error: "ไม่พบรายการค่าแรงที่ต้องการลบ" }, { status: 404 });
    await updateMaster("LaborRates", rateId, { active: "FALSE" }, current._rowIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
