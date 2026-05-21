import PublicQcApprovalClient from "./PublicQcApprovalClient";

export const dynamic = "force-dynamic";

export default async function QcApprovalPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicQcApprovalClient projectId={decodeURIComponent(projectId)} token={decodeURIComponent(token)} />;
}
