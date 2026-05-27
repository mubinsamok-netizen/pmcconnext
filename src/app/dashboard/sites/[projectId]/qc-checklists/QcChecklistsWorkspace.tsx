"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  QC_APPROVAL_LABELS,
  QC_RESULT_LABELS,
  QC_STATUS_LABELS,
  type QcChecklistItem,
} from "@/lib/qcChecklists";
import { fetcher } from "@/lib/fetcher";

type QcChecklist = Record<string, string | number | undefined> & {
  qc_id: string;
  template_id?: string;
  document_no?: string;
  category?: string;
  phase?: string;
  title?: string;
  status?: string;
  approval_status?: string;
  inspection_date?: string;
  inspected_by_name?: string;
  customer_approved_at?: string;
  customer_approved_by?: string;
  customer_approval_note?: string;
  approval_url?: string;
  items_json?: string;
  evidence_files_json?: string;
  pdf_url?: string;
  notes?: string;
};

type QcTemplate = {
  template_id: string;
  category: string;
  phase: string;
  title: string;
};

type QcResponse = {
  success?: boolean;
  data?: QcChecklist[];
  templates?: QcTemplate[];
  error?: string;
  line?: {
    test_mode?: boolean;
    target_group_id?: string;
  };
};

type UploadPayload = {
  name: string;
  type: string;
  dataUrl: string;
};

const RESULT_OPTIONS: Array<QcChecklistItem["result"]> = ["pending", "pass", "repair", "fail"];
type EditableQcField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseItems(value?: string | number) {
  if (!value) return [] as QcChecklistItem[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as QcChecklistItem[] : [];
  } catch {
    return [];
  }
}

