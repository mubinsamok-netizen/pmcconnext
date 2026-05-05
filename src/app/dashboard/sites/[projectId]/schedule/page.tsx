import { ListChecks } from "lucide-react";
import SchedulePlanner from "@/app/dashboard/schedule/SchedulePlanner";
import type { MasterProject } from "@/lib/masterProjects";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";

export const dynamic = "force-dynamic";

export default async function SiteSchedulePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const decodedProjectId = decodeURIComponent(projectId);
  let project: MasterProject;

  try {
    project = await getMasterProject(decodedProjectId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Quota exceeded")) {
      throw error;
    }

    console.warn("Using route project fallback because Google Sheets quota is temporarily exceeded.");
    project = {
      project_id: decodedProjectId,
      name: decodedProjectId,
      status: "Planning",
    };
  }

  return (
    <SiteShell
      project={project}
      eyebrow="Schedule"
      title="แผนงาน"
      description="Task Tracker, ตารางแผนงาน และ Gantt Chart สำหรับไซต์นี้"
      icon={ListChecks}
      wide
    >
      <SchedulePlanner projects={[project]} />
    </SiteShell>
  );
}
