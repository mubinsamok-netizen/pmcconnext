import { getServerSession } from "next-auth";
import { FileText } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import VariationOrdersWorkspace from "./VariationOrdersWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteVariationOrdersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);
  const session = await getServerSession(authOptions);

  return (
    <SiteShell
      project={project}
      eyebrow="Variation Orders"
      title="งานเพิ่ม-ลด"
      description="บริหารงานเพิ่ม งานลด งานสับเปลี่ยน การอนุมัติ เอกสาร วางบิล รับชำระ และการเพิ่มเข้าแผนงาน"
      icon={FileText}
      wide
    >
      <VariationOrdersWorkspace project={project} userRole={session?.user?.role || ""} />
    </SiteShell>
  );
}
