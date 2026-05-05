import { getServerSession } from "next-auth";
import { Banknote } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import PaymentClaimsWorkspace from "./PaymentClaimsWorkspace";

export const dynamic = "force-dynamic";

export default async function SitePaymentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);
  const session = await getServerSession(authOptions);

  return (
    <SiteShell
      project={project}
      eyebrow="Payment Claims"
      title="ระบบเบิกเงิน"
      description="Dashboard mock สำหรับใบสำคัญจ่าย ค่าแรงช่าง DC ค่างวดงานรับเหมา สถานะเอกสาร และรายการที่ต้องติดตาม"
      icon={Banknote}
      wide
    >
      <PaymentClaimsWorkspace project={project} userRole={session?.user?.role || ""} />
    </SiteShell>
  );
}
