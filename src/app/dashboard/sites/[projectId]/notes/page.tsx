import { StickyNote } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import { SiteNotesWorkspace } from "./SiteNotesWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteNotesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId, { siteSegment: "notes" });

  return (
    <SiteShell
      project={project}
      eyebrow="Site Notes"
      title="บันทึกหน้างาน"
      description="จดโน้ตสั้นๆ แนบรูปหรือไฟล์ และค้นหาประเด็นหน้างานย้อนหลัง"
      icon={StickyNote}
      wide
    >
      <SiteNotesWorkspace projectId={project.project_id} />
    </SiteShell>
  );
}
