import { ShieldCheck } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import QcChecklistsWorkspace from "./QcChecklistsWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteQcChecklistsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId, { siteSegment: "qc-checklists" });

  return (
    <SiteShell
      project={project}
      eyebrow="QC Checklist"
      title="QC Checklist"
      description="ตรวจคุณภาพงานโครงสร้างและสถาปัตย์ แนบหลักฐาน ออก PDF และส่งให้ลูกค้าอนุมัติ"
      icon={ShieldCheck}
      wide
    >
      <QcChecklistsWorkspace
        projectId={project.project_id}
        projectName={project.name}
        clientName={project.client}
      />
    </SiteShell>
  );
}
