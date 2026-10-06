import { NextResponse } from "next/server";
import { getCustomerPortalData, verifyCustomerPortalToken } from "@/lib/customerPortal";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; token: string }> }) {
  try {
    const values = await params;
    const projectId = decodeURIComponent(values.projectId);
    const token = decodeURIComponent(values.token);

    if (!verifyCustomerPortalToken(projectId, token)) {
      return NextResponse.json({ error: "ลิงก์ติดตามโครงการไม่ถูกต้อง" }, { status: 404 });
    }

    const data = await getCustomerPortalData(projectId);
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลลูกค้าได้";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
