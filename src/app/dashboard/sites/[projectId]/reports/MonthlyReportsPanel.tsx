"use client";

import { useMemo, useState } from "react";
import { BarChart3, BookOpenCheck, FileSpreadsheet, Loader2, Printer, RefreshCcw } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { MasterProject } from "@/lib/masterProjects";

type Row = Record<string, string>;
type ReportRecord = Record<string, string | number | undefined>;
type MonthlySummary = {
  month: string;
  month_start: string;
  month_end: string;
  preface: string;
  meeting_summary: string;
  next_month_plan_note: string;
  weekly_reports: Row[];
  daily_summary: Row[];
  progress: Row[];
  next_month_plan: Row[];
  photos: Row[];
  weather: Row[];
  personnel: Row[];
  machinery: Row[];
  materials: Row[];
  issues: Row[];
  approvals: Row[];
  certifications: Row[];
  inspections: Row[];
  field_engineer_name: string;
  project_manager_name: string;
};

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function formatDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

function formatMonth(value?: string | number) {
  if (!value) return "-";
  const date = new Date(`${value}-01T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

function countRows(rows?: Row[]) {
  return rows?.filter((row) => Object.values(row).some(Boolean)).length || 0;
}

function averageProgress(rows?: Row[]) {
  const values = (rows || [])
    .map((row) => Number(row.actual_percent || row.percent_done || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return "-";
  return `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)}%`;
}

export function MonthlyReportsPanel({ project }: { project: MasterProject }) {
  const [month, setMonth] = useState(currentMonthValue());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [preface, setPreface] = useState("");
  const [meetingSummary, setMeetingSummary] = useState("");
  const [nextMonthPlanNote, setNextMonthPlanNote] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reportKey = `/api/monthly-reports?project_id=${encodeURIComponent(project.project_id)}`;
  const { data, isLoading, mutate } = useSWR(reportKey, fetcher);
  const reports = useMemo(() => (data?.data || []) as ReportRecord[], [data?.data]);

  const loadPreview = async () => {
    setLoadingSummary(true);
    setMessage("");
    setError("");
    try {
      const url = `/api/monthly-reports?mode=summary&project_id=${encodeURIComponent(project.project_id)}&month=${month}`;
      const response = await fetch(url);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ดึงข้อมูล Preview รายงานประจำเดือนไม่สำเร็จ");
      const nextSummary = result.data as MonthlySummary;
      setSummary(nextSummary);
      setPreface((current) => current || nextSummary.preface || "");
      setMeetingSummary((current) => current || nextSummary.meeting_summary || "");
      setNextMonthPlanNote((current) => current || nextSummary.next_month_plan_note || "");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "ดึงข้อมูล Preview รายงานประจำเดือนไม่สำเร็จ");
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
    formData.set("month", month);
    formData.set("preface", preface);
    formData.set("meeting_summary", meetingSummary);
    formData.set("next_month_plan_note", nextMonthPlanNote);

    try {
      const response = await fetch("/api/monthly-reports", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "สร้างรายงานประจำเดือนไม่สำเร็จ");
      setMessage(`สร้างรายงาน ${result.data?.document_no || ""} สำเร็จ`);
      await mutate();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "สร้างรายงานประจำเดือนไม่สำเร็จ");
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
            Monthly Report Dashboard
          </div>
          <div className="text-sm text-gray-500">สรุปจาก Weekly Report, Daily Report และ Tasks ตามเดือนที่เลือก</div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Info label="รายงานทั้งหมด" value={`${reports.length}`} />
          <Info label="Weekly ใน Preview" value={`${countRows(summary?.weekly_reports)}`} />
          <Info label="Daily ใน Preview" value={`${countRows(summary?.daily_summary)}`} />
          <Info label="Progress เฉลี่ย" value={averageProgress(summary?.progress)} />
          <Info label="ประเด็นติดตาม" value={`${countRows(summary?.issues)}`} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field label="เดือนที่ต้องการออกรายงาน">
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setSummary(null);
                setPreface("");
                setMeetingSummary("");
                setNextMonthPlanNote("");
              }}
              className="form-input"
            />
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
            <BookOpenCheck size={20} className="text-orange-600" />
            Preview รายงานประจำเดือน {formatMonth(summary.month)}
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Info label="ช่วงรายงาน" value={`${formatDate(summary.month_start)} - ${formatDate(summary.month_end)}`} />
            <Info label="วิศวกรสนาม" value={summary.field_engineer_name || "บัญชีผู้ใช้ปัจจุบัน"} />
            <Info label="ผู้ตรวจสอบ" value={summary.project_manager_name || "Project Manager"} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="คำนำ / หมายเหตุรายงาน">
              <textarea value={preface} onChange={(event) => setPreface(event.target.value)} rows={5} className="form-input resize-none" />
            </Field>
            <Field label="สรุปผลการประชุม">
              <textarea value={meetingSummary} onChange={(event) => setMeetingSummary(event.target.value)} rows={5} className="form-input resize-none" />
            </Field>
            <Field label="แผนดำเนินงานเดือนถัดไป">
              <textarea value={nextMonthPlanNote} onChange={(event) => setNextMonthPlanNote(event.target.value)} rows={5} className="form-input resize-none" />
            </Field>
          </div>

          <PreviewTable title="Weekly Reports ที่ใช้ประกอบ" rows={summary.weekly_reports} columns={["week_period", "document_no", "progress_count", "issue_count"]} />
          <PreviewTable title="สรุปความก้าวหน้าปัจจุบัน" rows={summary.progress} columns={["category", "item", "planned_percent", "actual_percent", "variance", "status"]} />
          <PreviewTable title="แผนเดือนถัดไปจาก Tasks" rows={summary.next_month_plan} columns={["category", "item", "period", "status", "note"]} />
          <PreviewTable title="ปัญหา/อุปสรรคและการแก้ไข" rows={summary.issues} columns={["date", "description", "solution", "status"]} />
          <PreviewTable title="รูปถ่ายความก้าวหน้า" rows={summary.photos} columns={["date", "document_no", "count", "folder_url"]} />
          <PreviewTable title="แรงงาน" rows={summary.personnel} columns={["role", "total_qty", "avg_qty", "work_days"]} />
          <PreviewTable title="เครื่องจักร" rows={summary.machinery} columns={["name", "qty", "hours", "note"]} />
          <PreviewTable title="วัสดุที่ใช้" rows={summary.materials} columns={["name", "qty", "unit", "note"]} />
          <PreviewTable title="สภาพอากาศ" rows={summary.weather} columns={["weather", "days"]} />
          <PreviewTable title="VO / Payment / Documents" rows={summary.approvals} columns={["document_no", "type", "subject", "status", "note"]} />
          <PreviewTable title="Defect / Inspection" rows={summary.inspections} columns={["date", "item", "result", "note"]} />
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 font-bold text-gray-900">
          <FileSpreadsheet size={20} className="text-orange-600" />
          ประวัติรายงานประจำเดือน
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">เดือน</th>
                <th className="px-4 py-3">เลขที่เอกสาร</th>
                <th className="px-4 py-3">ผู้จัดทำ</th>
                <th className="px-4 py-3 text-right">ไฟล์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((report) => (
                <tr key={String(report.report_id)}>
                  <td className="px-4 py-3">{formatMonth(report.month)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{report.document_no}</td>
                  <td className="px-4 py-3">{report.field_engineer_name || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    {report.pdf_url ? <a href={String(report.pdf_url)} target="_blank" rel="noreferrer" className="font-semibold text-orange-600 hover:underline">PDF</a> : "-"}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && !isLoading && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายงานประจำเดือน</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
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
