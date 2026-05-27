import { getAppRole } from "@/lib/roles";

export const FOREMAN_SITE_SEGMENTS = ["", "details", "files", "schedule", "reports", "notes", "memos", "qc-checklists"] as const;

export type SiteSegment = (typeof FOREMAN_SITE_SEGMENTS)[number];

const FOREMAN_SITE_SEGMENT_SET = new Set<string>(FOREMAN_SITE_SEGMENTS);

export function isForemanRole(role?: string | null) {
  return getAppRole(role) === "Foreman";
}

export function canAccessSiteSegment(role: string | null | undefined, segment: string) {
  if (!isForemanRole(role)) return true;
  return FOREMAN_SITE_SEGMENT_SET.has(segment);
}
