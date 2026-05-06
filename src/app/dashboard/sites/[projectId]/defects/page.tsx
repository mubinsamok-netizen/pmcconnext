import { Bug } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import { DefectsWorkspace } from "./DefectsWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteDefectsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId, { siteSegment: "defects" });

  return (
    <SiteShell
      project={project}
      eyebrow="Defect"
      title="Defect Inspection"
      description="บันทึกรายการตรวจส่งมอบ ออกเอกสาร PDF/Print และแนบหลักฐานแชทเมื่อลูกค้ารับทราบ"
      icon={Bug}
      wide
    >
      <DefectsWorkspace
        projectId={project.project_id}
        projectName={project.name}
        clientName={project.client}
      />
    </SiteShell>
  );
}
