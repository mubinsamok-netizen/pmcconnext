import { Bug } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";

export const dynamic = "force-dynamic";

export default async function SiteDefectsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);

  return (
    <SiteShell
      project={project}
      eyebrow="Defect"
      title="Defect"
      description="โครงหน้าสำหรับ defect list การแก้ไข การตรวจรับ และรูปประกอบ"
      icon={Bug}
    />
  );
}
