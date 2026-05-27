import { getServerSession } from "next-auth";
import { FileSignature } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";
import MemosWorkspace from "./MemosWorkspace";

export const dynamic = "force-dynamic";

export default async function SiteMemosPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId, { siteSegment: "memos" });
  const session = await getServerSession(authOptions);

  return (
    <SiteShell
      project={project}
      eyebrow="Memo"
      title="บันทึกข้อความ / Memo"
      description="สร้างบันทึกข้อความทางการ ออก PDF แนบหลักฐานลูกค้ารับทราบ และติดตามจำนวนวันที่ขอเพิ่ม"
      icon={FileSignature}
      wide
    >
      <MemosWorkspace project={project} userRole={session?.user?.role || ""} />
    </SiteShell>
  );
}
