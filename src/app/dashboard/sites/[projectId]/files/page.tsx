import { Images } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";

export const dynamic = "force-dynamic";

export default async function SiteFilesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);

  return (
    <SiteShell
      project={project}
      eyebrow="Files"
      title="รูปภาพและไฟล์ทั้งหมด"
      description="โครงหน้าสำหรับรวมรูปภาพ เอกสารแนบ รายงาน และไฟล์ใน Drive ของไซต์"
      icon={Images}
    />
  );
}
