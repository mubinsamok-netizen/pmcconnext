import { Suspense } from "react";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/currentSession";
import { readInitialProjects } from "@/lib/initialProjects";
import ProjectsSkeleton from "@/components/ProjectsSkeleton";
import ProjectsWorkspace, { type ProjectsResponse } from "./ProjectsWorkspace";

async function ProjectList() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/");
  let initialData: ProjectsResponse | undefined;
  try {
    initialData = { success: true, data: await readInitialProjects(session.user) as ProjectsResponse["data"] };
  } catch (error) {
    console.error("Initial project list failed; client retry remains available", error);
  }
  const snapshot = createHash("sha256").update(JSON.stringify([session.user.email, session.user.role, initialData])).digest("hex");
  return <ProjectsWorkspace initialData={initialData} snapshot={snapshot} />;
}

export default function ProjectsPage() {
  return <Suspense fallback={<ProjectsSkeleton />}><ProjectList /></Suspense>;
}
