import { FileQuestion } from "lucide-react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";

export const dynamic = "force-dynamic";

export default async function SiteRfaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);

  return (
    <SiteShell
      project={project}
      eyebrow="RFA"
      title="RFA"
      description="โครงหน้าสำหรับ Request for Approval และรายการขออนุมัติของไซต์"
      icon={FileQuestion}
    />
  );
}
