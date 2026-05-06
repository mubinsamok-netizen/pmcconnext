"use client";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileCheck2,
  FileText,
  Lock,
  MessageSquareText,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type DefectRound = Record<string, string | number | undefined> & {
  round_id: string;
  document_no?: string;
  title?: string;
  inspection_date?: string;
  inspector_name?: string;
  client_name?: string;
  status?: string;
  item_count?: string | number;
  open_count?: string | number;
  pdf_url?: string;
  locked_at?: string;
};

type DefectItem = Record<string, string | number | undefined> & {
  item_id: string;
  round_id: string;
  item_no?: string | number;
  zone?: string;
  discipline?: string;
  work_category?: string;
  description?: string;
  cause?: string;
  status?: string;
  owner?: string;
  due_date?: string;
  remarks?: string;
  before_photos_json?: string;
  after_photos_json?: string;
  repair_note?: string;
};

type DefectEvidence = Record<string, string | number | undefined> & {
  evidence_id: string;
  round_id: string;
  file_name?: string;
  file_url?: string;
  channel?: string;
  acknowledged_by?: string;
  acknowledged_date?: string;
};

type UploadPayload = {
  name: string;
  type: string;
  dataUrl: string;
};

const ROUND_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  issued: "ออกเอกสารแล้ว",
  acknowledged: "ลูกค้ารับทราบแล้ว",
  in_progress: "กำลังแก้ไข",
  ready_for_recheck: "แก้เสร็จรอตรวจซ้ำ",
  closed: "ปิดงาน",
};

const ITEM_STATUS_LABELS: Record<string, string> = {
  open: "รอแก้ไข",
  in_progress: "กำลังแก้ไข",
  fixed: "แก้ไขเสร็จ",
  rejected: "แก้ไขใหม่",
  passed: "ผ่าน",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-50 text-slate-700 border-slate-200",
  issued: "bg-blue-50 text-blue-700 border-blue-200",
  acknowledged: "bg-emerald-50 text-emerald-700 border-emerald-200",
  open: "bg-red-50 text-red-700 border-red-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  fixed: "bg-cyan-50 text-cyan-700 border-cyan-200",
  rejected: "bg-orange-50 text-orange-700 border-orange-200",
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const DISCIPLINES = [
  ["AR", "สถาปัตยกรรม"],
  ["ST", "โครงสร้าง"],
  ["SN", "สุขาภิบาล"],
  ["EE", "ไฟฟ้า"],
  ["ME", "เครื่องกล"],
  ["LAND", "ภูมิสถาปัตย์"],
  ["OTHER", "อื่น ๆ"],
];

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function statusLabel(value?: string | number) {
  const key = String(value || "");
  return ROUND_STATUS_LABELS[key] || ITEM_STATUS_LABELS[key] || key || "-";
}

function statusClass(value?: string | number) {
  return STATUS_STYLES[String(value || "")] || "bg-slate-50 text-slate-700 border-slate-200";
}

function parsePhotoCount(value?: string | number) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

async function filesToUploads(files: FileList | null, maxFiles = 4): Promise<UploadPayload[]> {
  const selected = Array.from(files || []).filter((file) => file.size > 0).slice(0, maxFiles);
  return await Promise.all(selected.map((file) => new Promise<UploadPayload>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  })));
}

function openPrintDialog(html: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!printWindow) {
    window.alert("เบราว์เซอร์บล็อกหน้าต่าง print กรุณาอนุญาต popup แล้วลองใหม่");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 700);
}

