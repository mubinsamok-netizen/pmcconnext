"use client";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  ListPlus,
  Lock,
  MessageSquareText,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useMemo, useState, useTransition, type ComponentType } from "react";
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
  extension_days?: string | number;
  pdf_url?: string;
  locked_at?: string;
  approval_url?: string;
  sent_to_customer_at?: string;
  line_group_id?: string;
  line_message?: string;
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

type DefectPhoto = {
  file_id?: string;
  file_name?: string;
  file_url?: string;
  mime_type?: string;
};

type TabKey = "rounds" | "items" | "document" | "acknowledgement" | "tracking";

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

const TABS: Array<{ key: TabKey; label: string; description: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: "rounds", label: "รอบตรวจ", description: "สร้างและเลือกรอบ", icon: ClipboardList },
  { key: "items", label: "รายการ Defect", description: "เพิ่มจุดที่ลูกค้าชี้", icon: ListPlus },
  { key: "document", label: "เอกสาร", description: "ออก PDF / Print", icon: Printer },
  { key: "acknowledgement", label: "รับทราบ", description: "แนบแชทลูกค้า", icon: MessageSquareText },
  { key: "tracking", label: "ติดตามแก้ไข", description: "รูปหลังแก้และปิดงาน", icon: CheckCircle2 },
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

function parsePhotoRefs(value?: string | number) {
  if (!value) return [] as DefectPhoto[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as DefectPhoto[] : [];
  } catch {
    return [];
  }
}

