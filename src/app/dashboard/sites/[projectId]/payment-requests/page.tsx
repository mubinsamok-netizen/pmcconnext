import { getCurrentSession } from "@/lib/currentSession";
import { Banknote } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import PaymentRequestsWorkspace from "./PaymentRequestsWorkspace";

export const dynamic = "force-dynamic";

export default async function PaymentRequestsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, session] = await Promise.all([
    getMasterProject(projectId, { siteSegment: "payment-requests" }),
    getCurrentSession(),
  ]);
  return (
    <SiteShell
      project={project}
      eyebrow="Payment Documents"
      title="ระบบเบิกเงิน"
      description="กรอกข้อมูลครั้งเดียว สร้าง PDF พร้อมเอกสารแนบ และคัดลอกข้อความสำหรับอีเมล"
      icon={Banknote}
      wide
    >
      <PaymentRequestsWorkspace project={project} preparedBy={session?.user?.name || session?.user?.email || ""} />
    </SiteShell>
  );
}
