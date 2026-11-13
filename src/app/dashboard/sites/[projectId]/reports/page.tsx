import { FileText } from "lucide-react";
import { getCurrentSession } from "@/lib/currentSession";
import { getMasterProject } from "@/lib/masterProjects";
import { isForemanRole } from "@/lib/siteAccess";
import { SiteShell } from "../SiteShell";
import { DailyReportsWorkspace } from "./DailyReportsWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, session] = await Promise.all([getMasterProject(projectId), getCurrentSession()]);
  const allowAdvancedReports = !isForemanRole(session?.user?.role);

  return (
    <SiteShell
      project={project}
      eyebrow="Daily Reports"
      title="รายงานประจำวัน"
      description="Dashboard และแบบฟอร์มรายงานประจำวัน พร้อม PDF, รูปภาพ และ LINE อัตโนมัติ"
      icon={FileText}
      wide
    >
      <DailyReportsWorkspace project={project} allowAdvancedReports={allowAdvancedReports} />
    </SiteShell>
  );
}
