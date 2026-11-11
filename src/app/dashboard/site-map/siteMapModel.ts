export type Project = {
  project_id: string;
  name: string;
  created_at?: string;
  client?: string;
  address?: string;
  province?: string;
  district?: string;
  se_name?: string;
  architect_name?: string;
  status?: string;
  percent_done?: string;
  site_link?: string;
  overdue_tasks?: string;
  delay_days?: string;
  daily_report_alert?: string;
  daily_report_missing_days?: string;
  lifecycle_alerts_count?: string;
  healthLoaded?: boolean;
};

export type ProjectsResponse = {
  success: boolean;
  data: Project[];
};

export type Coordinates = {
  lat: number;
  lng: number;
};

export type SiteRisk = "critical" | "warning" | "normal" | "unknown";

export type SitePoint = Coordinates & {
  engineerColor: string;
  engineerName: string;
  project: Project;
  risk: SiteRisk;
};

export const ALL = "ทั้งหมด";
export const statusOptions = [ALL, "Planning", "In Progress", "On Hold", "Completed", "Cancelled"];
export const defaultCenter: Coordinates = { lat: 13.7563, lng: 100.5018 };
export const engineerPalette = [
  "#e11d48",
  "#2563eb",
  "#f97316",
  "#7c3aed",
  "#16a34a",
  "#db2777",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#0f766e",
  "#be123c",
  "#7c2d12",
];

export const statusStyles: Record<string, { badge: string; marker: string; label: string }> = {
  Planning: {
    badge: "border-sky-100 bg-sky-50 text-sky-700",
    marker: "#0ea5e9",
    label: "Planning",
  },
  "In Progress": {
    badge: "border-orange-100 bg-orange-50 text-orange-700",
    marker: "#ea580c",
    label: "In Progress",
  },
  "On Hold": {
    badge: "border-amber-100 bg-amber-50 text-amber-700",
    marker: "#f59e0b",
    label: "On Hold",
  },
  Completed: {
    badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
    marker: "#059669",
    label: "Completed",
  },
  Cancelled: {
    badge: "border-slate-100 bg-slate-50 text-slate-700",
    marker: "#64748b",
    label: "Cancelled",
  },
};

export function getStatus(project: Project) {
  const status = String(project.status || "Planning").trim();
  return statusStyles[status] ? status : "Planning";
}

export function numberValue(value?: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

export function percentValue(value?: string) {
  return Math.max(0, Math.min(100, numberValue(value)));
}

export function projectLocation(project: Project) {
  return [project.address, project.district, project.province].filter(Boolean).join(" ") || project.client || "-";
}

export function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function extractCoordinatesFromMapLink(link?: string): Coordinates | null {
  const raw = String(link || "").trim();
  if (!raw) return null;

  const decoded = safeDecode(raw);
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/,
    /(?:^|[/?&=])(-?\d{1,2}\.\d{4,})(?:%2C|,|\s)+(-?\d{1,3}\.\d{4,})(?:$|[/?&#])/,
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValidCoordinate(lat, lng)) return { lat, lng };
  }

  return null;
}

export function getProjectCoordinates(project: Project, resolvedCoordinates: Record<string, Coordinates>) {
  return extractCoordinatesFromMapLink(project.site_link) || resolvedCoordinates[project.project_id] || null;
}

export function getRisk(project: Project): SiteRisk {
  if (!project.healthLoaded) return "unknown";
  const overdueTasks = numberValue(project.overdue_tasks);
  const missingDays = numberValue(project.daily_report_missing_days);
  const lifecycleAlerts = numberValue(project.lifecycle_alerts_count);
  const delayDays = numberValue(project.delay_days);

  if (overdueTasks > 0 || lifecycleAlerts > 0 || delayDays > 0) return "critical";
  if (missingDays > 0 || project.daily_report_alert === "TRUE") return "warning";
  return "normal";
}

export function getRiskLabel(risk: SiteRisk) {
  if (risk === "unknown") return "ยังไม่ได้โหลดรายละเอียด";
  if (risk === "critical") return "ต้องตามด่วน";
  if (risk === "warning") return "ควรติดตาม";
  return "ปกติ";
}

export function getRiskClass(risk: SiteRisk) {
  if (risk === "unknown") return "border-slate-200 bg-slate-50 text-slate-500";
  if (risk === "critical") return "border-red-100 bg-red-50 text-red-700";
  if (risk === "warning") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

export function getEngineerName(project: Project) {
  return String(project.se_name || "ไม่ระบุ Site Engineer").trim() || "ไม่ระบุ Site Engineer";
}

export function getEngineerInitials(engineerName: string) {
  if (engineerName === "ไม่ระบุ Site Engineer") return "?";
  const words = engineerName
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (/^[A-Za-z]/.test(words[0])) {
    return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  }
  return words[0].slice(0, 2);
}

export function buildEngineerColorMap(engineers: string[]) {
  return engineers.reduce<Record<string, string>>((colors, engineerName, index) => {
    colors[engineerName] = engineerPalette[index % engineerPalette.length];
    return colors;
  }, {});
}

export function getEngineerColor(engineerName: string, colorMap: Record<string, string>) {
  return colorMap[engineerName] || "#64748b";
}

export function getRiskColor(risk: SiteRisk) {
  if (risk === "unknown") return "#94a3b8";
  if (risk === "critical") return "#dc2626";
  if (risk === "warning") return "#f59e0b";
  return "#10b981";
}

export function getMarkerColor(point: SitePoint) {
  return point.engineerColor;
}

export function getMapUrl(project: Project) {
  return project.site_link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation(project))}`;
}

export function getDirectionsUrl(target: SitePoint | Project) {
  if ("lat" in target) {
    return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
  }
  return getMapUrl(target);
}

export function getRouteUrl(points: SitePoint[]) {
  if (points.length === 0) return "https://www.google.com/maps";
  const ordered = [...points].slice(0, 10);
  const destination = ordered[ordered.length - 1];
  const waypoints = ordered.slice(0, -1).map((point) => `${point.lat},${point.lng}`).join("|");
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function uniqueValues(projects: Project[], field: keyof Project) {
  return [...new Set(projects.map((project) => String(project[field] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
}

export function buildSitePoints(projects: Project[], resolvedCoordinates: Record<string, Coordinates>, engineerColorMap: Record<string, string>) {
  return projects.flatMap((project) => {
    const coordinates = getProjectCoordinates(project, resolvedCoordinates);
    if (!coordinates) return [];
    const engineerName = getEngineerName(project);
    return [{
      ...coordinates,
      engineerColor: getEngineerColor(engineerName, engineerColorMap),
      engineerName,
      project,
      risk: getRisk(project),
    }];
  });
}


export function newestMapProject(projects: Project[]) {
  return projects.reduce<Project | undefined>((latest, project) => {
    if (!latest) return project;
    const created = Date.parse(project.created_at || "") || 0;
    const previous = Date.parse(latest.created_at || "") || 0;
    if (created !== previous) return created > previous ? project : latest;
    return project.project_id.localeCompare(latest.project_id, undefined, { numeric: true }) > 0 ? project : latest;
  }, undefined);
}
