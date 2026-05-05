import { getServerSession } from "next-auth";
import { CalendarClock } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import { isAdminRole } from "@/lib/authz";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import LifecycleWorkspace from "./LifecycleWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteLifecyclePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId, { siteSegment: "lifecycle" });
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminRole(session?.user?.role);

  return (
    <SiteShell
      project={project}
      eyebrow="Project Lifecycle"
      title="รายละเอียดงาน เอกสาร และประกันผลงาน"
      description="บันทึกสถานะงาน วันที่สำคัญ เอกสาร PDF พร้อม version history และกำหนดเตือนประกันผลงาน"
      icon={CalendarClock}
      wide
    >
      <LifecycleWorkspace projectId={project.project_id} isAdmin={isAdmin} />
    </SiteShell>
  );
}
