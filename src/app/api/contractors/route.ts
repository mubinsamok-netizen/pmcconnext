import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { hasPermission, permissionDeniedMessage } from "@/lib/permissions";
import { findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

type ContractorInput = {
  contractor_id?: unknown;
  name?: unknown;
  nickname?: unknown;
  phone?: unknown;
  line_id?: unknown;
  work_categories?: unknown;
  service_area?: unknown;
  employment_type?: unknown;
  rate_note?: unknown;
  source?: unknown;
  status?: unknown;
  team_size?: unknown;
  notes?: unknown;
};

const allowedStatuses = new Set(["available", "reserve", "inactive"]);
const allowedEmploymentTypes = new Set(["daily", "contract", "both", "unspecified"]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  return text(value).replace(/[^0-9+]/g, "");
}

function serializeCategories(value: unknown) {
  const categories = Array.isArray(value)
    ? value.map(text)
    : text(value).split(",").map((item) => item.trim());

  return JSON.stringify([...new Set(categories.filter(Boolean))]);
}

function contractorPayload(body: ContractorInput) {
  const status = text(body.status);
  const employmentType = text(body.employment_type);
  const teamSize = Math.max(0, Math.floor(Number(body.team_size) || 0));

  return {
    name: text(body.name),
    nickname: text(body.nickname),
    phone: text(body.phone),
    line_id: text(body.line_id),
    work_categories: serializeCategories(body.work_categories),
    service_area: text(body.service_area),
    employment_type: allowedEmploymentTypes.has(employmentType) ? employmentType : "unspecified",
    rate_note: text(body.rate_note),
    source: text(body.source),
    status: allowedStatuses.has(status) ? status : "available",
    team_size: String(teamSize),
    notes: text(body.notes),
    active: "TRUE",
  };
}

function isActive(record: Record<string, unknown>) {
  return text(record.active || "TRUE").toLowerCase() !== "false";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถจัดการข้อมูลช่างได้";
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !hasPermission(session.user.role, "team.manage")) {
    return NextResponse.json({ error: permissionDeniedMessage("team.manage") }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    await ensureMasterSchema();
    const contractors = await findAllMaster("Contractors");
    return NextResponse.json({ success: true, data: contractors.filter(isActive) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    await ensureMasterSchema();
    const body = await request.json() as ContractorInput;
    const payload = contractorPayload(body);
    if (!payload.name || !payload.phone) {
      return NextResponse.json({ error: "กรุณากรอกชื่อช่างและเบอร์โทรศัพท์" }, { status: 400 });
    }

    const contractors = await findAllMaster("Contractors");
    const phone = normalizePhone(payload.phone);
    const duplicate = contractors.some((item) => isActive(item) && phone && normalizePhone(item.phone) === phone);
    if (duplicate) {
      return NextResponse.json({ error: "เบอร์โทรศัพท์นี้มีอยู่ในฐานข้อมูลแล้ว" }, { status: 400 });
    }

    const result = await insertMaster("Contractors", {
      contractor_id: `CT-${randomUUID().slice(0, 8).toUpperCase()}`,
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
    const body = await request.json() as ContractorInput;
    const contractorId = text(body.contractor_id);
    const payload = contractorPayload(body);
    if (!contractorId || !payload.name || !payload.phone) {
      return NextResponse.json({ error: "ข้อมูลช่างไม่ครบถ้วน" }, { status: 400 });
    }

    const contractors = await findAllMaster("Contractors");
    const current = contractors.find((item) => text(item.contractor_id) === contractorId && isActive(item));
    if (!current) {
      return NextResponse.json({ error: "ไม่พบข้อมูลช่างที่ต้องการแก้ไข" }, { status: 404 });
    }

    const phone = normalizePhone(payload.phone);
    const duplicate = contractors.some((item) => (
      isActive(item) &&
      text(item.contractor_id) !== contractorId &&
      phone &&
      normalizePhone(item.phone) === phone
    ));
    if (duplicate) {
      return NextResponse.json({ error: "เบอร์โทรศัพท์นี้มีอยู่ในฐานข้อมูลแล้ว" }, { status: 400 });
    }

    await updateMaster("Contractors", contractorId, payload, current._rowIndex);
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
    const contractorId = text(new URL(request.url).searchParams.get("contractor_id"));
    if (!contractorId) {
      return NextResponse.json({ error: "ไม่พบรหัสช่าง" }, { status: 400 });
    }

    const contractors = await findAllMaster("Contractors");
    const current = contractors.find((item) => text(item.contractor_id) === contractorId && isActive(item));
    if (!current) {
      return NextResponse.json({ error: "ไม่พบข้อมูลช่างที่ต้องการลบ" }, { status: 404 });
    }

    await updateMaster("Contractors", contractorId, { active: "FALSE" }, current._rowIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
