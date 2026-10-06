import { NextResponse } from "next/server";
import { getPublicScheduleData } from "@/lib/publicScheduleData";
import { verifyScheduleShareToken } from "@/lib/scheduleShare";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const values = await params;
    const projectId = decodeURIComponent(values.projectId);
    const token = decodeURIComponent(values.token);
    if (!verifyScheduleShareToken(projectId, token)) {
      return NextResponse.json({ error: "ลิงก์แผนงานไม่ถูกต้อง" }, { status: 404 });
    }

    const data = await getPublicScheduleData(projectId);
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดแผนงานได้";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