export function DefectsWorkspace({
  projectId,
  projectName,
  clientName,
}: {
  projectId: string;
  projectName: string;
  clientName?: string;
}) {
  const apiPath = `/api/sites/${encodeURIComponent(projectId)}/defects`;
  const { data, error, isLoading, mutate } = useSWR(apiPath, fetcher);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const rounds = useMemo(() => (data?.rounds || []) as DefectRound[], [data?.rounds]);
  const items = useMemo(() => (data?.items || []) as DefectItem[], [data?.items]);
  const evidence = useMemo(() => (data?.evidence || []) as DefectEvidence[], [data?.evidence]);
  const selectedRound = rounds.find((round) => round.round_id === selectedRoundId) || rounds[0];
  const roundItems = selectedRound ? items.filter((item) => item.round_id === selectedRound.round_id) : [];
  const roundEvidence = selectedRound ? evidence.filter((item) => item.round_id === selectedRound.round_id) : [];
  const locked = Boolean(selectedRound?.locked_at || selectedRound?.status === "acknowledged" || selectedRound?.status === "closed");

  function postAction(body: Record<string, unknown>) {
    return fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Request failed");
      return payload;
    });
  }

  async function createRound(formData: FormData) {
    setMessage("");
    const payload = await postAction({
      action: "create_round",
      title: formData.get("title"),
      inspection_date: formData.get("inspection_date"),
      inspector_name: formData.get("inspector_name"),
      client_name: formData.get("client_name"),
      notes: formData.get("notes"),
    });
    await mutate();
    setSelectedRoundId(payload.data?.round_id || "");
    setMessage("สร้างรอบตรวจแล้ว");
  }

  async function addItem(formData: FormData) {
    if (!selectedRound) return;
    setMessage("");
    const beforeUploads = await filesToUploads(formData.get("before_photos") instanceof File ? null : null);
    const fileInput = document.getElementById("defect-before-photos") as HTMLInputElement | null;
    const uploads = beforeUploads.length > 0 ? beforeUploads : await filesToUploads(fileInput?.files || null, 4);
    await postAction({
      action: "add_item",
      round_id: selectedRound.round_id,
      zone: formData.get("zone"),
      discipline: formData.get("discipline"),
      work_category: formData.get("work_category"),
      description: formData.get("description"),
      cause: formData.get("cause"),
      owner: formData.get("owner"),
      due_date: formData.get("due_date"),
      remarks: formData.get("remarks"),
      before_photo_uploads: uploads,
    });
    if (fileInput) {
      fileInput.value = "";
    }
    await mutate();
    setMessage("เพิ่มรายการ defect แล้ว");
  }

  async function issuePdf() {
    if (!selectedRound) return;
    setMessage("");
    const payload = await postAction({ action: "issue_pdf", round_id: selectedRound.round_id });
    await mutate();
    setMessage("ออก PDF แล้ว และเปิด print dialog ให้แล้ว");
    if (payload.document_html) openPrintDialog(payload.document_html);
  }

  async function acknowledge(formData: FormData) {
    if (!selectedRound) return;
    setMessage("");
    const fileInput = document.getElementById("defect-ack-evidence") as HTMLInputElement | null;
    const uploads = await filesToUploads(fileInput?.files || null, 6);
    await postAction({
      action: "acknowledge",
      round_id: selectedRound.round_id,
      channel: formData.get("channel"),
      acknowledged_by: formData.get("acknowledged_by"),
      acknowledged_date: formData.get("acknowledged_date"),
      notes: formData.get("notes"),
      evidence_uploads: uploads,
    });
    if (fileInput) {
      fileInput.value = "";
    }
    await mutate();
    setMessage("บันทึกหลักฐานลูกค้ารับทราบและล็อกรอบตรวจแล้ว");
  }

  async function updateItem(formData: FormData) {
    const itemId = String(formData.get("item_id") || "");
    const fileInput = document.getElementById(`after-${itemId}`) as HTMLInputElement | null;
    const uploads = await filesToUploads(fileInput?.files || null, 4);
    await postAction({
      action: "update_item_status",
      item_id: itemId,
      status: formData.get("status"),
      owner: formData.get("owner"),
      due_date: formData.get("due_date"),
      repair_note: formData.get("repair_note"),
      after_photo_uploads: uploads,
    });
    if (fileInput) {
      fileInput.value = "";
    }
    await mutate();
    setMessage("อัปเดตรายการแล้ว");
  }

  function run(action: (formData: FormData) => Promise<void>, formData: FormData) {
    startTransition(async () => {
      try {
        await action(formData);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-500">รอบตรวจทั้งหมด</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{rounds.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-500">รายการในรอบนี้</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{roundItems.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-500">คงค้าง</div>
          <div className="mt-2 text-2xl font-bold text-red-600">{roundItems.filter((item) => !["passed", "closed"].includes(String(item.status || ""))).length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-500">หลักฐานรับทราบ</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{roundEvidence.length}</div>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error || message.includes("ผิดพลาด") || message.includes("กรุณา") || message.includes("ไม่") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error ? "ไม่สามารถโหลดข้อมูล defect ได้" : message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <form
            action={(formData) => run(createRound, formData)}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <Plus size={18} className="text-orange-600" />
              สร้างรอบตรวจส่งมอบ
            </div>
            <div className="mt-4 space-y-3">
              <input name="title" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="เช่น ตรวจส่งมอบครั้งที่ 1" />
              <input name="inspection_date" type="date" defaultValue={todayInputValue()} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" />
              <input name="inspector_name" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="ผู้ตรวจ/วิศวกร" />
              <input name="client_name" defaultValue={clientName || ""} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="ชื่อลูกค้า/ผู้แทน" />
              <textarea name="notes" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="หมายเหตุรอบตรวจ" />
              <button disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                <Plus size={16} />
                สร้างรอบตรวจ
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <FileText size={18} className="text-blue-600" />
              เลือกรอบตรวจ
            </div>
            <select
              value={selectedRound?.round_id || ""}
              onChange={(event) => setSelectedRoundId(event.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            >
              {rounds.length === 0 ? <option value="">ยังไม่มีรอบตรวจ</option> : null}
              {rounds.map((round) => (
                <option key={round.round_id} value={round.round_id}>
                  {round.document_no || round.round_id} - {round.title || "รอบตรวจ"}
                </option>
              ))}
            </select>
            {selectedRound ? (
              <div className="mt-4 space-y-2 text-sm">
                <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(selectedRound.status)}`}>
                  {locked ? <Lock size={13} /> : <ShieldCheck size={13} />}
                  {statusLabel(selectedRound.status)}
                </div>
                <div className="text-gray-600">{selectedRound.inspection_date || "-"} · {selectedRound.inspector_name || "ยังไม่ระบุผู้ตรวจ"}</div>
                {selectedRound.pdf_url ? (
                  <a href={String(selectedRound.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800">
                    <FileCheck2 size={16} />
                    เปิด PDF ล่าสุด
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">Defect Round</div>
                <h3 className="mt-1 text-xl font-bold text-gray-900">{selectedRound?.title || "ยังไม่ได้เลือกรอบตรวจ"}</h3>
                <p className="mt-1 text-sm text-gray-500">{projectName} · ใช้เอกสาร PDF และรูปแชทเป็นหลักฐานการรับทราบ</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selectedRound || roundItems.length === 0 || locked || isPending}
                  onClick={() => startTransition(() => { issuePdf().catch((err) => setMessage(err instanceof Error ? err.message : "ออก PDF ไม่สำเร็จ")); })}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer size={16} />
                  ออก PDF / Print
                </button>
                <button
                  type="button"
                  onClick={() => mutate()}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <RefreshCw size={16} />
                  รีเฟรช
                </button>
              </div>
            </div>
          </div>

          {selectedRound && !locked ? (
            <form action={(formData) => run(addItem, formData)} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Camera size={18} className="text-orange-600" />
                เพิ่มจุดที่ลูกค้าชี้/จุดตรวจพบ
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input name="zone" required className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="พื้นที่/โซน เช่น ห้องน้ำ - 1" />
                <select name="discipline" defaultValue="AR" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200">
                  {DISCIPLINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input name="work_category" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="งาน เช่น ผนัง, พื้น, หน้าต่าง" />
                <input name="owner" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="ผู้แก้ไข/ทีมรับผิดชอบ" />
                <textarea name="description" required rows={3} className="md:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="รายละเอียดรายการที่ต้องแก้ไข" />
                <textarea name="cause" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="สาเหตุ/ข้อมูลประกอบ" />
                <textarea name="remarks" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="หมายเหตุ" />
                <input name="due_date" type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  <Upload size={16} />
                  รูปก่อนแก้
                  <input id="defect-before-photos" name="before_photos" type="file" accept="image/*" multiple className="sr-only" />
                </label>
              </div>
              <button disabled={isPending} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60">
                <Plus size={16} />
                เพิ่มรายการ
              </button>
            </form>
          ) : selectedRound ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-bold"><Lock size={16} /> รอบตรวจนี้ล็อกแล้ว</div>
              <p className="mt-1">เพิ่มรายการใหม่ไม่ได้แล้ว ถ้าลูกค้าแจ้งเพิ่มหลังรับทราบ ให้สร้างรอบตรวจเพิ่มเติมเพื่อแยกหลักฐานให้ชัดเจน</p>
            </div>
          ) : null}

          {selectedRound && selectedRound.pdf_url && !locked ? (
            <form action={(formData) => run(acknowledge, formData)} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <MessageSquareText size={18} className="text-emerald-600" />
                แนบหลักฐานลูกค้ารับทราบจากแชท
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select name="channel" defaultValue="LINE" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="LINE">LINE</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Email">Email</option>
                  <option value="Other">อื่น ๆ</option>
                </select>
                <input name="acknowledged_date" type="date" defaultValue={todayInputValue()} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200" />
                <input name="acknowledged_by" defaultValue={clientName || ""} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200" placeholder="ผู้ที่ตอบรับในแชท" />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  <Upload size={16} />
                  แคปหน้าจอแชท
                  <input id="defect-ack-evidence" type="file" accept="image/*" multiple className="sr-only" />
                </label>
                <textarea name="notes" rows={2} className="md:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200" placeholder="หมายเหตุ เช่น ลูกค้าตอบว่า รับทราบตามเอกสาร" />
              </div>
              <button disabled={isPending} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                <ShieldCheck size={16} />
                บันทึกลูกค้ารับทราบและล็อกเอกสาร
              </button>
            </form>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <AlertCircle size={18} className="text-red-600" />
                รายการ defect ในรอบนี้
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">No.</th>
                    <th className="px-4 py-3 font-semibold">พื้นที่ / รายการ</th>
                    <th className="px-4 py-3 font-semibold">หมวด</th>
                    <th className="px-4 py-3 font-semibold">รูป</th>
                    <th className="px-4 py-3 font-semibold">สถานะ</th>
                    <th className="px-4 py-3 font-semibold">อัปเดตงานแก้ไข</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roundItems.map((item) => (
                    <tr key={item.item_id} className="align-top">
                      <td className="px-4 py-4 font-semibold text-gray-500">{item.item_no}</td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{item.zone || "-"}</div>
                        <div className="mt-1 text-gray-700">{item.description || "-"}</div>
                        {item.cause ? <div className="mt-1 text-xs text-gray-500">สาเหตุ: {item.cause}</div> : null}
                        {item.remarks ? <div className="mt-1 text-xs text-gray-500">หมายเหตุ: {item.remarks}</div> : null}
                      </td>
                      <td className="px-4 py-4 text-gray-600">{item.discipline || "-"}</td>
                      <td className="px-4 py-4 text-xs text-gray-500">
                        ก่อนแก้ {parsePhotoCount(item.before_photos_json)} รูป<br />
                        หลังแก้ {parsePhotoCount(item.after_photos_json)} รูป
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <form action={(formData) => run(updateItem, formData)} className="grid min-w-[320px] gap-2">
                          <input type="hidden" name="item_id" value={item.item_id} />
                          <div className="grid grid-cols-2 gap-2">
                            <select name="status" defaultValue={String(item.status || "open")} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-200">
                              {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <input name="due_date" type="date" defaultValue={String(item.due_date || "")} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-200" />
                          </div>
                          <input name="owner" defaultValue={String(item.owner || "")} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-200" placeholder="ผู้แก้ไข" />
                          <input name="repair_note" defaultValue={String(item.repair_note || "")} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-200" placeholder="บันทึกการแก้ไข" />
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                            <Upload size={14} />
                            รูปหลังแก้
                            <input id={`after-${item.item_id}`} type="file" accept="image/*" multiple className="sr-only" />
                          </label>
                          <button disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                            <CheckCircle2 size={14} />
                            บันทึก
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {roundItems.length === 0 && !isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายการ defect ในรอบนี้</td>
                    </tr>
                  ) : null}
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {roundEvidence.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <ShieldCheck size={18} className="text-emerald-600" />
                หลักฐานการรับทราบ
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {roundEvidence.map((item) => (
                  <a key={item.evidence_id} href={String(item.file_url || "#")} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50">
                    <div className="font-semibold text-gray-900">{item.file_name || "หลักฐาน"}</div>
                    <div className="mt-1 text-xs text-gray-500">{item.channel || "-"} · {item.acknowledged_by || "-"} · {item.acknowledged_date || "-"}</div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
