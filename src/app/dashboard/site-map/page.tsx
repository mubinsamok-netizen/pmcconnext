"use client";

import {
  AlertTriangle,
  ExternalLink,
  Filter,
  Layers,
  MapPinOff,
  Maximize2,
  Minimize2,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Search,
} from "lucide-react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type Project = {
  project_id: string;
  name: string;
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
};

type ProjectsResponse = {
  success: boolean;
  data: Project[];
};

type Coordinates = {
  lat: number;
  lng: number;
};

type SiteRisk = "critical" | "warning" | "normal";

type SitePoint = Coordinates & {
  engineerColor: string;
  engineerName: string;
  project: Project;
  risk: SiteRisk;
};

const ALL = "ทั้งหมด";
const statusOptions = [ALL, "Planning", "In Progress", "On Hold", "Completed", "Cancelled"];
const defaultCenter: Coordinates = { lat: 13.7563, lng: 100.5018 };
const engineerPalette = [
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

const statusStyles: Record<string, { badge: string; marker: string; label: string }> = {
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

function getStatus(project: Project) {
  const status = String(project.status || "Planning").trim();
  return statusStyles[status] ? status : "Planning";
}

function numberValue(value?: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function percentValue(value?: string) {
  return Math.max(0, Math.min(100, numberValue(value)));
}

function projectLocation(project: Project) {
  return [project.address, project.district, project.province].filter(Boolean).join(" ") || project.client || "-";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function extractCoordinatesFromMapLink(link?: string): Coordinates | null {
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

function getProjectCoordinates(project: Project, resolvedCoordinates: Record<string, Coordinates>) {
  return extractCoordinatesFromMapLink(project.site_link) || resolvedCoordinates[project.project_id] || null;
}

function getRisk(project: Project): SiteRisk {
  const overdueTasks = numberValue(project.overdue_tasks);
  const missingDays = numberValue(project.daily_report_missing_days);
  const lifecycleAlerts = numberValue(project.lifecycle_alerts_count);
  const delayDays = numberValue(project.delay_days);

  if (overdueTasks > 0 || lifecycleAlerts > 0 || delayDays > 0) return "critical";
  if (missingDays > 0 || project.daily_report_alert === "TRUE") return "warning";
  return "normal";
}

function getRiskLabel(risk: SiteRisk) {
  if (risk === "critical") return "ต้องตามด่วน";
  if (risk === "warning") return "ควรติดตาม";
  return "ปกติ";
}

function getRiskClass(risk: SiteRisk) {
  if (risk === "critical") return "border-red-100 bg-red-50 text-red-700";
  if (risk === "warning") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function getEngineerName(project: Project) {
  return String(project.se_name || "ไม่ระบุ Site Engineer").trim() || "ไม่ระบุ Site Engineer";
}

function getEngineerInitials(engineerName: string) {
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

function buildEngineerColorMap(engineers: string[]) {
  return engineers.reduce<Record<string, string>>((colors, engineerName, index) => {
    colors[engineerName] = engineerPalette[index % engineerPalette.length];
    return colors;
  }, {});
}

function getEngineerColor(engineerName: string, colorMap: Record<string, string>) {
  return colorMap[engineerName] || "#64748b";
}

function getRiskColor(risk: SiteRisk) {
  if (risk === "critical") return "#dc2626";
  if (risk === "warning") return "#f59e0b";
  return "#10b981";
}

function getMarkerColor(point: SitePoint) {
  return point.engineerColor;
}

function getMapUrl(project: Project) {
  return project.site_link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation(project))}`;
}

function getDirectionsUrl(target: SitePoint | Project) {
  if ("lat" in target) {
    return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
  }
  return getMapUrl(target);
}

function getRouteUrl(points: SitePoint[]) {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniqueValues(projects: Project[], field: keyof Project) {
  return [...new Set(projects.map((project) => String(project[field] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
}

function buildSitePoints(projects: Project[], resolvedCoordinates: Record<string, Coordinates>, engineerColorMap: Record<string, string>) {
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

export default function SiteMapPage() {
  const { data, error, isLoading } = useSWR<ProjectsResponse>("/api/projects", fetcher);
  const projects = useMemo(() => data?.data || [], [data]);
  const [query, setQuery] = useState("");
  const [selectedEngineer, setSelectedEngineer] = useState(ALL);
  const [selectedRisk, setSelectedRisk] = useState<typeof ALL | SiteRisk>(ALL);
  const [selectedStatus, setSelectedStatus] = useState(ALL);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const [resolvedCoordinates, setResolvedCoordinates] = useState<Record<string, Coordinates>>({});
  const [attemptedCoordinateResolve, setAttemptedCoordinateResolve] = useState<Record<string, boolean>>({});

  const engineerOptions = useMemo(() => [ALL, ...uniqueValues(projects, "se_name")], [projects]);
  const engineerNames = useMemo(() => engineerOptions.filter((engineerName) => engineerName !== ALL), [engineerOptions]);
  const engineerColorMap = useMemo(() => buildEngineerColorMap(engineerNames), [engineerNames]);
  const effectiveSelectedEngineer = selectedEngineer === ALL || engineerOptions.includes(selectedEngineer) ? selectedEngineer : ALL;

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return projects.filter((project) => {
      const haystack = [
        project.project_id,
        project.name,
        project.client,
        project.address,
        project.district,
        project.province,
        project.se_name,
      ].join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (effectiveSelectedEngineer !== ALL && String(project.se_name || "") !== effectiveSelectedEngineer) return false;
      if (selectedStatus !== ALL && getStatus(project) !== selectedStatus) return false;
      if (selectedRisk !== ALL && getRisk(project) !== selectedRisk) return false;
      return true;
    });
  }, [effectiveSelectedEngineer, projects, query, selectedRisk, selectedStatus]);

  useEffect(() => {
    const unresolved = projects
      .filter((project) => project.site_link && !extractCoordinatesFromMapLink(project.site_link) && !resolvedCoordinates[project.project_id] && !attemptedCoordinateResolve[project.project_id])
      .slice(0, 40);

    if (unresolved.length === 0) return;

    const resolveCoordinates = async () => {
      try {
        const response = await fetch("/api/maps/coordinates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: unresolved.map((project) => ({
              project_id: project.project_id,
              site_link: project.site_link,
            })),
          }),
        });
        const json = await response.json();
        if (json?.success && Array.isArray(json.data)) {
          setResolvedCoordinates((current) => {
            const next = { ...current };
            json.data.forEach((item: { project_id?: string; coordinates?: Coordinates | null }) => {
              if (item.project_id && item.coordinates) next[item.project_id] = item.coordinates;
            });
            return next;
          });
        }
      } catch (coordinateError) {
        console.warn("Failed to resolve map coordinates", coordinateError);
      } finally {
        setAttemptedCoordinateResolve((current) => {
          const next = { ...current };
          unresolved.forEach((project) => {
            next[project.project_id] = true;
          });
          return next;
        });
      }
    };

    void resolveCoordinates();
  }, [attemptedCoordinateResolve, projects, resolvedCoordinates]);

  const sitePoints = useMemo(() => buildSitePoints(filteredProjects, resolvedCoordinates, engineerColorMap), [engineerColorMap, filteredProjects, resolvedCoordinates]);
  const missingProjects = useMemo(() => filteredProjects.filter((project) => !getProjectCoordinates(project, resolvedCoordinates)), [filteredProjects, resolvedCoordinates]);
  const activePoint = useMemo(() => sitePoints.find((point) => point.project.project_id === activeProjectId) || sitePoints[0] || null, [activeProjectId, sitePoints]);
  const engineerSummary = useMemo(() => {
    const summary = new Map<string, { count: number; withCoordinates: number }>();
    filteredProjects.forEach((project) => {
      const name = getEngineerName(project);
      const current = summary.get(name) || { count: 0, withCoordinates: 0 };
      current.count += 1;
      if (getProjectCoordinates(project, resolvedCoordinates)) current.withCoordinates += 1;
      summary.set(name, current);
    });
    return [...summary.entries()]
      .map(([name, value]) => ({ name, ...value, color: getEngineerColor(name, engineerColorMap) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));
  }, [engineerColorMap, filteredProjects, resolvedCoordinates]);

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setDetailOpen(true);
  };

  const criticalCount = sitePoints.filter((point) => point.risk === "critical").length;
  const inProgressCount = filteredProjects.filter((project) => getStatus(project) === "In Progress").length;

  return (
    <div className="-m-3 flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden bg-slate-100 sm:-m-5 xl:-m-6">
      <div className="relative z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-orange-600">Site Map</div>
            <h2 className="truncate text-2xl font-black text-slate-950">แผนที่ไซต์งานทั้งหมด</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-[720px] xl:grid-cols-[1fr_210px_180px]">
            <label className="relative sm:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-700 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                placeholder="ค้นหาไซต์ / ลูกค้า / พื้นที่"
              />
            </label>
            <FilterSelect label="Site Engineer" value={effectiveSelectedEngineer} onChange={setSelectedEngineer} options={engineerOptions} />
            <FilterSelect
              label="ความเสี่ยง"
              value={selectedRisk}
              onChange={(value) => setSelectedRisk(value as typeof ALL | SiteRisk)}
              options={[ALL, "critical", "warning", "normal"]}
              optionLabel={getRiskOptionLabel}
            />
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <LeafletMapCanvas points={sitePoints} activePoint={activePoint} onSelect={handleSelectProject} />

        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          className="absolute bottom-5 left-5 z-[900] grid h-12 w-12 place-items-center rounded-2xl border border-white/70 bg-white/95 text-slate-700 shadow-lg backdrop-blur transition hover:text-orange-600"
          title={panelOpen ? "ซ่อน panel" : "แสดง panel"}
          aria-label={panelOpen ? "ซ่อน panel" : "แสดง panel"}
        >
          {panelOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>

        {panelOpen && (
          <aside className="absolute bottom-4 left-4 top-20 z-[850] flex w-[min(390px,calc(100vw-2rem))] flex-col rounded-[28px] border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-wide text-orange-600">Overview</div>
                <div className="truncate text-base font-black text-slate-950">สรุปไซต์บนแผนที่</div>
              </div>
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setPanelOpen(false);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setPanelOpen(false);
                }}
                onTouchStart={(event) => {
                  event.preventDefault();
                  setPanelOpen(false);
                }}
                onClick={() => setPanelOpen(false)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:border-orange-200 hover:text-orange-600"
                title="ย่อหน้าต่างสรุป"
                aria-label="ย่อหน้าต่างสรุปไซต์"
              >
                <PanelLeftClose size={15} />
                ย่อ
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="ไซต์ที่แสดง" value={`${filteredProjects.length}/${projects.length}`} />
              <SummaryCard label="มีพิกัด" value={String(sitePoints.length)} tone="green" />
              <SummaryCard label="ต้องติดตาม" value={String(criticalCount)} tone={criticalCount > 0 ? "red" : "slate"} />
              <SummaryCard label="กำลังทำ" value={String(inProgressCount)} tone="orange" />
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <FilterSelect label="สถานะ" value={selectedStatus} onChange={setSelectedStatus} options={statusOptions} />
              <a
                href={getRouteUrl(sitePoints)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <Route size={16} />
                Route
              </a>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {isLoading && <EmptyState icon={<Layers size={28} />} title="กำลังโหลดไซต์งาน..." />}
              {error && <EmptyState icon={<AlertTriangle size={28} />} title="โหลดข้อมูลไซต์งานไม่สำเร็จ" />}
              {!isLoading && !error && (
                <>
                  <PanelSection title="สีตาม Site Engineer">
                    <div className="grid grid-cols-1 gap-2">
                      {engineerSummary.map((engineer) => (
                        <button
                          key={engineer.name}
                          type="button"
                          onClick={() => {
                            setSelectedEngineer(engineer.name);
                            setDetailOpen(true);
                          }}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:border-orange-200 hover:bg-orange-50"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: engineer.color }} />
                            <span className="truncate text-xs font-black text-slate-800">{engineer.name}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">
                            {engineer.withCoordinates}/{engineer.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </PanelSection>

                  <PanelSection title={effectiveSelectedEngineer === ALL ? "ไซต์ทั้งหมดในตัวกรอง" : `ไซต์ของ ${effectiveSelectedEngineer}`}>
                    {filteredProjects.length === 0 && <EmptyState icon={<MapPinOff size={28} />} title="ไม่พบไซต์ในตัวกรองนี้" />}
                    {filteredProjects.map((project) => (
                      <ProjectListItem
                        key={project.project_id}
                        active={activePoint?.project.project_id === project.project_id}
                        engineerColor={getEngineerColor(getEngineerName(project), engineerColorMap)}
                        hasCoordinates={Boolean(getProjectCoordinates(project, resolvedCoordinates))}
                        project={project}
                        onSelect={() => handleSelectProject(project.project_id)}
                      />
                    ))}
                  </PanelSection>

                  {missingProjects.length > 0 && (
                    <PanelSection title={`ยังไม่มีพิกัดในลิงก์ Maps (${missingProjects.length})`}>
                      {missingProjects.slice(0, 8).map((project) => (
                        <div key={project.project_id} className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                          <div className="text-sm font-black text-slate-900">{project.name || project.project_id}</div>
                          <div className="mt-1 text-xs font-bold text-amber-700">{project.project_id} · {project.se_name || "-"}</div>
                          <div className="mt-2 flex gap-2">
                            <a href={getMapUrl(project)} target="_blank" rel="noreferrer" className="text-xs font-black text-orange-700 hover:underline">Maps</a>
                            <Link href={`/dashboard/projects?edit=${project.project_id}`} className="text-xs font-black text-slate-600 hover:text-orange-700">แก้ลิงก์</Link>
                          </div>
                        </div>
                      ))}
                    </PanelSection>
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {activePoint && detailOpen && (
          <div className="absolute bottom-4 right-4 z-[850] w-[min(440px,calc(100vw-2rem))]">
            <SiteDetailCard point={activePoint} onMinimize={() => setDetailOpen(false)} />
          </div>
        )}

        {activePoint && !detailOpen && (
          <div className="absolute bottom-4 right-4 z-[850] w-[min(360px,calc(100vw-2rem))]">
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-left shadow-2xl backdrop-blur transition hover:border-orange-200"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: activePoint.engineerColor }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-950">{activePoint.project.name || activePoint.project.project_id}</span>
                  <span className="block truncate text-xs font-bold text-slate-500">{getEngineerName(activePoint.project)}</span>
                </span>
              </span>
              <Maximize2 className="shrink-0 text-slate-500" size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LeafletMapCanvas({
  activePoint,
  onSelect,
  points,
}: {
  activePoint: SitePoint | null;
  onSelect: (projectId: string) => void;
  points: SitePoint[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        attributionControl: true,
        doubleClickZoom: true,
        keyboard: false,
        scrollWheelZoom: true,
        zoomControl: true,
      }).setView([defaultCenter.lat, defaultCenter.lng], 10);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
        subdomains: "abcd",
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      }).addTo(map);

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 120);
    }

    void initMap();

    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderMarkers() {
      const map = mapRef.current;
      if (!map) return;

      const L = await import("leaflet");
      if (cancelled) return;

      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;

      if (points.length === 0) {
        map.setView([defaultCenter.lat, defaultCenter.lng], 10);
        return;
      }

      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));

      points.forEach((point) => {
        const marker = L.divIcon({
          className: "",
          html: markerHtml(point),
          iconAnchor: [22, 44],
          iconSize: [44, 44],
          popupAnchor: [0, -40],
        });

        L.marker([point.lat, point.lng], {
          icon: marker,
          title: `${point.project.project_id} ${point.project.name || ""}`,
          zIndexOffset: point.risk === "critical" ? 300 : point.risk === "warning" ? 200 : 100,
        })
          .addTo(layer)
          .bindPopup(renderPopup(point), { maxWidth: 320, minWidth: 240 })
          .on("click", () => onSelectRef.current(point.project.project_id));
      });

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 15);
      } else {
        map.fitBounds(bounds, { maxZoom: 15, padding: [48, 48] });
      }

      setTimeout(() => map.invalidateSize(), 80);
    }

    void renderMarkers();

    return () => {
      cancelled = true;
    };
  }, [points]);

  useEffect(() => {
    if (!mapRef.current || !activePoint) return;
    mapRef.current.panTo([activePoint.lat, activePoint.lng], { animate: true });
  }, [activePoint]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-slate-200" />
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-24 z-[420] mx-auto max-w-md rounded-[24px] border border-slate-200 bg-white/95 p-5 text-center shadow-xl backdrop-blur">
          <MapPinOff className="mx-auto text-slate-400" size={36} />
          <h3 className="mt-2 font-black text-slate-950">ไม่มีพิกัดในตัวกรองนี้</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">ลองเปลี่ยน Site Engineer หรือตรวจลิงก์ Google Maps ของไซต์ที่ยังไม่มีพิกัด</p>
        </div>
      )}
    </div>
  );
}

function markerHtml(point: SitePoint) {
  const color = getMarkerColor(point);
  const riskColor = getRiskColor(point.risk);
  const engineerName = point.engineerName;
  const initials = getEngineerInitials(engineerName);

  return `
    <div title="${escapeHtml(engineerName)}" style="position:relative;width:44px;height:44px;filter:drop-shadow(0 10px 14px rgba(15,23,42,.28));">
      <div style="position:absolute;inset:0;border-radius:16px 16px 16px 4px;background:${color};border:3px solid white;transform:rotate(-45deg);"></div>
      <div style="position:absolute;inset:6px;display:grid;place-items:center;border-radius:999px;background:white;color:#0f172a;font:900 12px/1 Arial,sans-serif;">${escapeHtml(initials)}</div>
      <div style="position:absolute;right:-1px;top:-1px;width:14px;height:14px;border-radius:999px;background:${riskColor};border:2px solid white;"></div>
    </div>
  `;
}

function renderPopup(point: SitePoint) {
  const project = point.project;
  const engineerName = point.engineerName;
  const engineerColor = point.engineerColor;
  return `
    <div style="min-width:220px;max-width:280px;font-family:Arial,sans-serif;">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#ea580c;">
        <span style="width:9px;height:9px;border-radius:999px;background:${engineerColor};display:inline-block;"></span>
        ${escapeHtml(project.project_id)}
      </div>
      <div style="margin-top:2px;font-size:15px;font-weight:900;color:#0f172a;line-height:1.25;">${escapeHtml(project.name || project.project_id)}</div>
      <div style="margin-top:8px;font-size:12px;color:#475569;">SE: ${escapeHtml(engineerName)}</div>
      <div style="margin-top:4px;font-size:12px;color:#475569;">Progress: ${Math.round(percentValue(project.percent_done))}%</div>
      <div style="margin-top:8px;font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(getRiskLabel(point.risk))}</div>
    </div>
  `;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  optionLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  optionLabel?: (value: string) => string;
}) {
  return (
    <label className="relative">
      <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-700 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option} value={option}>{optionLabel ? optionLabel(option) : option}</option>
        ))}
      </select>
    </label>
  );
}

function getRiskOptionLabel(value: string) {
  if (value === ALL) return "ทุกความเสี่ยง";
  return getRiskLabel(value as SiteRisk);
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" | "red" | "orange" }) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-900",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
  }[tone];

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 px-1 text-sm font-black text-slate-900">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ProjectListItem({
  active,
  engineerColor,
  hasCoordinates,
  project,
  onSelect,
}: {
  active: boolean;
  engineerColor: string;
  hasCoordinates: boolean;
  project: Project;
  onSelect: () => void;
}) {
  const risk = getRisk(project);
  const engineerName = getEngineerName(project);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3 text-left transition ${active ? "border-orange-200 bg-orange-50 shadow-sm" : "border-slate-100 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-slate-900">{project.name || project.project_id}</div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-500">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: engineerColor }} />
            <span className="truncate">{project.project_id} · {engineerName}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${getRiskClass(risk)}`}>{getRiskLabel(risk)}</span>
      </div>
      <div className="mt-2 line-clamp-1 text-xs font-medium text-slate-500">{projectLocation(project)}</div>
      {!hasCoordinates && <div className="mt-2 text-xs font-bold text-amber-600">ยังไม่มีพิกัดในลิงก์ Maps</div>}
    </button>
  );
}

function SiteDetailCard({ point, onMinimize }: { point: SitePoint; onMinimize: () => void }) {
  const project = point.project;
  const status = getStatus(project);
  const style = statusStyles[status];
  const overdueTasks = numberValue(project.overdue_tasks);
  const delayDays = numberValue(project.delay_days);
  const missingDays = numberValue(project.daily_report_missing_days);
  const lifecycleAlerts = numberValue(project.lifecycle_alerts_count);
  const engineerName = point.engineerName;
  const engineerColor = point.engineerColor;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/96 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-wide text-orange-600">{project.project_id}</div>
          <h3 className="mt-1 line-clamp-2 text-lg font-black text-slate-950">{project.name || project.project_id}</h3>
          <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{projectLocation(project)}</p>
          <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: engineerColor }} />
            <span className="truncate">{engineerName}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${style.badge}`}>{style.label}</span>
          <button
            type="button"
            onClick={onMinimize}
            className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-orange-200 hover:text-orange-600"
            title="ย่อหน้าต่าง"
            aria-label="ย่อหน้าต่างรายละเอียดไซต์"
          >
            <Minimize2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 p-3">
        <div className="flex items-center justify-between text-sm font-bold text-slate-700">
          <span>ความคืบหน้า</span>
          <span className="text-lg font-black text-slate-950">{Math.round(percentValue(project.percent_done))}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full" style={{ width: `${percentValue(project.percent_done)}%`, backgroundColor: engineerColor }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <RiskChip label={getRiskLabel(point.risk)} risk={point.risk} />
        <RiskChip label={overdueTasks > 0 ? `ล่าช้า ${overdueTasks} งาน` : "ไม่พบงานล่าช้า"} risk={overdueTasks > 0 ? "critical" : "normal"} />
        <RiskChip label={missingDays > 0 ? `ไม่รายงาน ${missingDays} วัน` : "รายงานปกติ"} risk={missingDays > 0 ? "warning" : "normal"} />
        <RiskChip label={lifecycleAlerts > 0 ? `เอกสาร ${lifecycleAlerts} รายการ` : "เอกสารปกติ"} risk={lifecycleAlerts > 0 ? "critical" : "normal"} />
      </div>

      {delayDays > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          งานล่าช้ารวม {delayDays} วัน
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link href={`/dashboard/sites/${project.project_id}`} className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-black text-white transition hover:bg-orange-700">
          เข้าไซต์
        </Link>
        <a href={getDirectionsUrl(point)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white transition hover:bg-slate-800">
          <Navigation size={15} />
          นำทาง
        </a>
        <a href={getMapUrl(project)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 hover:text-orange-600">
          <ExternalLink size={15} />
          Maps
        </a>
      </div>
    </div>
  );
}

function RiskChip({ label, risk }: { label: string; risk: SiteRisk }) {
  return (
    <div className={`rounded-2xl border px-3 py-2 text-xs font-black ${getRiskClass(risk)}`}>
      {label}
    </div>
  );
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
      <div className="mx-auto mb-2 grid place-items-center text-slate-400">{icon}</div>
      {title}
    </div>
  );
}
