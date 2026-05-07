"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, CheckCircle2, CloudSun, ExternalLink, FileText, Image as ImageIcon, Loader2, Plus, Printer, Send, Trash2, Users } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { MasterProject } from "@/lib/masterProjects";
import { MonthlyReportsPanel } from "./MonthlyReportsPanel";
import { WeeklyReportsPanel } from "./WeeklyReportsPanel";

type ReportRecord = Record<string, string | number | undefined>;
type Row = Record<string, string>;
type RowConfig = { key: string; label: string; type?: string; placeholder?: string };

const weatherOptions = ["แจ่มใส", "มีเมฆบางส่วน", "มีเมฆมาก", "ฝนตกปรอย ๆ", "ฝนตกหนัก", "หยุดงานเนื่องจากสภาพอากาศ"];

const personnelColumns: RowConfig[] = [
  { key: "role", label: "ประเภท/ตำแหน่ง", placeholder: "เช่น วิศวกร, ช่าง, คนงาน" },
  { key: "qty", label: "จำนวน", type: "number" },
  { key: "note", label: "หมายเหตุ" },
];

const machineryColumns: RowConfig[] = [
  { key: "name", label: "เครื่องมือ/เครื่องจักร", placeholder: "เช่น รถเครน, เครื่องตัด" },
  { key: "qty", label: "จำนวน", type: "number" },
  { key: "hours", label: "ชั่วโมงใช้งาน", type: "number" },
  { key: "note", label: "หมายเหตุ" },
];

const materialColumns: RowConfig[] = [
  { key: "name", label: "รายการวัสดุ", placeholder: "เช่น เหล็ก, ปูน, ทราย" },
  { key: "qty", label: "จำนวน", type: "number" },
  { key: "unit", label: "หน่วย" },
  { key: "note", label: "หมายเหตุ" },
];

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function createEmptyRow(columns: RowConfig[]) {
  return Object.fromEntries(columns.map((column) => [column.key, ""]));
}

function projectLocation(project: MasterProject) {
  return [project.address, project.district, project.province].filter(Boolean).join(" ");
}

