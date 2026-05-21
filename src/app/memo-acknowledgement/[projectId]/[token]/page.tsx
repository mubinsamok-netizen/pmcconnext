import PublicMemoAcknowledgementClient from "./PublicMemoAcknowledgementClient";

export default async function MemoAcknowledgementPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicMemoAcknowledgementClient projectId={projectId} token={token} />;
}
