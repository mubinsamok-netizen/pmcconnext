"use client";

import { useMemo, useState } from "react";
import { BarChart3, FileSpreadsheet, Loader2, Printer, RefreshCcw } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { MasterProject } from "@/lib/masterProjects";

type Row = Record<string, string>;
type ReportRecord = Record<string, string | number | undefined>;
type WeeklySummary = {
  week_start: string;
  week_end: string;
  daily_summaries: Row[];
  work_quantities: Row[];
  materials: Row[];
  machinery: Row[];
  personnel: Row[];
  progress: Row[];
  instructions: Row[];
  approvals: Row[];
  field_engineer_name: string;
  project_manager_name: string;
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

function countRows(rows?: Row[]) {
  return rows?.filter((row) => Object.values(row).some(Boolean)).length || 0;
}

export function WeeklyReportsPanel({ project }: { project: MasterProject }) {
  const [weekStart, setWeekStart] = useState(todayValue());
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const weekEnd = addDays(weekStart, 6);

  const reportKey = `/api/weekly-reports?project_id=${encodeURIComponent(project.project_id)}`;
  const { data, isLoading, mutate } = useSWR(reportKey, fetcher);
  const reports = useMemo(() => (data?.data || []) as ReportRecord[], [data?.data]);

  const loadPreview = async () => {
    setLoadingSummary(true);
    setMessage("");
    setError("");
    try {
      const url = `/api/weekly-reports?mode=summary&project_id=${encodeURIComponent(project.project_id)}&week_start=${weekStart}&week_end=${weekEnd}`;
      const response = await fetch(url);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ดึงข้อมูลสรุปรายสัปดาห์ไม่สำเร็จ");
      setSummary(result.data);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "ดึงข้อมูลสรุปรายสัปดาห์ไม่สำเร็จ");
    } finally {
      setLoadingSummary(false);
    }
  };

  const createReport = async () => {
    setCreating(true);
    setMessage("");
    setError("");
    const formData = new FormData();
    formData.set("project_id", project.project_id);
    formData.set("project_drive_folder_id", project.drive_folder_id || "");
    formData.set("week_start", weekStart);
    formData.set("week_end", weekEnd);

    try {
      const response = await fetch("/api/weekly-reports", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "สร้างรายงานประจำสัปดาห์ไม่สำเร็จ");
      setMessage(`สร้างรายงาน ${result.data?.document_no || ""} สำเร็จ`);
      await mutate();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "สร้างรายงานประจำสัปดาห์ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <BarChart3 size={20} className="text-orange-600" />
            Weekly Report Dashboard
          </div>
          <div className="text-sm text-gray-500">สร้างจาก Daily Reports และ Tasks ตามช่วงวันที่</div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Info label="รายงานทั้งหมด" value={`${reports.length}`} />
          <Info label="Daily ใน Preview" value={`${countRows(summary?.daily_summaries)}`} />
          <Info label="Tasks ใน Preview" value={`${countRows(summary?.progress)}`} />
          <Info label="Project Manager" value={project.pm_name || "Project Manager"} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <Field label="วันเริ่มต้นสัปดาห์">
            <input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} className="form-input" />
          </Field>
          <Field label="วันสิ้นสุดสัปดาห์">
            <input type="date" value={weekEnd} readOnly className="form-input bg-gray-50 text-gray-500" />
          </Field>
          <button onClick={loadPreview} disabled={loadingSummary} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70">
            {loadingSummary ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
            Preview
          </button>
          <button onClick={createReport} disabled={creating || !summary} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
            {creating ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
            สร้าง PDF
          </button>
        </div>
      </section>

      {summary && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-bold text-gray-900">
            <FileSpreadsheet size={20} className="text-orange-600" />
            Preview รายงานประจำสัปดาห์
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Info label="ช่วงรายงาน" value={`${formatDate(summary.week_start)} - ${formatDate(summary.week_end)}`} />
            <Info label="วิศวกรสนาม" value={summary.field_engineer_name || "บัญชีผู้ใช้ปัจจุบัน"} />
            <Info label="ผู้ตรวจสอบ" value={summary.project_manager_name || "Project Manager"} />
          </div>
          <PreviewTable title="Daily Report Source Summary" rows={summary.daily_summaries} columns={["date", "weather", "workers", "work_done", "issues"]} />
          <PreviewTable title="Task Progress Summary" rows={summary.progress} columns={["category", "planned_percent", "actual_percent", "status", "note"]} />
          <PreviewTable title="Materials From Daily Reports" rows={summary.materials} columns={["name", "this_week", "cumulative", "unit"]} />
          <PreviewTable title="Machinery From Daily Reports" rows={summary.machinery} columns={["name", "qty", "usage", "note"]} />
          <PreviewTable title="Personnel From Daily Reports" rows={summary.personnel} columns={["role", "avg_qty", "work_days", "note"]} />
          <PreviewTable title="Instructions / Corrective Actions" rows={summary.instructions} columns={["date", "description", "ordered_by", "status"]} />
          <PreviewTable title="VO / Payment / Documents" rows={summary.approvals} columns={["document_no", "type", "subject", "submitted_date", "status", "owner", "note"]} />
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 font-bold text-gray-900">ประวัติรายงานประจำสัปดาห์</div>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">ช่วงสัปดาห์</th>
                <th className="px-4 py-3">เลขที่เอกสาร</th>
                <th className="px-4 py-3 text-right">ไฟล์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((report) => (
                <tr key={String(report.report_id)}>
                  <td className="px-4 py-3">{formatDate(report.week_start)} - {formatDate(report.week_end)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{report.document_no}</td>
                  <td className="px-4 py-3 text-right">
                    {report.pdf_url ? <a href={String(report.pdf_url)} target="_blank" rel="noreferrer" className="font-semibold text-orange-600 hover:underline">PDF</a> : "-"}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && !isLoading && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายงานประจำสัปดาห์</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Alert({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 text-sm font-medium ${tone === "success" ? "border-green-100 bg-green-50 text-green-700" : "border-red-100 bg-red-50 text-red-700"}`}>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function PreviewTable({ title, rows, columns }: { title: string; rows: Row[]; columns: string[] }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-sm font-bold text-gray-900">{title}</div>
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>{columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => <td key={column} className="px-3 py-2 align-top text-gray-700">{row[column] || "-"}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">ไม่มีข้อมูลในช่วงนี้</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