function sumRows(rows: Row[], key: string) {
  return rows.reduce((sum, row) => {
    const value = Number(row[key] || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function lineStatusText(status?: string | number) {
  if (status === "sent") return "ส่ง LINE แล้ว";
  if (status === "failed") return "ส่ง LINE ไม่สำเร็จ";
  if (status === "disabled") return "ปิดการส่ง LINE";
  if (status === "pending") return "รอส่ง LINE";
  return "ยังไม่มีสถานะ";
}

function driveFolderUrl(folderId?: string | number) {
  const id = String(folderId || "").trim();
  return id ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` : "";
}

function reportPhotosUrl(report?: ReportRecord) {
  return driveFolderUrl(report?.photos_month_folder_id || report?.photos_folder_id);
}

export function DailyReportsWorkspace({
  project,
  allowAdvancedReports = true,
}: {
  project: MasterProject;
  allowAdvancedReports?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "form" | "weekly" | "monthly">("dashboard");
  const [personnel, setPersonnel] = useState<Row[]>([createEmptyRow(personnelColumns)]);
  const [machinery, setMachinery] = useState<Row[]>([createEmptyRow(machineryColumns)]);
  const [materials, setMaterials] = useState<Row[]>([createEmptyRow(materialColumns)]);
  const [reportDate, setReportDate] = useState(todayValue());
  const [loading, setLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lineWarning, setLineWarning] = useState("");

  const reportKey = `/api/reports?project_id=${encodeURIComponent(project.project_id)}`;
  const { data, error: loadError, isLoading, mutate } = useSWR(reportKey, fetcher);
  const reports = useMemo(() => (data?.data || []) as ReportRecord[], [data?.data]);
  const latestReport = reports[0];
  const sentCount = reports.filter((report) => report.line_status === "sent").length;
  const failedCount = reports.filter((report) => report.line_status === "failed").length;
  const photoCount = reports.filter((report) => report.photos_month_folder_id || report.photos_folder_id).length;
  const totalWorkers = latestReport?.workers || sumRows(personnel, "qty");
  const latestPhotosUrl = reportPhotosUrl(latestReport);

  const openPhotoDriveFolder = async () => {
    setDriveLoading(true);
    setError("");
    const driveWindow = window.open("about:blank", "_blank");

    try {
      const response = await fetch("/api/reports/photos/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.project_id,
          date: reportDate,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "เปิดโฟลเดอร์รูปภาพไม่สำเร็จ");
      }

      const folderUrl = String(result?.data?.folder_url || "");
      if (!folderUrl) throw new Error("ไม่พบลิงก์ Google Drive สำหรับรูปภาพ");

      if (driveWindow) {
        driveWindow.opener = null;
        driveWindow.location.href = folderUrl;
      } else {
        window.location.href = folderUrl;
      }
    } catch (openError) {
      driveWindow?.close();
      setError(openError instanceof Error ? openError.message : "เปิดโฟลเดอร์รูปภาพไม่สำเร็จ");
    } finally {
      setDriveLoading(false);
    }
  };

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setLineWarning("");

    const formData = new FormData(event.currentTarget);

    formData.set("personnel_json", JSON.stringify(personnel));
    formData.set("machinery_json", JSON.stringify(machinery));
    formData.set("materials_json", JSON.stringify(materials));
    formData.set("workers", String(sumRows(personnel, "qty") || formData.get("workers") || ""));
    formData.set("uploaded_photos_json", "[]");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        body: formData,
      });
      const responseText = await response.text();
      const result = responseText ? JSON.parse(responseText) : {};
      if (!response.ok) {
        const serverError = typeof result?.error === "string" ? result.error : "";
        throw new Error(serverError || `บันทึกรายงานไม่สำเร็จ (${response.status} ${response.statusText})`);
      }

      const documentNo = String(result.data?.document_no || "");
      const lineStatus = result.data?.line_status;
      const lineError = typeof result.data?.line_error === "string" ? result.data.line_error : "";

      if (lineStatus === "failed") {
        setSuccess(`บันทึกรายงาน ${documentNo} สำเร็จแล้ว`);
        setLineWarning(`แต่ส่ง LINE ไม่สำเร็จ: ${lineError || "กรุณาตรวจสอบการตั้งค่า LINE หรือส่งใหม่ภายหลัง"}`);
      } else if (lineStatus === "sent") {
        setSuccess(`บันทึกรายงาน ${documentNo} และส่ง LINE สำเร็จแล้ว`);
      } else if (lineStatus === "disabled") {
        setSuccess(`บันทึกรายงาน ${documentNo} สำเร็จแล้ว (ไม่ได้ส่ง LINE เพราะปิดการแจ้งเตือน)`);
      } else {
        setSuccess(`บันทึกรายงาน ${documentNo} สำเร็จแล้ว`);
      }
      setPersonnel([createEmptyRow(personnelColumns)]);
      setMachinery([createEmptyRow(machineryColumns)]);
      setMaterials([createEmptyRow(materialColumns)]);
      setReportDate(todayValue());
      event.currentTarget.reset();
      await mutate();
      setActiveTab("dashboard");
    } catch (submitError) {
      if (submitError instanceof SyntaxError) {
        setError("บันทึกรายงานไม่สำเร็จ: server ตอบกลับไม่ใช่ JSON อาจเกิดจาก function timeout หรือ deploy ยังไม่อัปเดต");
      } else {
        setError(submitError instanceof Error ? submitError.message : "บันทึกรายงานไม่สำเร็จ");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="flex gap-2">
          <TabButton active={activeTab === "dashboard"} icon={BarChart3} label="Dashboard" onClick={() => setActiveTab("dashboard")} />
          <TabButton active={activeTab === "form"} icon={FileText} label="กรอก Daily Report" onClick={() => setActiveTab("form")} />
          {allowAdvancedReports && (
            <>
              <TabButton active={activeTab === "weekly"} icon={FileText} label="Weekly Report" onClick={() => setActiveTab("weekly")} />
              <TabButton active={activeTab === "monthly"} icon={FileText} label="Monthly Report" onClick={() => setActiveTab("monthly")} />
            </>
          )}
        </div>
        <div className="px-3 text-sm text-gray-500">
          LINE: {project.line_group_name || project.line_group_id || "ใช้ค่าเริ่มต้นของระบบ"}
        </div>
      </div>

      {success && <Alert tone="success">{success}</Alert>}
      {lineWarning && <Alert tone="warning">{lineWarning}</Alert>}
      {(error || loadError) && <Alert tone="error">{error || loadError?.message || "โหลดข้อมูลรายงานไม่สำเร็จ"}</Alert>}

      {allowAdvancedReports && activeTab === "weekly" ? (
        <WeeklyReportsPanel project={project} />
      ) : allowAdvancedReports && activeTab === "monthly" ? (
        <MonthlyReportsPanel project={project} />
      ) : activeTab === "dashboard" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Metric icon={FileText} label="รายงานทั้งหมด" value={`${reports.length}`} />
            <Metric icon={Send} label="ส่ง LINE สำเร็จ" value={`${sentCount}`} />
            <Metric icon={ImageIcon} label="ลิงก์รูปพร้อมใช้" value={`${photoCount}`} />
            <Metric icon={Users} label="คนงานล่าสุด" value={`${totalWorkers || 0}`} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1.9fr]">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">รายงานล่าสุด</h3>
                <CloudSun size={20} className="text-orange-500" />
              </div>
              {latestReport ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500">เลขที่เอกสาร</div>
                    <div className="text-xl font-bold text-gray-950">{latestReport.document_no || latestReport.report_id}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Info label="วันที่" value={formatDate(latestReport.date)} />
                    <Info label="สภาพอากาศ" value={String(latestReport.weather || "-")} />
                    <Info label="LINE" value={lineStatusText(latestReport.line_status)} />
                    <Info label="ผู้จัดทำ" value={String(latestReport.prepared_by_name || "-")} />
                  </div>
                  {latestReport.line_status === "failed" && latestReport.line_error && (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium text-red-700">
                      LINE error: {String(latestReport.line_error)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {latestReport.pdf_url && (
                      <a href={String(latestReport.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                        <Printer size={16} />
                        เปิด/พิมพ์ PDF
                      </a>
                    )}
                    {latestPhotosUrl && (
                      <a href={latestPhotosUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        <ImageIcon size={16} />
                        เปิดโฟลเดอร์รูปภาพ
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">ยังไม่มีรายงานประจำวันของไซต์นี้</div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">รายการรายงานย้อนหลัง</h3>
                {failedCount > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">{failedCount} รายการส่ง LINE ไม่สำเร็จ</span>}
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">วันที่</th>
                      <th className="px-4 py-3">เลขที่เอกสาร</th>
                      <th className="px-4 py-3">สภาพอากาศ</th>
                      <th className="px-4 py-3">LINE</th>
                      <th className="px-4 py-3 text-right">ไฟล์</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {reports.map((report) => {
                      const photosUrl = reportPhotosUrl(report);
                      return (
                        <tr key={String(report.report_id)} className="text-gray-700">
                          <td className="px-4 py-3">{formatDate(report.date)}</td>
                          <td className="px-4 py-3 font-semibold text-gray-950">{report.document_no || report.report_id}</td>
                          <td className="px-4 py-3">{report.weather || "-"}</td>
                          <td className="px-4 py-3">
                            <div>{lineStatusText(report.line_status)}</div>
                            {report.line_status === "failed" && report.line_error && (
                              <div className="mt-1 max-w-xs text-xs text-red-600">{String(report.line_error)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-3">
                              {report.pdf_url ? (
                                <a href={String(report.pdf_url)} target="_blank" rel="noreferrer" className="font-semibold text-orange-600 hover:underline">PDF</a>
                              ) : null}
                              {photosUrl ? (
                                <a href={photosUrl} target="_blank" rel="noreferrer" className="font-semibold text-gray-600 hover:underline">รูป</a>
                              ) : null}
                              {!report.pdf_url && !photosUrl ? "-" : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {reports.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายงาน</td>
                      </tr>
                    )}
                    {isLoading && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <form onSubmit={submitReport} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="project_id" value={project.project_id} />
          <input type="hidden" name="project_drive_folder_id" value={project.drive_folder_id || ""} />
          <input type="hidden" name="project_name" value={project.name || project.project_id} />
          <input type="hidden" name="project_location" value={projectLocation(project)} />
          <input type="hidden" name="project_start_date" value={project.start_date || ""} />
          <input type="hidden" name="project_end_date" value={project.end_date || ""} />
          <input type="hidden" name="project_owner" value={project.client || ""} />

          <FormSection title="ข้อมูลรายงาน" icon={CalendarDays}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Field label="วันที่รายงาน">
                <input name="date" type="date" required value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="form-input" />
              </Field>
              <Field label="สภาพอากาศ">
                <select name="weather" className="form-input bg-white" defaultValue={weatherOptions[0]}>
                  {weatherOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="จำนวนคนงานรวม">
                <input name="workers" type="number" min="0" value={sumRows(personnel, "qty") || ""} readOnly className="form-input bg-gray-50 text-gray-500" />
              </Field>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Info label="โครงการ" value={`${project.project_id} - ${project.name}`} />
              <Info label="เจ้าของโครงการ" value={project.client || "-"} />
              <Info label="สถานที่ตั้ง" value={projectLocation(project) || "-"} />
              <Info label="ระยะเวลาโครงการ" value={`${formatDate(project.start_date)} - ${formatDate(project.end_date)}`} />
            </div>
          </FormSection>

          <EditableTable title="ตารางบุคลากร" columns={personnelColumns} rows={personnel} setRows={setPersonnel} />
          <EditableTable title="ตารางการใช้งานเครื่องมือ/เครื่องจักร" columns={machineryColumns} rows={machinery} setRows={setMachinery} />
          <EditableTable title="วัสดุที่นำไปใช้" columns={materialColumns} rows={materials} setRows={setMaterials} />

          <FormSection title="รายการงานและปัญหา" icon={CheckCircle2}>
            <div className="grid grid-cols-1 gap-5">
              <Field label="รายการงานที่ปฏิบัติ">
                <textarea name="work_done" required rows={5} className="form-input resize-none" placeholder="สรุปรายการงานที่ดำเนินการในวันนี้" />
              </Field>
              <Field label="ปัญหา/อุปสรรค">
                <textarea name="issues" rows={3} className="form-input resize-none" placeholder="ระบุปัญหาหรืออุปสรรค หากไม่มีให้เว้นว่าง" />
              </Field>
              <Field label="แนวทางการแก้ไข">
                <textarea name="solutions" rows={3} className="form-input resize-none" placeholder="แนวทางแก้ไขหรือการติดตามผล" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="รูปภาพประกอบรายงาน" icon={ImageIcon}>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-4 text-sm text-gray-700 md:flex-row md:items-center md:justify-between">
              <div>
                บันทึกรายงานก่อน แล้วอัปโหลดรูปภาพโดยตรงใน Google Drive จากปุ่ม “ดูรูปภาพประกอบ” ใน LINE หรือปุ่มนี้
              </div>
              <button type="button" onClick={openPhotoDriveFolder} disabled={driveLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-gray-800 ring-1 ring-orange-200 transition hover:bg-orange-50 disabled:cursor-wait disabled:opacity-70">
                {driveLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                เปิด Google Drive
              </button>
            </div>
          </FormSection>

          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-6">
            <button type="button" onClick={() => setActiveTab("dashboard")} className="rounded-xl border border-gray-200 bg-white px-5 py-2 font-semibold text-gray-700 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button disabled={loading} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {loading ? "กำลังบันทึกและส่ง LINE..." : "บันทึกและส่ง LINE"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? "bg-orange-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
      <Icon size={18} />
      {label}
    </button>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <Icon size={20} />
      </div>
      <div className="text-2xl font-bold text-gray-950">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

function Alert({ tone, children }: { tone: "success" | "warning" | "error"; children: React.ReactNode }) {
  const toneClass = {
    success: "border-green-100 bg-green-50 text-green-700",
    warning: "border-amber-100 bg-amber-50 text-amber-800",
    error: "border-red-100 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 text-sm font-medium ${toneClass}`}>
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

function FormSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 p-5">
      <div className="mb-5 flex items-center gap-2 font-bold text-gray-900">
        <Icon size={20} className="text-orange-600" />
        {title}
      </div>
      {children}
    </section>
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

function EditableTable({
  title,
  columns,
  rows,
  setRows,
}: {
  title: string;
  columns: RowConfig[];
  rows: Row[];
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
}) {
  const updateRow = (index: number, key: string, value: string) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };

  return (
    <FormSection title={title} icon={Users}>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-14 px-3 py-3">ลำดับ</th>
              {columns.map((column) => <th key={column.key} className="px-3 py-3">{column.label}</th>)}
              <th className="w-12 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-3 py-3 text-gray-500">{index + 1}</td>
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <input
                      value={row[column.key] || ""}
                      onChange={(event) => updateRow(index, column.key, event.target.value)}
                      type={column.type || "text"}
                      min={column.type === "number" ? "0" : undefined}
                      placeholder={column.placeholder}
                      className="form-input min-w-0 bg-white py-2"
                    />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="ลบแถว" title="ลบแถว">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setRows((current) => [...current, createEmptyRow(columns)])} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
        <Plus size={16} />
        เพิ่มแถว
      </button>
    </FormSection>
  );
}
