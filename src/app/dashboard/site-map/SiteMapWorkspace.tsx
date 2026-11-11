"use client";

import {
  AlertTriangle,
  ExternalLink,
  Filter,
  MapPinOff,
  Maximize2,
  Minimize2,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import LeafletMapCanvas from "./LeafletMapCanvas";
import { fetchMapProjects, useSiteMapHealth } from "./useSiteMapHealth";
import { useSiteMapCoordinates } from "./useSiteMapCoordinates";
import {
  ALL, statusOptions, statusStyles, numberValue, percentValue, projectLocation,
  getStatus, getProjectCoordinates, getRisk, getRiskLabel, getRiskClass, getEngineerName,
  getEngineerInitials, buildEngineerColorMap, getEngineerColor,
  getMarkerColor, getMapUrl, getDirectionsUrl, getRouteUrl, escapeHtml, uniqueValues,
  buildSitePoints, newestLocatedMapProject, type Coordinates, type Project, type ProjectsResponse, type SitePoint, type SiteRisk,
} from "./siteMapModel";

export default function SiteMapWorkspace({ tileUrl }: { tileUrl: string }) {
  const { data, error, isLoading } = useSWR<ProjectsResponse>("/api/projects?mode=basic", fetchMapProjects);
  const baseProjects = useMemo(() => data?.data || [], [data]);
  const [query, setQuery] = useState("");
  const [selectedEngineer, setSelectedEngineer] = useState(ALL);
  const [selectedRisk, setSelectedRisk] = useState<typeof ALL | SiteRisk>(ALL);
  const [selectedStatus, setSelectedStatus] = useState(ALL);
  const [selectedProjectId, selectSite] = useState("");
  const { resolvedCoordinates, pendingProjectIds, isResolving, coordinatesError, retryCoordinates } = useSiteMapCoordinates(baseProjects);
  const newestProject = useMemo(() => newestLocatedMapProject(baseProjects, resolvedCoordinates, pendingProjectIds), [baseProjects, resolvedCoordinates, pendingProjectIds]);
  const activeProjectId = baseProjects.some((project) => project.project_id === selectedProjectId) ? selectedProjectId : newestProject?.project_id || "";
  const [panelOpen, setPanelOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const { projects, healthLoading, healthError, retryHealth } = useSiteMapHealth(baseProjects, activeProjectId);

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

  const sitePoints = useMemo(() => buildSitePoints(filteredProjects, resolvedCoordinates, engineerColorMap), [engineerColorMap, filteredProjects, resolvedCoordinates]);
  const missingProjects = useMemo(() => filteredProjects.filter((project) => !getProjectCoordinates(project, resolvedCoordinates)), [filteredProjects, resolvedCoordinates]);
  const activePoint = useMemo(() => sitePoints.find((point) => point.project.project_id === activeProjectId) || null, [activeProjectId, sitePoints]);
  const selectedProject = filteredProjects.find((project) => project.project_id === activeProjectId);
  const detailPoint = activePoint || (selectedProject ? {
    project: selectedProject, engineerName: getEngineerName(selectedProject),
    engineerColor: getEngineerColor(getEngineerName(selectedProject), engineerColorMap), risk: getRisk(selectedProject),
  } : null);
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
    selectSite(projectId);
    setDetailOpen(true);
  };

  const healthLoadedCount = filteredProjects.filter((project) => project.healthLoaded).length;
  const criticalCount = sitePoints.filter((point) => point.risk === "critical").length;
  const inProgressCount = filteredProjects.filter((project) => getStatus(project) === "In Progress").length;

  return (
    <div className="-m-3 flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden bg-slate-100 sm:-m-5 xl:-m-6">
      <div className="relative z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-orange-600">Site Map</div>
            <h2 className="truncate text-2xl font-black text-slate-950">แผนที่ไซต์งาน</h2>
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
        <LeafletMapCanvas tileUrl={tileUrl} points={sitePoints} activePoint={activePoint} isLoading={isLoading} isResolving={isResolving} hasError={Boolean(error) || coordinatesError} onSelect={handleSelectProject} markerHtml={markerHtml} renderPopup={renderPopup} />

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
              <SummaryCard label="ต้องติดตาม (โหลดแล้ว)" value={healthLoadedCount ? String(criticalCount) : "—"} tone={criticalCount > 0 ? "red" : "slate"} />
              <SummaryCard label="กำลังทำ" value={String(inProgressCount)} tone="orange" />
            </div>

            <p className="mt-2 text-xs text-slate-500">คลิกหมุดหรือชื่อไซต์เพื่อโหลดความคืบหน้า · โหลดรายละเอียดแล้ว {projects.filter((project) => project.healthLoaded).length}/{projects.length} ไซต์ ตัวกรองความเสี่ยงใช้เฉพาะไซต์ที่โหลดแล้ว</p>
            {isResolving && <p role="status" className="mt-2 text-xs text-slate-500">กำลังค้นหาพิกัดเพิ่มเติม หมุดที่พร้อมใช้งานได้แล้ว</p>}
            {coordinatesError && <button type="button" onClick={retryCoordinates} className="mt-2 text-xs font-bold text-orange-700">ค้นหาพิกัดที่โหลดไม่สำเร็จอีกครั้ง</button>}
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
              {isLoading && <div role="status" aria-label="กำลังเตรียมรายการไซต์งาน" className="space-y-3 animate-pulse">{[1, 2, 3].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-200" />)}</div>}
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
                        coordinatesPending={isResolving}
                        project={project}
                        onSelect={() => handleSelectProject(project.project_id)}
                      />
                    ))}
                  </PanelSection>

                  {!isResolving && !coordinatesError && missingProjects.length > 0 && (
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

        {detailPoint && detailOpen && (
          <div className="absolute bottom-4 right-4 z-[850] w-[min(440px,calc(100vw-2rem))]">
            <SiteDetailCard point={detailPoint} coordinatesPending={isResolving} isLoading={healthLoading} hasError={healthError} onRetry={retryHealth} onMinimize={() => setDetailOpen(false)} />
          </div>
        )}

        {detailPoint && !detailOpen && (
          <div className="absolute bottom-4 right-4 z-[850] w-[min(360px,calc(100vw-2rem))]">
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-left shadow-2xl backdrop-blur transition hover:border-orange-200"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: detailPoint.engineerColor }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-950">{detailPoint.project.name || detailPoint.project.project_id}</span>
                  <span className="block truncate text-xs font-bold text-slate-500">{getEngineerName(detailPoint.project)}</span>
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

function markerHtml(point: SitePoint) {
  const color = getMarkerColor(point);
  const engineerName = point.engineerName;
  const initials = getEngineerInitials(engineerName);

  return `
    <div title="${escapeHtml(engineerName)}" style="position:relative;width:44px;height:44px;filter:drop-shadow(0 10px 14px rgba(15,23,42,.28));">
      <div style="position:absolute;inset:0;border-radius:16px 16px 16px 4px;background:${color};border:3px solid white;transform:rotate(-45deg);"></div>
      <div style="position:absolute;inset:6px;display:grid;place-items:center;border-radius:999px;background:white;color:#0f172a;font:900 12px/1 Arial,sans-serif;">${escapeHtml(initials)}</div>
      <div data-map-risk-dot style="position:absolute;right:-1px;top:-1px;width:14px;height:14px;border-radius:999px;background:#94a3b8;border:2px solid white;"></div>
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
      <div style="margin-top:4px;font-size:12px;color:#475569;">Progress: ${project.healthLoaded ? `${Math.round(percentValue(project.percent_done))}%` : "กำลังโหลดรายละเอียด"}</div>
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
  coordinatesPending,
  project,
  onSelect,
}: {
  active: boolean;
  engineerColor: string;
  hasCoordinates: boolean;
  coordinatesPending: boolean;
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
      {!hasCoordinates && <div className="mt-2 text-xs font-bold text-amber-600">{coordinatesPending ? "กำลังค้นหาพิกัด" : "ยังไม่มีพิกัดในลิงก์ Maps"}</div>}
    </button>
  );
}

function SiteDetailCard({ point, coordinatesPending, isLoading, hasError, onRetry, onMinimize }: { point: Omit<SitePoint, "lat" | "lng"> & Partial<Coordinates>; coordinatesPending: boolean; isLoading: boolean; hasError: boolean; onRetry: () => void; onMinimize: () => void }) {
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

      {point.lat === undefined && <p className="mt-2 text-xs text-amber-700">{coordinatesPending ? "กำลังค้นหาพิกัดของไซต์" : "ยังไม่มีพิกัดที่แสดงบนแผนที่ได้ กรุณาตรวจลิงก์ Maps ของไซต์"}</p>}
      {isLoading && !project.healthLoaded && <div role="status" aria-label="กำลังโหลดความคืบหน้าของไซต์" className="mt-3 animate-pulse rounded-2xl bg-slate-50 p-3"><div className="h-5 w-2/3 rounded bg-slate-200" /><div className="mt-3 h-3 rounded bg-slate-200" /></div>}
      {hasError && <div role="alert" className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">โหลดความคืบหน้าไม่สำเร็จ <button type="button" onClick={onRetry} className="font-bold underline">ลองโหลดอีกครั้ง</button></div>}
      {project.healthLoaded && <>
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

      </>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link href={`/dashboard/sites/${project.project_id}`} className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-3 py-2.5 text-sm font-black text-white transition hover:bg-orange-700">
          เข้าไซต์
        </Link>
        <a href={getDirectionsUrl(point.lat !== undefined && point.lng !== undefined ? { ...point, lat: point.lat, lng: point.lng } : project)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white transition hover:bg-slate-800">
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
