import { Megaphone } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";

export const dynamic = "force-dynamic";

export default async function SiteRfiPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);

  return (
    <SiteShell
      project={project}
      eyebrow="RFI"
      title="RFI"
      description="โครงหน้าสำหรับ Request for Information คำถาม คำตอบ และสถานะติดตาม"
      icon={Megaphone}
    />
  );
}
