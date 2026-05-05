import { NextResponse } from "next/server";
import { findAllMaster, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

type ContactLog = {
  round: number;
  date: string;
  note: string;
  created_by: string;
  created_at: string;
};

function parseContactLogs(value?: string): ContactLog[] {
  if (!value) return [];
  try {
    const logs = JSON.parse(value);
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "ไม่สามารถจัดการข้อมูล Sales CRM ได้";
  if (message.includes("Quota exceeded")) {
    return "Google API quota ชั่วคราวเต็ม กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }
  return message;
}

function createCustomerId() {
  return `CUS-${Date.now().toString(36).toUpperCase()}`;
}

export async function GET(req: Request) {
  try {
    await ensureMasterSchema();
    const url = new URL(req.url);
    const includeClosed = url.searchParams.get("include_closed") === "true";
    const customers = await findAllMaster("Customers");
    const data = customers
      .filter((customer) => includeClosed || customer.active !== "FALSE")
      .map((customer) => ({
        ...customer,
        contact_logs: parseContactLogs(customer.contact_logs_json),
      }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureMasterSchema();
    const body = await req.json();
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone || "").trim();

    if (!fullName || !phone) {
      return NextResponse.json({ error: "กรุณาระบุชื่อลูกค้าและเบอร์โทร" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const customer = {
      id: body.id || createCustomerId(),
      full_name: fullName,
      nickname: body.nickname || "",
      phone,
      line_id: body.line_id || "",
      address: body.address || "",
      requirements: body.requirements || "",
      interest_level: body.interest_level || "medium",
      status: body.status || "new",
      contact_logs_json: JSON.stringify([]),
      last_contacted_at: "",
      project_id: "",
      notes: body.notes || "",
      freebies: body.freebies || "",
      created_by: body.created_by || "Admin",
      active: "TRUE",
      created_at: now,
      updated_at: now,
    };

    const result = await insertMaster("Customers", customer);
    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await ensureMasterSchema();
    const body = await req.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing customer id" }, { status: 400 });
    }

    const customers = await findAllMaster("Customers");
    const current = customers.find((customer) => customer.id === id);

    if (!current?._rowIndex) {
      return NextResponse.json({ error: "ไม่พบ Lead นี้ใน Master Sheet" }, { status: 404 });
    }

    const action = body.action || "update";
    let patch: Record<string, string> = {};

    if (action === "add_contact_log") {
      const note = String(body.note || "").trim();
      if (!note) {
        return NextResponse.json({ error: "กรุณาใส่บันทึกการติดต่อ" }, { status: 400 });
      }

      const logs = parseContactLogs(current.contact_logs_json);
      const date = body.date || new Date().toISOString().slice(0, 10);
      logs.push({
        round: logs.length + 1,
        date,
        note,
        created_by: body.created_by || "Admin",
        created_at: new Date().toISOString(),
      });

      patch = {
        contact_logs_json: JSON.stringify(logs),
        last_contacted_at: date,
        status: body.status || current.status || "waiting",
      };
    } else if (action === "mark_deposited") {
      patch = {
        status: "deposited",
      };
    } else if (action === "close_lead") {
      patch = {
        active: "FALSE",
        status: body.status || "not_interested",
      };
    } else {
      const allowedFields = [
        "full_name",
        "nickname",
        "phone",
        "line_id",
        "address",
        "requirements",
        "interest_level",
        "status",
        "last_contacted_at",
        "project_id",
        "notes",
        "freebies",
        "active",
      ];

      allowedFields.forEach((field) => {
        if (body[field] !== undefined) patch[field] = String(body[field]);
      });
    }

    await updateMaster("Customers", Number(current._rowIndex), patch);
    return NextResponse.json({ success: true, data: { ...current, ...patch } });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
