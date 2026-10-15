import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listSavedScheduleTemplates, saveScheduleTemplate } from "@/lib/scheduleTemplateStore";
import { TemplateValidationError, validateTemplateItems } from "@/lib/scheduleTemplates";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: await listSavedScheduleTemplates() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "โหลดแม่แบบไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body?.name !== "string" || !body.name.trim() || body.name.trim().length > 150) {
      throw new TemplateValidationError("กรุณาตั้งชื่อแม่แบบไม่เกิน 150 ตัวอักษร");
    }
    const template = { id: `TPL-${randomUUID()}`, name: body.name.trim(), items: validateTemplateItems(body.items) };
    await saveScheduleTemplate(template, session.user.email || session.user.name || "");
    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกแม่แบบไม่สำเร็จ" },
      { status: error instanceof TemplateValidationError || error instanceof SyntaxError ? 400 : 500 });
  }
}
