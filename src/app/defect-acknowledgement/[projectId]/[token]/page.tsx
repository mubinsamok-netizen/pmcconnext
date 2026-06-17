import PublicDefectAcknowledgementClient from "./PublicDefectAcknowledgementClient";

export default async function DefectAcknowledgementPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicDefectAcknowledgementClient projectId={projectId} token={token} />;
}