function escapeHtml(value?: string | number | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function photoSrc(photo: DefectPhoto, baseUrl: string) {
  if (photo.file_id) return `${baseUrl}/api/drive/files/${encodeURIComponent(photo.file_id)}`;
  return photo.file_url || "";
}

function formatPrintDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(String(value).includes("T") ? String(value) : `${String(value)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function buildTrackingReportHtml({
  round,
  items,
  projectName,
  clientName,
  baseUrl,
}: {
  round: DefectRound;
  items: DefectItem[];
  projectName: string;
  clientName?: string;
  baseUrl: string;
}) {
  const openCount = items.filter((item) => !["passed", "closed"].includes(String(item.status || ""))).length;
  const fixedCount = items.filter((item) => ["fixed", "passed", "closed"].includes(String(item.status || ""))).length;
  const itemSections = items.map((item) => {
    const beforePhotos = parsePhotoRefs(item.before_photos_json).slice(0, 2);
    const afterPhotos = parsePhotoRefs(item.after_photos_json).slice(0, 2);
    const renderPhotos = (photos: DefectPhoto[], label: string) => photos.length
      ? photos.map((photo) => {
          const src = photoSrc(photo, baseUrl);
          return src ? `
            <figure class="photo">
              <img src="${escapeHtml(src)}" alt="${escapeHtml(photo.file_name || label)}">
              <figcaption>${escapeHtml(label)}${photo.file_name ? `: ${escapeHtml(photo.file_name)}` : ""}</figcaption>
            </figure>
          ` : "";
        }).join("")
      : `<div class="photo empty">${escapeHtml(label)}: ยังไม่มีรูป</div>`;

    return `
      <section class="item">
        <div class="item-head">
          <div>
            <div class="item-no">#${escapeHtml(item.item_no || "-")} ${escapeHtml(item.zone || "-")}</div>
            <h3>${escapeHtml(item.description || "-")}</h3>
          </div>
          <span class="status">${escapeHtml(statusLabel(item.status))}</span>
        </div>
        <div class="meta">
          <div><strong>หมวด:</strong> ${escapeHtml(item.discipline || "-")}</div>
          <div><strong>ผู้รับผิดชอบ:</strong> ${escapeHtml(item.owner || "-")}</div>
          <div><strong>กำหนดแก้:</strong> ${escapeHtml(formatPrintDate(item.due_date))}</div>
          <div><strong>สาเหตุ:</strong> ${escapeHtml(item.cause || "-")}</div>
        </div>
        <div class="repair-note"><strong>บันทึกการแก้ไข:</strong> ${escapeHtml(item.repair_note || item.remarks || "-")}</div>
        <div class="photos">
          ${renderPhotos(beforePhotos, "ก่อนแก้")}
          ${renderPhotos(afterPhotos, "หลังแก้")}
        </div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <base href="${escapeHtml(baseUrl.replace(/\/$/, "") + "/")}">
  <title>${escapeHtml(round.document_no || round.title || "Defect Follow-up")}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: "Sarabun", "Noto Sans Thai", Tahoma, Arial, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm; }
    .header { display: grid; grid-template-columns: 112px 1fr; gap: 14px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 10px; }
    .header img { width: 104px; height: auto; display: block; }
    .company { font-size: 10px; color: #475569; line-height: 1.45; }
    h1 { margin: 2px 0 4px; font-size: 19px; line-height: 1.25; color: #111827; }
    .subtitle { font-size: 11px; color: #64748b; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 12px; }
    .box { border: 1px solid #d1d5db; padding: 7px; font-size: 10px; min-height: 40px; }
    .box strong { display: block; font-size: 14px; color: #111827; margin-top: 2px; }
    .item { margin-top: 12px; break-inside: avoid; border: 1px solid #d1d5db; padding: 8px; }
    .item-head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .item-no { font-size: 10px; font-weight: 800; color: #f97316; }
    h3 { margin: 2px 0 0; font-size: 13px; }
    .status { height: fit-content; white-space: nowrap; border: 1px solid #fed7aa; background: #fff7ed; color: #c2410c; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 900; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 12px; margin-top: 7px; font-size: 10.5px; color: #334155; }
    .repair-note { margin-top: 7px; border: 1px solid #e5e7eb; background: #f8fafc; padding: 6px; min-height: 28px; font-size: 10.5px; line-height: 1.45; }
    .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-top: 8px; }
    .photo { margin: 0; border: 1px solid #e5e7eb; padding: 5px; }
    .photo img { width: 100%; height: 54mm; object-fit: contain; background: #f8fafc; display: block; }
    .photo figcaption, .photo.empty { margin-top: 4px; color: #475569; font-size: 9.5px; line-height: 1.35; }
    .photo.empty { min-height: 28mm; display: grid; place-items: center; border-style: dashed; margin: 0; }
    .footer { margin-top: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; text-align: center; font-size: 10px; }
    .sign-line { height: 34px; border-bottom: 1px solid #111827; margin-bottom: 6px; }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <img src="${escapeHtml(baseUrl.replace(/\/$/, "") + "/logo.png")}" alt="Pichayamongkol Construction">
      <div>
        <div class="company">Pichayamongkol Construction Co., Ltd.</div>
        <h1>รายงานติดตามการแก้ไข Defect / Defect Follow-up Report</h1>
        <div class="subtitle">${escapeHtml(projectName)} | ${escapeHtml(round.document_no || round.title || "-")}</div>
      </div>
    </header>
    <section class="summary">
      <div class="box">ลูกค้า<strong>${escapeHtml(clientName || round.client_name || "-")}</strong></div>
      <div class="box">วันที่ตรวจ<strong>${escapeHtml(formatPrintDate(round.inspection_date))}</strong></div>
      <div class="box">รายการทั้งหมด<strong>${items.length}</strong></div>
      <div class="box">คงค้าง<strong>${openCount}</strong></div>
      <div class="box">แก้ไขแล้ว/ผ่าน<strong>${fixedCount}</strong></div>
      <div class="box">จำนวนวันที่ต้องบวก<strong>${escapeHtml(round.extension_days || 0)} วัน</strong></div>
      <div class="box">ผู้ตรวจ<strong>${escapeHtml(round.inspector_name || "-")}</strong></div>
      <div class="box">วันที่พิมพ์<strong>${escapeHtml(formatPrintDate(new Date().toISOString()))}</strong></div>
      <div class="box">สถานะรอบ<strong>${escapeHtml(statusLabel(round.status))}</strong></div>
    </section>
    ${itemSections || "<section class=\"item\">ไม่มีรายการ Defect</section>"}
    <section class="footer">
      <div><div class="sign-line"></div>ผู้จัดทำ / วิศวกร</div>
      <div><div class="sign-line"></div>ผู้ตรวจสอบ</div>
      <div><div class="sign-line"></div>ลูกค้ารับทราบ</div>
    </section>
  </main>
</body>
</html>`;
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
  const printWindow = window.open("", "_blank", "width=1024,height=768");
  if (!printWindow) {
    window.alert("เบราว์เซอร์บล็อกหน้าต่าง print กรุณาอนุญาต popup แล้วลองใหม่");
    return;
  }
  let hasPrinted = false;
  const triggerPrint = () => {
    if (hasPrinted || printWindow.closed) return;
    hasPrinted = true;
    printWindow.focus();
    printWindow.print();
  };
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = triggerPrint;
  window.setTimeout(triggerPrint, 900);
}

function stepState(tab: TabKey, selectedRound: DefectRound | undefined, itemCount: number, evidenceCount: number) {
  if (tab === "rounds") return selectedRound ? "done" : "current";
  if (!selectedRound) return "locked";
  if (tab === "items") return itemCount > 0 ? "done" : "current";
  if (tab === "document") return selectedRound.pdf_url ? "done" : itemCount > 0 ? "current" : "locked";
  if (tab === "acknowledgement") return evidenceCount > 0 ? "done" : selectedRound.pdf_url ? "current" : "locked";
  return itemCount > 0 ? "current" : "locked";
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600">
        <Icon size={19} />
      </span>
      <div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
      <div className="font-bold text-gray-900">{title}</div>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<TabKey>("rounds");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const rounds = useMemo(() => (data?.rounds || []) as DefectRound[], [data?.rounds]);
  const items = useMemo(() => (data?.items || []) as DefectItem[], [data?.items]);
  const evidence = useMemo(() => (data?.evidence || []) as DefectEvidence[], [data?.evidence]);
  const selectedRound = rounds.find((round) => round.round_id === selectedRoundId) || rounds[0];
  const roundItems = selectedRound ? items.filter((item) => item.round_id === selectedRound.round_id) : [];
  const roundEvidence = selectedRound ? evidence.filter((item) => item.round_id === selectedRound.round_id) : [];
  const locked = Boolean(selectedRound?.locked_at || selectedRound?.status === "acknowledged" || selectedRound?.status === "closed");
  const openItems = roundItems.filter((item) => !["passed", "closed"].includes(String(item.status || "")));
  const readyForCustomerApproval = roundItems.length > 0 && roundItems.every((item) => ["fixed", "passed", "closed"].includes(String(item.status || "")));

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
      extension_days: formData.get("extension_days"),
      notes: formData.get("notes"),
    });
    await mutate();
    setSelectedRoundId(payload.data?.round_id || "");
    setActiveTab("items");
    setMessage("สร้างรอบตรวจแล้ว ต่อไปเพิ่มรายการ defect ได้เลย");
  }

  async function addItem(formData: FormData) {
    if (!selectedRound) return;
    setMessage("");
    const fileInput = document.getElementById("defect-before-photos") as HTMLInputElement | null;
    const uploads = await filesToUploads(fileInput?.files || null, 4);
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
    if (fileInput) fileInput.value = "";
    await mutate();
    setMessage("เพิ่มรายการ defect แล้ว");
  }

  async function issuePdf() {
    if (!selectedRound) return;
    setMessage("");
    const payload = await postAction({ action: "issue_pdf", round_id: selectedRound.round_id });
    await mutate();
    setActiveTab("acknowledgement");
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
    if (fileInput) fileInput.value = "";
    await mutate();
    setActiveTab("tracking");
    setMessage("บันทึกหลักฐานลูกค้ารับทราบและล็อกรอบตรวจแล้ว");
  }

  async function sendCustomerApproval() {
    if (!selectedRound) return;
    setMessage("");
    const payload = await postAction({
      action: "send_customer_approval",
      round_id: selectedRound.round_id,
      origin: window.location.origin,
    });
    await mutate();
    setActiveTab("tracking");
    setMessage(payload.data?.test_mode
      ? `ส่ง LINE ทดสอบให้ลูกค้ารับงานแก้ไขไปยังกลุ่ม ${payload.data.line_group_id} แล้ว`
      : "ส่ง LINE ให้ลูกค้ารับงานแก้ไขแล้ว");
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
    if (fileInput) fileInput.value = "";
    await mutate();
    setMessage("อัปเดตรายการแล้ว");
  }

  function printTrackingReport() {
    if (!selectedRound) return;
    openPrintDialog(buildTrackingReportHtml({
      round: selectedRound,
      items: roundItems,
      projectName,
      clientName,
      baseUrl: window.location.origin,
    }));
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

  const messageIsError = Boolean(error || message.includes("ผิดพลาด") || message.includes("กรุณา") || message.includes("ไม่"));

  return (
    <div className="space-y-5">
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
          <div className="mt-2 text-2xl font-bold text-red-600">{openItems.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-500">หลักฐานรับทราบ</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{roundEvidence.length}</div>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${messageIsError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error ? "ไม่สามารถโหลดข้อมูล defect ได้" : message}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">Defect workflow</div>
              <h3 className="mt-1 truncate text-xl font-bold text-gray-900">{selectedRound?.title || "ยังไม่ได้เลือกรอบตรวจ"}</h3>
              <p className="mt-1 text-sm text-gray-500">{projectName} · ทำงานตามลำดับแท็บจากซ้ายไปขวา</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedRound ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(selectedRound.status)}`}>
                  {locked ? <Lock size={13} /> : <ShieldCheck size={13} />}
                  {statusLabel(selectedRound.status)}
                </span>
              ) : null}
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

        <div className="grid border-b border-gray-100 bg-gray-50/70 p-2 md:grid-cols-5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const state = stepState(tab.key, selectedRound, roundItems.length, roundEvidence.length);
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                disabled={state === "locked" && tab.key !== "rounds"}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                  active
                    ? "bg-white text-orange-700 shadow-sm ring-1 ring-orange-200"
                    : state === "locked"
                      ? "text-gray-400"
                      : "text-gray-600 hover:bg-white hover:text-gray-900"
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  state === "done"
                    ? "bg-emerald-50 text-emerald-600"
                    : active
                      ? "bg-orange-50 text-orange-600"
                      : "bg-white text-gray-400"
                }`}>
                  {state === "done" ? <CheckCircle2 size={17} /> : state === "locked" ? <Lock size={15} /> : <Icon size={17} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{tab.label}</span>
                  <span className="block truncate text-xs opacity-75">{tab.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 lg:p-5">
          {activeTab === "rounds" && (
            <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
              <form action={(formData) => run(createRound, formData)} className="rounded-lg border border-gray-200 p-4">
                <SectionHeader icon={Plus} title="สร้างรอบตรวจส่งมอบ" description="เริ่มรอบใหม่เมื่อตรวจบ้านกับลูกค้า หรือเมื่อลูกค้าแจ้งเพิ่มหลังรับทราบรอบก่อนหน้า" />
                <div className="mt-4 space-y-3">
                  <input name="title" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="เช่น ตรวจส่งมอบครั้งที่ 1" />
                  <input name="inspection_date" type="date" defaultValue={todayInputValue()} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" />
                  <input name="extension_days" type="number" min="0" step="1" defaultValue="0" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="จำนวนวันที่ต้องบวกเพิ่ม" />
                  <input name="inspector_name" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="ผู้ตรวจ/วิศวกร" />
                  <input name="client_name" defaultValue={clientName || ""} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="ชื่อลูกค้า/ผู้แทน" />
                  <textarea name="notes" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="หมายเหตุรอบตรวจ" />
                  <button disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60">
                    <Plus size={16} />
                    สร้างรอบตรวจ
                  </button>
                </div>
              </form>

              <div className="rounded-lg border border-gray-200 p-4">
                <SectionHeader icon={FileText} title="เลือกรอบตรวจ" description="เลือกเอกสารที่ต้องการเพิ่มรายการ ออก PDF หรือแนบหลักฐานรับทราบ" />
                <div className="mt-4 space-y-3">
                  {rounds.length === 0 ? (
                    <EmptyState title="ยังไม่มีรอบตรวจ" description="สร้างรอบตรวจแรกจากฟอร์มด้านซ้ายก่อน" />
                  ) : rounds.map((round) => {
                    const active = selectedRound?.round_id === round.round_id;
                    return (
                      <button
                        key={round.round_id}
                        type="button"
                        onClick={() => setSelectedRoundId(round.round_id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-orange-300 bg-orange-50/50 ring-2 ring-orange-100" : "border-gray-200 hover:bg-gray-50"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-bold text-gray-900">{round.document_no || round.round_id} - {round.title || "รอบตรวจ"}</div>
                            <div className="mt-1 text-xs text-gray-500">{round.inspection_date || "-"} · {round.inspector_name || "ยังไม่ระบุผู้ตรวจ"}</div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(round.status)}`}>
                            {statusLabel(round.status)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "items" && (
            <div className="grid gap-5 xl:grid-cols-[460px_minmax(0,1fr)]">
              {selectedRound && !locked ? (
                <form action={(formData) => run(addItem, formData)} className="rounded-lg border border-gray-200 p-4">
                  <SectionHeader icon={Camera} title="เพิ่มจุดที่ลูกค้าชี้" description="กรอกหนึ่งรายการต่อหนึ่งจุด พร้อมรูปก่อนแก้เพื่อใช้ในรายงาน PDF" />
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                    <input name="zone" required className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="พื้นที่/โซน เช่น ห้องน้ำ - 1" />
                    <select name="discipline" defaultValue="AR" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200">
                      {DISCIPLINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input name="work_category" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="งาน เช่น ผนัง, พื้น, หน้าต่าง" />
                    <input name="owner" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="ผู้แก้ไข/ทีมรับผิดชอบ" />
                    <textarea name="description" required rows={3} className="md:col-span-2 xl:col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="รายละเอียดรายการที่ต้องแก้ไข" />
                    <textarea name="cause" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="สาเหตุ/ข้อมูลประกอบ" />
                    <textarea name="remarks" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder="หมายเหตุ" />
                    <input name="due_date" type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200" />
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                      <Upload size={16} />
                      รูปก่อนแก้
                      <input id="defect-before-photos" name="before_photos" type="file" accept="image/*" multiple className="sr-only" />
                    </label>
                  </div>
                  <button disabled={isPending} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60">
                    <Plus size={16} />
                    เพิ่มรายการ
                  </button>
                </form>
              ) : selectedRound ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-bold"><Lock size={16} /> รอบตรวจนี้ล็อกแล้ว</div>
                  <p className="mt-1">ถ้าลูกค้าแจ้งเพิ่มหลังรับทราบ ให้สร้างรอบตรวจเพิ่มเติมเพื่อแยกหลักฐานให้ชัดเจน</p>
                </div>
              ) : (
                <EmptyState title="ยังไม่ได้เลือกรอบตรวจ" description="ไปที่แท็บรอบตรวจเพื่อสร้างหรือเลือกรอบก่อน" />
              )}

              <DefectList items={roundItems} isLoading={isLoading} />
            </div>
          )}

          {activeTab === "document" && (
            <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
              <div className="rounded-lg border border-gray-200 p-4">
                <SectionHeader icon={Printer} title="ออกเอกสารให้ลูกค้า" description="ระบบจะสร้าง PDF ทางการพร้อมโลโก้บริษัท และเปิด print dialog ให้ทันที" />
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="font-bold text-gray-900">{selectedRound?.document_no || "ยังไม่มีเลขเอกสาร"}</div>
                    <div className="mt-1">{roundItems.length} รายการ · คงค้าง {openItems.length} รายการ</div>
                  </div>
                  {selectedRound?.pdf_url ? (
                    <a href={String(selectedRound.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800">
                      <FileCheck2 size={16} />
                      เปิด PDF ล่าสุด
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={!selectedRound || roundItems.length === 0 || locked || isPending}
                    onClick={() => startTransition(() => { issuePdf().catch((err) => setMessage(err instanceof Error ? err.message : "ออก PDF ไม่สำเร็จ")); })}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Printer size={16} />
                    ออก PDF / Print
                  </button>
                  {locked ? <p className="text-xs text-emerald-700">รอบนี้ล็อกแล้ว ไม่สามารถออกเอกสารทับได้</p> : null}
                  {!selectedRound || roundItems.length === 0 ? <p className="text-xs text-gray-500">ต้องเลือกรอบตรวจและมีรายการ defect อย่างน้อย 1 รายการก่อน</p> : null}
                </div>
              </div>
              <DefectList items={roundItems} isLoading={isLoading} compact />
            </div>
          )}

          {activeTab === "acknowledgement" && (
            <div className="grid gap-5 xl:grid-cols-[460px_minmax(0,1fr)]">
              {selectedRound?.pdf_url && !locked ? (
                <form action={(formData) => run(acknowledge, formData)} className="rounded-lg border border-gray-200 p-4">
                  <SectionHeader icon={MessageSquareText} title="แนบหลักฐานลูกค้ารับทราบ" description="แนบแคปหน้าจอแชทที่ลูกค้าตอบรับ แล้วระบบจะล็อกรอบตรวจนี้" />
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
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
                    <textarea name="notes" rows={2} className="md:col-span-2 xl:col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200" placeholder="หมายเหตุ เช่น ลูกค้าตอบว่า รับทราบตามเอกสาร" />
                  </div>
                  <button disabled={isPending} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                    <ShieldCheck size={16} />
                    บันทึกลูกค้ารับทราบและล็อกเอกสาร
                  </button>
                </form>
              ) : (
                <div className="rounded-lg border border-gray-200 p-4">
                  <SectionHeader icon={ShieldCheck} title="หลักฐานรับทราบ" description="รอบที่ล็อกแล้วจะแสดงหลักฐานด้านขวา หากยังไม่มี PDF ให้ไปแท็บเอกสารก่อน" />
                  <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    {locked ? "รอบตรวจนี้บันทึกการรับทราบแล้ว" : "ต้องออก PDF ก่อนจึงจะแนบหลักฐานรับทราบได้"}
                  </div>
                </div>
              )}

              <EvidenceList evidence={roundEvidence} />
            </div>
          )}

          {activeTab === "tracking" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-bold text-orange-800">
                    <Printer size={18} />
                    พิมพ์รายงานแจ้งผลการแก้ไขให้ลูกค้า
                  </div>
                  <p className="mt-1 text-sm text-orange-700">
                    รายงานนี้รวมสถานะล่าสุด ผู้รับผิดชอบ บันทึกการแก้ไข และรูปก่อน/หลังแก้ของรอบตรวจนี้
                  </p>
                  {selectedRound?.sent_to_customer_at ? (
                    <p className="mt-2 text-xs font-bold text-emerald-700">
                      ส่งให้ลูกค้ารับงานแก้ไขแล้ว: {new Date(String(selectedRound.sent_to_customer_at)).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
                  <button
                    type="button"
                    onClick={printTrackingReport}
                    disabled={!selectedRound || roundItems.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Printer size={16} />
                    Print แจ้งลูกค้า
                  </button>
                  <button
                    type="button"
                    onClick={() => startTransition(() => { sendCustomerApproval().catch((err) => setMessage(err instanceof Error ? err.message : "ส่ง LINE ไม่สำเร็จ")); })}
                    disabled={!selectedRound?.pdf_url || !readyForCustomerApproval || locked || isPending}
                    title={!selectedRound?.pdf_url ? "ต้องออก PDF ก่อน" : !readyForCustomerApproval ? "ต้องอัปเดต defect เป็นแก้เสร็จ/ผ่านครบก่อน" : ""}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MessageSquareText size={16} />
                    ส่งให้ลูกค้ารับงาน
                  </button>
                </div>
              </div>
              <TrackingList items={roundItems} isLoading={isLoading} isPending={isPending} onSubmit={(formData) => run(updateItem, formData)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DefectList({ items, isLoading, compact = false }: { items: DefectItem[]; isLoading: boolean; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <AlertCircle size={18} className="text-red-600" />
          รายการ defect ในรอบนี้
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">No.</th>
              <th className="px-4 py-3 font-semibold">พื้นที่ / รายการ</th>
              <th className="px-4 py-3 font-semibold">หมวด</th>
              <th className="px-4 py-3 font-semibold">รูป</th>
              <th className="px-4 py-3 font-semibold">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.item_id} className="align-top">
                <td className="px-4 py-4 font-semibold text-gray-500">{item.item_no}</td>
                <td className="px-4 py-4">
                  <div className="font-bold text-gray-900">{item.zone || "-"}</div>
                  <div className="mt-1 text-gray-700">{item.description || "-"}</div>
                  {!compact && item.cause ? <div className="mt-1 text-xs text-gray-500">สาเหตุ: {item.cause}</div> : null}
                  {!compact && item.remarks ? <div className="mt-1 text-xs text-gray-500">หมายเหตุ: {item.remarks}</div> : null}
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
              </tr>
            ))}
            {items.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10">
                  <EmptyState title="ยังไม่มีรายการ defect" description="เพิ่มรายการจากฟอร์มในแท็บรายการ Defect" />
                </td>
              </tr>
            ) : null}
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: DefectEvidence[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <SectionHeader icon={ShieldCheck} title="หลักฐานที่แนบแล้ว" description="ใช้เป็นหลักฐานว่าฝั่งวิศวกรได้รับข้อความรับทราบจากลูกค้า" />
      <div className="mt-4 grid gap-2">
        {evidence.length === 0 ? (
          <EmptyState title="ยังไม่มีหลักฐานรับทราบ" description="แนบรูปแชทหลังออก PDF แล้ว" />
        ) : evidence.map((item) => (
          <a key={item.evidence_id} href={String(item.file_url || "#")} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50">
            <div className="font-semibold text-gray-900">{item.file_name || "หลักฐาน"}</div>
            <div className="mt-1 text-xs text-gray-500">{item.channel || "-"} · {item.acknowledged_by || "-"} · {item.acknowledged_date || "-"}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function TrackingList({
  items,
  isLoading,
  isPending,
  onSubmit,
}: {
  items: DefectItem[];
  isLoading: boolean;
  isPending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <SectionHeader icon={CheckCircle2} title="ติดตามการแก้ไข" description="อัปเดตสถานะ ผู้รับผิดชอบ และแนบรูปหลังแก้เป็นหลักฐานปิดงาน" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">รายการ</th>
              <th className="px-4 py-3 font-semibold">สถานะปัจจุบัน</th>
              <th className="px-4 py-3 font-semibold">อัปเดตงานแก้ไข</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.item_id} className="align-top">
                <td className="px-4 py-4">
                  <div className="text-xs font-semibold text-gray-400">#{item.item_no} · {item.zone || "-"}</div>
                  <div className="mt-1 font-bold text-gray-900">{item.description || "-"}</div>
                  <div className="mt-1 text-xs text-gray-500">ผู้แก้ไข: {item.owner || "-"} · รูปหลังแก้ {parsePhotoCount(item.after_photos_json)} รูป</div>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <form action={onSubmit} className="grid min-w-[360px] gap-2">
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
            {items.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10">
                  <EmptyState title="ยังไม่มีรายการให้ติดตาม" description="เพิ่ม defect ก่อน แล้วกลับมาปรับสถานะหลังเริ่มแก้ไข" />
                </td>
              </tr>
            ) : null}
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
