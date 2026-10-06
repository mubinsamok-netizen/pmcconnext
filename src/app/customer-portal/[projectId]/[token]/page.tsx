import CustomerPortalView from "./CustomerPortalView";

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage({ params }: { params: Promise<{ projectId: string; token: string }> }) {
  const { projectId, token } = await params;
  return <CustomerPortalView projectId={decodeURIComponent(projectId)} token={decodeURIComponent(token)} />;
}