function parseEvidenceCount(value?: string | number) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function statusClass(status?: string | number) {
  const value = String(status || "");
  if (value === "customer_approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "sent_to_customer" || value === "ready_for_customer") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "needs_rework") return "border-red-200 bg-red-50 text-red-700";
  if (value === "in_progress") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function resultClass(result?: string) {
  if (result === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (result === "fail") return "border-red-200 bg-red-50 text-red-700";
  if (result === "repair") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

async function fileToUploadPayload(file: File) {
  return new Promise<UploadPayload>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("อ่านไฟล์แนบไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function itemStats(items: QcChecklistItem[]) {
  const pass = items.filter((item) => item.result === "pass").length;
  const issue = items.filter((item) => item.result === "repair" || item.result === "fail").length;
  return {
    total: items.length,
    pass,
    issue,
    approvalItemCount: pass,
    pending: items.filter((item) => item.result === "pending" || !item.result).length,
  };
}

export default function QcChecklistsWorkspace({
  projectId,
  projectName,
  clientName,
}: {
  projectId: string;
  projectName: string;
  clientName?: string;
}) {
  const endpoint = `/api/sites/${encodeURIComponent(projectId)}/qc-checklists`;
  const { data, error, isLoading, mutate } = useSWR<QcResponse>(endpoint, fetcher);
  const checklists = useMemo(() => data?.data || [], [data?.data]);
  const templates = useMemo(() => data?.templates || [], [data?.templates]);
  const templateGroups = useMemo(() => {
    return templates.reduce((groups, template) => {
      const key = template.category || "อื่น ๆ";
      groups[key] = [...(groups[key] || []), template];
      return groups;
    }, {} as Record<string, QcTemplate[]>);
  }, [templates]);
  const [selectedId, setSelectedId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => {
    return checklists.find((item) => item.qc_id === selectedId) || checklists[0];
  }, [checklists, selectedId]);
  const selectedItems = useMemo(() => parseItems(selected?.items_json), [selected?.items_json]);
  const stats = itemStats(selectedItems);
  const readyForCustomer = stats.approvalItemCount > 0 && stats.issue === 0;
  const canDeleteSelected = selected
    ? String(selected.approval_status || "not_sent") === "not_sent"
      && String(selected.status || "") !== "sent_to_customer"
      && String(selected.status || "") !== "customer_approved"
    : false;
  const approvalBlockReason = stats.total === 0
    ? "ยังไม่มีรายการตรวจ QC"
    : stats.issue > 0
      ? `ยังส่งอนุมัติไม่ได้ เพราะมีรายการต้องแก้ไข/ไม่ผ่าน ${stats.issue} ข้อ`
      : stats.approvalItemCount === 0
        ? "ยังไม่มีรายการที่เลือกผ่านสำหรับส่งอนุมัติ"
        : "";

  const readMetaDraft = (): Partial<QcChecklist> => {
    const root = editorRef.current;
    const field = (name: string) => root?.querySelector<EditableQcField>(`[data-qc-field="${name}"]`)?.value ?? "";
    return {
      category: field("category"),
      phase: field("phase"),
      title: field("title"),
      inspection_date: field("inspection_date"),
      inspected_by_name: field("inspected_by_name"),
      notes: field("notes"),
    };
  };

  const readItemFieldDraft = (itemId: string, fieldName: string, fallback = "") => {
    const root = editorRef.current;
    if (!root) return fallback;
    const fields = Array.from(root.querySelectorAll<EditableQcField>("[data-qc-item-id]"));
    return fields.find((field) => field.dataset.qcItemId === itemId && field.dataset.qcItemField === fieldName)?.value ?? fallback;
  };

  const readItemsDraft = () => selectedItems.map((item) => ({
    ...item,
    section: readItemFieldDraft(item.item_id, "section", item.section),
    title: readItemFieldDraft(item.item_id, "title", item.title),
    acceptance: readItemFieldDraft(item.item_id, "acceptance", item.acceptance),
    result: readItemFieldDraft(item.item_id, "result", item.result) as QcChecklistItem["result"],
    notes: readItemFieldDraft(item.item_id, "notes", item.notes || ""),
  }));

  const request = async (body: Record<string, unknown>, successMessage: string) => {
    setSaving(String(body.action || "save"));
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "ดำเนินการไม่สำเร็จ");
      await mutate();
      setMessage(successMessage);
      return json;
    } catch (requestError: unknown) {
      setMessage(requestError instanceof Error ? requestError.message : "ดำเนินการไม่สำเร็จ");
      return null;
    } finally {
      setSaving("");
    }
  };

  const createChecklist = async () => {
    const targetTemplate = templateId || templates[0]?.template_id;
    if (!targetTemplate) return;
    const json = await request({
      action: "create",
      template_id: targetTemplate,
      inspection_date: todayInputValue(),
    }, "สร้าง QC Checklist แล้ว");
    if (json?.data?.qc_id) setSelectedId(json.data.qc_id);
  };

  const saveChecklist = async (items: QcChecklistItem[] = selectedItems, patch: Partial<QcChecklist> = {}) => {
    if (!selected) return;
    const uploads = await Promise.all(files.map(fileToUploadPayload));
    const json = await request({
      action: "save",
      qc_id: selected.qc_id,
      category: patch.category ?? selected.category,
      phase: patch.phase ?? selected.phase,
      title: patch.title ?? selected.title,
      status: patch.status ?? selected.status ?? "in_progress",
      approval_status: patch.approval_status ?? selected.approval_status ?? "not_sent",
      inspection_date: patch.inspection_date ?? selected.inspection_date ?? todayInputValue(),
      inspected_by_name: patch.inspected_by_name ?? selected.inspected_by_name ?? "",
      notes: patch.notes ?? selected.notes ?? "",
      items,
      evidence_uploads: uploads,
    }, "บันทึก QC Checklist แล้ว");
    setFiles([]);
    return json;
  };

  const updateChecklistMeta = (patch: Partial<QcChecklist>) => {
    void saveChecklist(readItemsDraft(), { ...readMetaDraft(), ...patch });
  };

  const updateItem = (itemId: string, patch: Partial<QcChecklistItem>) => {
    const nextItems = readItemsDraft().map((item) => item.item_id === itemId ? { ...item, ...patch } : item);
    void saveChecklist(nextItems, readMetaDraft());
  };

  const requestAfterSavingDraft = async (body: Record<string, unknown>, successMessage: string) => {
    const saved = await saveChecklist(readItemsDraft(), readMetaDraft());
    if (!saved?.success) return null;
    return request(body, successMessage);
  };

  const markApproved = async () => {
    if (!selected) return;
    const draftItems = readItemsDraft();
    const draftStats = itemStats(draftItems);
    const draftReadyForCustomer = draftStats.approvalItemCount > 0 && draftStats.issue === 0;
    if (!draftReadyForCustomer) {
      setMessage(approvalBlockReason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนบันทึกอนุมัติ");
      return;
    }
    const approvedBy = window.prompt("ชื่อลูกค้า/ผู้อนุมัติ", clientName || "");
    if (approvedBy === null) return;
    const note = window.prompt("หมายเหตุการอนุมัติ เช่น ลูกค้าตอบอนุมัติใน LINE", "") || "";
    const saved = await saveChecklist(draftItems, readMetaDraft());
    if (!saved?.success) return;
    await request({
      action: "approve",
      qc_id: selected.qc_id,
      customer_approved_by: approvedBy,
      customer_approval_note: note,
    }, "บันทึกลูกค้าอนุมัติ QC แล้ว");
  };

  const deleteChecklist = async () => {
    if (!selected) return;
    if (!canDeleteSelected) {
      setMessage("ลบไม่ได้ เพราะรายการนี้ถูกส่งให้ลูกค้าหรืออนุมัติแล้ว");
      return;
    }
    const confirmed = window.confirm(`ลบ QC Checklist "${selected.title || selected.qc_id}" ใช่ไหม?`);
    if (!confirmed) return;
    const json = await request({
      action: "delete",
      qc_id: selected.qc_id,
    }, "ลบ QC Checklist เรียบร้อยแล้ว");
    if (json?.success) setSelectedId("");
  };

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">{message}</div> : null}
      {error || data?.error ? <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{data?.error || "โหลดข้อมูลไม่สำเร็จ"}</div> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-orange-600" size={18} />
              <h3 className="font-bold text-gray-900">สร้าง QC จาก Template</h3>
            </div>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-orange-200"
            >
              {Object.entries(templateGroups).map(([category, group]) => (
                <optgroup key={category} label={category}>
                  {group.map((template) => (
                    <option key={template.template_id} value={template.template_id}>
                      {template.phase} - {template.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={createChecklist}
              disabled={Boolean(saving) || isLoading}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {saving === "create" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              สร้างรายการตรวจ
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="font-bold text-gray-900">รายการ QC</h3>
              <p className="text-xs text-gray-500">{projectName}</p>
            </div>
            <div className="max-h-[580px] space-y-2 overflow-y-auto p-3">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-400"><Loader2 className="mr-2 inline animate-spin" size={16} />กำลังโหลด</div>
              ) : checklists.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400">ยังไม่มี QC Checklist</div>
              ) : checklists.map((checklist) => (
                <button
                  key={checklist.qc_id}
                  type="button"
                  onClick={() => setSelectedId(checklist.qc_id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selected?.qc_id === checklist.qc_id ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-gray-950">{checklist.title}</div>
                      <div className="mt-1 text-xs font-semibold text-gray-500">{checklist.category} | {checklist.phase}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${statusClass(checklist.status)}`}>
                      {QC_STATUS_LABELS[String(checklist.status || "draft")] || checklist.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">{checklist.document_no || checklist.qc_id}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-400">เลือกหรือสร้าง QC Checklist ก่อน</div>
          ) : (
            <>
              <div ref={editorRef} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-l-4 border-orange-600 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(selected.status)}`}>
                          {QC_STATUS_LABELS[String(selected.status || "draft")] || selected.status}
                        </span>
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">
                          {QC_APPROVAL_LABELS[String(selected.approval_status || "not_sent")] || selected.approval_status}
                        </span>
                      </div>
                      <h3 className="mt-3 text-2xl font-bold text-gray-950">{selected.title}</h3>
                      <p className="mt-1 text-sm text-gray-500">{selected.category} | {selected.phase} | วันที่ตรวจ {selected.inspection_date || "-"}</p>
                      <div key={selected.qc_id} className="mt-4 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="block">
                          <span className="text-xs font-black text-gray-500">หมวด</span>
                          <input
                            data-qc-field="category"
                            defaultValue={selected.category || ""}
                            onBlur={(event) => updateChecklistMeta({ category: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="เช่น SPC"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black text-gray-500">ช่วงงาน</span>
                          <input
                            data-qc-field="phase"
                            defaultValue={selected.phase || ""}
                            onBlur={(event) => updateChecklistMeta({ phase: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="ช่วงงาน"
                          />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="text-xs font-black text-gray-500">หัวข้อเอกสาร</span>
                          <input
                            data-qc-field="title"
                            defaultValue={selected.title || ""}
                            onBlur={(event) => updateChecklistMeta({ title: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="หัวข้อรายการตรวจ"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black text-gray-500">วันที่ตรวจ</span>
                          <input
                            data-qc-field="inspection_date"
                            type="date"
                            defaultValue={selected.inspection_date || todayInputValue()}
                            onBlur={(event) => updateChecklistMeta({ inspection_date: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black text-gray-500">ผู้ตรวจ</span>
                          <input
                            data-qc-field="inspected_by_name"
                            defaultValue={selected.inspected_by_name || ""}
                            onBlur={(event) => updateChecklistMeta({ inspected_by_name: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="ผู้ตรวจ/วิศวกร"
                          />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="text-xs font-black text-gray-500">โซน/รายละเอียดตรวจ</span>
                          <input
                            data-qc-field="notes"
                            defaultValue={selected.notes || ""}
                            onBlur={(event) => updateChecklistMeta({ notes: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="เช่น ชั้น 2 โซน A / ห้องน้ำ / แนวรั้วด้านหน้า"
                          />
                        </label>
                      </div>
                      {selected.approval_status === "approved" ? (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                          ลูกค้าอนุมัติแล้ว: {selected.customer_approved_by || clientName || "-"} {selected.customer_approved_at ? `(${new Date(String(selected.customer_approved_at)).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})` : ""}
                          {selected.customer_approval_note ? <div className="mt-1 text-xs font-semibold text-emerald-700">{selected.customer_approval_note}</div> : null}
                        </div>
                      ) : selected.approval_url ? (
                        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                          ลิงก์อนุมัติถูกส่งแล้ว ระบบจะเปลี่ยนสถานะอัตโนมัติเมื่อลูกค้ากดอนุมัติ
                        </div>
                      ) : null}
                      {!readyForCustomer && selected.approval_status !== "approved" ? (
                        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800">
                          {approvalBlockReason}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => saveChecklist(readItemsDraft(), readMetaDraft())} disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                        {saving === "save" ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                        บันทึก
                      </button>
                      <button onClick={() => requestAfterSavingDraft({ action: "issue_pdf", qc_id: selected.qc_id }, "ออก PDF QC แล้ว")} disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                        <FileText size={16} />
                        ออก PDF
                      </button>
                      <button onClick={() => requestAfterSavingDraft({ action: "send_approval", qc_id: selected.qc_id, origin: window.location.origin }, "ส่ง LINE ขออนุมัติ QC แล้ว")} disabled={Boolean(saving) || !readyForCustomer} title={readyForCustomer ? "" : approvalBlockReason} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                        <Send size={16} />
                        ส่งรายการที่ผ่าน
                      </button>
                      <button onClick={markApproved} disabled={Boolean(saving) || !readyForCustomer} title={readyForCustomer ? "" : approvalBlockReason} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                        <CheckCircle2 size={16} />
                        ลูกค้าอนุมัติแล้ว
                      </button>
                      {selected.pdf_url ? (
                        <a href={String(selected.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                          <ExternalLink size={16} />
                          เปิด PDF
                        </a>
                      ) : null}
                      <button onClick={deleteChecklist} disabled={Boolean(saving) || !canDeleteSelected} title={canDeleteSelected ? "ลบรายการนี้" : "ลบไม่ได้ เพราะส่งให้ลูกค้าหรืออนุมัติแล้ว"} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <Trash2 size={16} />
                        ลบรายการนี้
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 border-y border-gray-100 bg-gray-50 p-5 md:grid-cols-4">
                  <Metric label="ทั้งหมด" value={stats.total} />
                  <Metric label="ผ่าน/จะส่ง" value={stats.approvalItemCount} tone="text-emerald-700" />
                  <Metric label="ต้องแก้ไข/ไม่ผ่าน" value={stats.issue} tone={stats.issue ? "text-red-700" : "text-gray-900"} />
                  <Metric label="ยังไม่ส่ง" value={stats.pending} tone={stats.pending ? "text-orange-700" : "text-gray-900"} />
                </div>

                <div className="p-3 sm:p-5">
                  <div className="max-w-full overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full min-w-[820px] table-fixed text-left text-sm lg:min-w-[960px] 2xl:min-w-[1120px]">
                      <thead className="bg-gray-100 text-sm text-gray-700">
                        <tr>
                          <th className="px-4 py-3 font-black">หมวดตรวจ</th>
                          <th className="px-4 py-3 font-black">รายการตรวจ</th>
                          <th className="px-4 py-3 font-black">เกณฑ์ยอมรับ</th>
                          <th className="px-4 py-3 font-black">ผลตรวจ</th>
                          <th className="px-4 py-3 font-black">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedItems.map((item) => (
                          <tr key={item.item_id} className="align-top">
                            <td className="px-4 py-3">
                              <input
                                data-qc-item-field="section"
                                data-qc-item-id={item.item_id}
                                defaultValue={item.section}
                                onBlur={(event) => updateItem(item.item_id, { section: event.target.value })}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-200"
                                placeholder="หมวดตรวจ"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <textarea
                                data-qc-item-field="title"
                                data-qc-item-id={item.item_id}
                                defaultValue={item.title}
                                rows={2}
                                onBlur={(event) => updateItem(item.item_id, { title: event.target.value })}
                                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm font-extrabold text-gray-950 outline-none focus:ring-2 focus:ring-orange-200"
                                placeholder="รายการตรวจ"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <textarea
                                data-qc-item-field="acceptance"
                                data-qc-item-id={item.item_id}
                                defaultValue={item.acceptance}
                                rows={2}
                                onBlur={(event) => updateItem(item.item_id, { acceptance: event.target.value })}
                                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-orange-200"
                                placeholder="รายละเอียด/เกณฑ์ยอมรับ"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                data-qc-item-field="result"
                                data-qc-item-id={item.item_id}
                                value={item.result || "pending"}
                                onChange={(event) => updateItem(item.item_id, { result: event.target.value as QcChecklistItem["result"] })}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-extrabold outline-none ${resultClass(item.result)}`}
                              >
                                {RESULT_OPTIONS.map((result) => <option key={result} value={result}>{QC_RESULT_LABELS[result]}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                data-qc-item-field="notes"
                                data-qc-item-id={item.item_id}
                                defaultValue={item.notes || ""}
                                onBlur={(event) => updateItem(item.item_id, { notes: event.target.value })}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
                                placeholder="หมายเหตุ"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">หลักฐานประกอบ</h3>
                    <p className="text-sm text-gray-500">ไฟล์แนบแล้ว {parseEvidenceCount(selected.evidence_files_json)} ไฟล์</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                    <Upload size={16} />
                    เลือกไฟล์
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      className="sr-only"
                      onChange={(event) => {
                        setFiles((current) => [...current, ...Array.from(event.target.files || [])].slice(0, 12));
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                {files.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                        <span className="truncate font-semibold text-gray-700">{file.name}</span>
                        <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => saveChecklist(readItemsDraft(), readMetaDraft())} disabled={Boolean(saving)} className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">
                      อัปโหลดหลักฐานและบันทึก
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "text-gray-900" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold text-gray-500">{label}</div>
    </div>
  );
}
