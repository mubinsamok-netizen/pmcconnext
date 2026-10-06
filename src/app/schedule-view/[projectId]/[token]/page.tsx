import PublicScheduleView from "./PublicScheduleView";

export const dynamic = "force-dynamic";

export default async function ScheduleViewPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicScheduleView projectId={decodeURIComponent(projectId)} token={decodeURIComponent(token)} />;
}
