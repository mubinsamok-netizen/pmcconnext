import { NextResponse } from "next/server";
import { insert, findAll } from "@/lib/sheetsCrud";

export async function GET() {
  try {
    const team = await findAll("Team");
    return NextResponse.json({ success: true, data: team });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, phone, role } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if email already exists
    const existingTeam = await findAll("Team");
    if (existingTeam.some(u => u.email === email)) {
      return NextResponse.json({ error: "อีเมลนี้มีอยู่ในระบบแล้ว" }, { status: 400 });
    }

    // Generate simple member ID
    const member_id = `M-${Date.now().toString().slice(-6)}`;

    const memberData = {
      member_id,
      name,
      email,
      password,
      phone: phone || "",
      role: role || "Staff",
    };

    const result = await insert("Team", memberData);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: any) {
    console.error("Failed to create team member:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
