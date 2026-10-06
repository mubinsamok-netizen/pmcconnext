import { NextResponse } from "next/server";
import { createCustomerPortalToken } from "@/lib/customerPortal";
import { getPublicAppOrigin } from "@/lib/publicUrl";
import { getErrorMessage, getSiteApiContext } from "@/lib/siteApi";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId: rawProjectId } = await params;
    const projectId = decodeURIComponent(rawProjectId);
    const context = await getSiteApiContext(projectId);
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const origin = getPublicAppOrigin({ request });
    if (!origin) return NextResponse.json({ error: "ไม่พบ URL ระบบสำหรับสร้างลิงก์ลูกค้า" }, { status: 400 });

    const token = createCustomerPortalToken(projectId);
    const url = `${origin}/customer-portal/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
