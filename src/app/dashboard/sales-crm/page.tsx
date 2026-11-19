import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/currentSession";
import { getAppRole } from "@/lib/roles";
import SalesCrmWorkspace from "./SalesCrmWorkspace";

export default async function SalesCrmPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/");
  if (getAppRole(session.user.role) !== "Admin") redirect("/dashboard/projects");

  return <SalesCrmWorkspace />;
}
