import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/currentSession";
import { getAppRole } from "@/lib/roles";
import ContractorsWorkspace from "./ContractorsWorkspace";

export default async function ContractorsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/");
  if (getAppRole(session.user.role) !== "Admin") redirect("/dashboard/projects");

  return <ContractorsWorkspace />;
}
