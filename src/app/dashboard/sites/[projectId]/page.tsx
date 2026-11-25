import { Suspense } from "react";
import { getCurrentSession } from "@/lib/currentSession";
import { getMasterProject } from "@/lib/masterProjects";
import { isForemanRole } from "@/lib/siteAccess";
import OverviewHeader from "./OverviewHeader";
import OverviewPrimary from "./OverviewPrimary";
import OverviewSecondary from "./OverviewSecondary";
import OverviewSkeleton from "./OverviewSkeleton";
import { createOverviewStreams } from "./overviewLoading";

export const dynamic = "force-dynamic";

export default async function SiteDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, session] = await Promise.all([getMasterProject(projectId), getCurrentSession()]);
  const isForeman = isForemanRole(session?.user?.role);
  const streams = createOverviewStreams(project);
  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <OverviewHeader project={project} isForeman={isForeman} taskRows={streams.tasks} />
      <Suspense fallback={<OverviewSkeleton label="กำลังเตรียมข้อมูลภาพรวม" cards />}>
        <OverviewPrimary project={project} data={streams.primary} isForeman={isForeman} />
      </Suspense>
      <Suspense fallback={<OverviewSkeleton label="กำลังเตรียมปฏิทินและรายละเอียดโครงการ" />}>
        <OverviewSecondary project={project} data={streams.complete} isForeman={isForeman} />
      </Suspense>
    </div>
  );
}
