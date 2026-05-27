import PublicDecisionApprovalClient from "./PublicDecisionApprovalClient";

export default async function DecisionApprovalPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicDecisionApprovalClient projectId={projectId} token={token} />;
}
