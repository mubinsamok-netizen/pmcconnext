"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { Project, ProjectsResponse } from "./siteMapModel";

export async function fetchMapProjects(url: string): Promise<ProjectsResponse> {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok || !json.success || !Array.isArray(json.data)) throw new Error("โหลดข้อมูลไซต์ไม่สำเร็จ");
  return json;
}

export function useSiteMapHealth(baseProjects: Project[], selectedId: string) {
  const [loaded, setLoaded] = useState<Record<string, Project>>({});
  const allowedId = baseProjects.some((project) => project.project_id === selectedId) ? selectedId : "";
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    allowedId ? `/api/projects?mode=health&projectId=${encodeURIComponent(allowedId)}` : null,
    fetchMapProjects,
    { onSuccess: (response) => {
      setLoaded((current) => ({ ...current, ...Object.fromEntries(response.data.map((project) => [project.project_id, project])) }));
    } }
  );
  const selectedHealth = data?.data.find((project) => project.project_id === allowedId);
  const projects = useMemo(() => baseProjects.map((project) => {
    const health = project.project_id === allowedId ? selectedHealth || loaded[project.project_id] : loaded[project.project_id];
    return { ...project, ...health, healthLoaded: Boolean(health) };
  }), [baseProjects, loaded, allowedId, selectedHealth]);
  return { projects, healthLoading: Boolean(allowedId && isLoading), healthError: Boolean(allowedId && (error || (data && !selectedHealth))), retryHealth: () => void mutate() };
}
