import PublicVariationOrderApprovalClient from "./PublicVariationOrderApprovalClient";

export default async function VariationOrderApprovalPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <PublicVariationOrderApprovalClient projectId={projectId} token={token} />;
}
