import PublicDefectApprovalClient from "./PublicDefectApprovalClient";

export default async function DefectApprovalPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicDefectApprovalClient projectId={projectId} token={token} />;
}
