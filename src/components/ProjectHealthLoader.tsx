"use client";

import type { ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type ProjectHealthData = {
  project_id: string;
  percent_done?: string;
  tasks_count?: string;
  completed_tasks?: string;
  overdue_tasks?: string;
  delay_days?: string;
  progress_source?: string;
  daily_reports_count?: string;
  last_daily_report_date?: string;
  daily_report_missing_days?: string;
  daily_report_alert?: string;
  lifecycle_alerts_count?: string;
  lifecycle_alerts_json?: string;
};

export default function ProjectHealthLoader({ projectId, children }: {
  projectId: string;
  children: (state: { data?: ProjectHealthData; failed: boolean; retry: () => void }) => ReactNode;
}) {
  const { data, error, mutate } = useSWR<{ data?: ProjectHealthData[]; error?: string }>(
    `/api/projects?mode=health&projectId=${encodeURIComponent(projectId)}`,
    fetcher,
    { shouldRetryOnError: false, dedupingInterval: 0 }
  );
  const project = data?.data?.find((item) => item.project_id === projectId);

  return children({
    data: project,
    failed: Boolean(error || data?.error || (data && !project)),
    retry: () => { void mutate().catch(() => undefined); },
  });
}
