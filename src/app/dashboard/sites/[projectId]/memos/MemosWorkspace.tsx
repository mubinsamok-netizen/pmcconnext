"use client";

import { useMemo, useState, useTransition, type ComponentType } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSignature,
  FileText,
  Filter,
  History,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { hasPermission } from "@/lib/permissions";
import {
  MEMO_RELATED_LABELS,
  MEMO_STATUS_LABELS,
  MEMO_STATUS_STYLES,
  MEMO_TYPE_LABELS,
  isTrueText,
  numberValue,
  todayBangkok,
  type MemoEvidenceRecord,
  type MemoRecord,
} from "@/lib/siteMemos";

type Project = {
  project_id: string;
  name?: string;
  client?: string;
};

type ApiResponse = {
  success?: boolean;
  project?: Project;
  data?: MemoRecord[];
  evidence?: MemoEvidenceRecord[];
  audit_logs?: Array<Record<string, string | number | undefined>>;
  error?: string;
};

type UploadPayload = {
  name: string;
  type: string;
  dataUrl: string;
};

const MEMO_IMAGE_MAX_EDGE = 1600;
const MEMO_IMAGE_QUALITY = 0.72;

type TabKey = "create" | "acknowledge" | "details";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: "create", label: "สร้าง Memo", icon: Plus },
  { key: "acknowledge", label: "หลักฐานรับทราบ", icon: ShieldCheck },
  { key: "details", label: "รายละเอียด", icon: FileText },
];

const memoTypeOptions = Object.entries(MEMO_TYPE_LABELS);
const relatedOptions = Object.entries(MEMO_RELATED_LABELS);
const statusOptions = Object.entries(MEMO_STATUS_LABELS);

const emptyMemoForm = {
  memo_type: "customer_notice",
  related_module: "schedule",
  related_ref: "",
  title: "",
  event_date: todayBangkok(),
  issue_date: todayBangkok(),
  detail: "",
  requires_customer_ack: true,
  has_time_impact: false,
  extension_days: "0",
  extension_reason: "",
  customer_name: "",
};

const emptyAckForm = {
  channel: "LINE",
  acknowledged_by: "",
  acknowledged_date: todayBangkok(),
  notes: "",
  extension_approved: false,
};

function formatDate(value?: string | number) {
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

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isCompressibleImage(file: File) {
  return file.type.startsWith("image/") && !["image/gif", "image/svg+xml"].includes(file.type);
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("อ่านรูปภาพไม่สำเร็จ"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("บีบอัดรูปภาพไม่สำเร็จ"));
    }, "image/jpeg", MEMO_IMAGE_QUALITY);
  });
}

async function compressImageFile(file: File) {
  if (!isCompressibleImage(file)) return file;

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, MEMO_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas);
  if (blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "memo-image";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function prepareUploadFile(file: File) {
  try {
    return await compressImageFile(file);
  } catch {
    return file;
  }
}

async function fileToUploadPayload(file: File) {
  const preparedFile = await prepareUploadFile(file);
  return new Promise<UploadPayload>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: preparedFile.name, type: preparedFile.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("อ่านไฟล์แนบไม่สำเร็จ"));
    reader.readAsDataURL(preparedFile);
  });
}

function statusClass(status?: string | number) {
  return MEMO_STATUS_STYLES[String(status || "")] || MEMO_STATUS_STYLES.draft;
}

function StatCard({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-gray-500">{detail}</p>
    </div>
  );
}

function TabButton({ tab, active, onClick }: { tab: (typeof tabs)[number]; active: boolean; onClick: () => void }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-extrabold transition ${
        active ? "border-orange-200 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon size={16} />
      {tab.label}
    </button>
  );
}

function FileList({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
          <span className="min-w-0">
            <span className="block truncate">{file.name}</span>
            <span className="mt-0.5 block text-[11px] text-gray-400">
              {formatBytes(file.size)}{isCompressibleImage(file) ? " · จะย่อรูปก่อนอัปโหลด" : ""}
            </span>
          </span>
          <button type="button" onClick={() => onRemove(index)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-white hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function MemosWorkspace({ project, userRole }: { project: Project; userRole: string }) {
  const endpoint = `/api/sites/${encodeURIComponent(project.project_id)}/memos`;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(endpoint, fetcher);
  const memos = useMemo(() => data?.data || [], [data?.data]);
  const evidence = useMemo(() => data?.evidence || [], [data?.evidence]);
  const auditLogs = useMemo(() => data?.audit_logs || [], [data?.audit_logs]);
  const canCreate = hasPermission(userRole, "siteMemo.create");
  const canIssue = hasPermission(userRole, "siteMemo.issue");
  const canAcknowledge = hasPermission(userRole, "siteMemo.acknowledge");
  const [activeTab, setActiveTab] = useState<TabKey>(canCreate ? "create" : "details");
  const [memoForm, setMemoForm] = useState({ ...emptyMemoForm, customer_name: project.client || "" });
  const [ackForm, setAckForm] = useState({ ...emptyAckForm, acknowledged_by: project.client || "" });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedMemo = useMemo(
    () => memos.find((memo) => memo.memo_id === selectedMemoId) || memos.find((memo) => memo.pdf_url) || memos[0],
    [memos, selectedMemoId]
  );

  const creatorOptions = useMemo(() => {
    return Array.from(new Set(memos.map((memo) => String(memo.prepared_by_name || memo.prepared_by_email || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
  }, [memos]);

  const filteredMemos = useMemo(() => {
    return memos.filter((memo) => {
      const statusMatches = statusFilter === "all" || memo.status === statusFilter;
      const typeMatches = typeFilter === "all" || memo.memo_type === typeFilter;
      const creator = String(memo.prepared_by_name || memo.prepared_by_email || "").trim();
      const creatorMatches = creatorFilter === "all" || creator === creatorFilter;
      const issueDate = String(memo.issue_date || memo.created_at || "");
      const fromMatches = !dateFrom || issueDate >= dateFrom;
      const toMatches = !dateTo || issueDate <= dateTo;
      return statusMatches && typeMatches && creatorMatches && fromMatches && toMatches;
    });
  }, [creatorFilter, dateFrom, dateTo, memos, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const acknowledgedStatuses = new Set(["acknowledged", "extension_approved", "closed"]);
    const waitingAck = memos.filter((memo) => isTrueText(memo.requires_customer_ack) && !acknowledgedStatuses.has(String(memo.status || ""))).length;
    const acknowledged = memos.filter((memo) => acknowledgedStatuses.has(String(memo.status || ""))).length;
    const extensionDays = memos
      .filter((memo) => isTrueText(memo.has_time_impact) && memo.status !== "rejected")
      .reduce((sum, memo) => sum + Math.max(0, Math.round(numberValue(memo.extension_days))), 0);
    const approvedDays = memos
      .filter((memo) => memo.status === "extension_approved" || memo.status === "closed")
      .reduce((sum, memo) => sum + Math.max(0, Math.round(numberValue(memo.extension_days))), 0);
    return { waitingAck, acknowledged, extensionDays, approvedDays };
  }, [memos]);

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    setLoadingAction(action);
    setMessage("");
    setActionError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(String(result.error || "ทำรายการไม่สำเร็จ"));
      await mutate();
      return result;
    } catch (postError) {
      setActionError(postError instanceof Error ? postError.message : "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setLoadingAction("");
    }
  };

  const createMemo = (issuePdf: boolean) => {
    startTransition(async () => {
      try {
        const attachmentUploads = await Promise.all(attachmentFiles.map(fileToUploadPayload));
        const created = await postAction("create_memo", {
          ...memoForm,
          attachment_uploads: attachmentUploads,
        });
        const memoId = String(created?.data?.memo_id || "");
        if (!memoId) return;
        setSelectedMemoId(memoId);
        if (issuePdf) {
          await postAction("issue_pdf", { memo_id: memoId });
        }
        setMemoForm({ ...emptyMemoForm, customer_name: project.client || "" });
        setAttachmentFiles([]);
        setMessage(issuePdf ? "สร้าง Memo และออก PDF เรียบร้อยแล้ว" : "บันทึกร่าง Memo เรียบร้อยแล้ว");
        setActiveTab(issuePdf ? "acknowledge" : "details");
      } catch (uploadError) {
        setActionError(uploadError instanceof Error ? uploadError.message : "เตรียมไฟล์แนบไม่สำเร็จ");
      }
    });
  };

  const issueMemoPdf = (memoId: string) => {
    startTransition(async () => {
      const result = await postAction("issue_pdf", { memo_id: memoId });
      if (result?.success) setMessage("ออก PDF Memo เรียบร้อยแล้ว");
    });
  };

  const acknowledgeMemo = () => {
    if (!selectedMemo?.memo_id) return;
    startTransition(async () => {
      try {
        const evidenceUploads = await Promise.all(evidenceFiles.map(fileToUploadPayload));
        const result = await postAction("acknowledge", {
          memo_id: selectedMemo.memo_id,
          ...ackForm,
          evidence_uploads: evidenceUploads,
        });
        if (result?.success) {
          setEvidenceFiles([]);
          setAckForm({ ...emptyAckForm, acknowledged_by: project.client || "" });
          setMessage("บันทึกหลักฐานลูกค้ารับทราบเรียบร้อยแล้ว");
          setActiveTab("details");
        }
      } catch (uploadError) {
        setActionError(uploadError instanceof Error ? uploadError.message : "เตรียมไฟล์หลักฐานไม่สำเร็จ");
      }
    });
  };

  const updateStatus = (memoId: string, status: string) => {
    startTransition(async () => {
      const result = await postAction("update_status", { memo_id: memoId, status });
      if (result?.success) setMessage("อัปเดตสถานะ Memo เรียบร้อยแล้ว");
    });
  };

  const addAttachmentFiles = (files: FileList | null) => {
    const nextFiles = Array.from(files || []);
    if (nextFiles.length > 0) setAttachmentFiles([...attachmentFiles, ...nextFiles].slice(0, 10));
  };

  const addEvidenceFiles = (files: FileList | null) => {
    const nextFiles = Array.from(files || []);
    if (nextFiles.length > 0) setEvidenceFiles([...evidenceFiles, ...nextFiles].slice(0, 10));
  };

  const selectedEvidence = useMemo(() => {
    if (!selectedMemo?.memo_id) return [];
    return evidence.filter((item) => item.memo_id === selectedMemo.memo_id);
  }, [evidence, selectedMemo]);

  const busy = isPending || Boolean(loadingAction);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Memo ทั้งหมด" value={memos.length} detail="เอกสารบันทึกข้อความของไซต์" tone="text-slate-900" />
        <StatCard label="รอรับทราบ" value={stats.waitingAck} detail="ต้องตามหลักฐานจากลูกค้า" tone="text-amber-700" />
        <StatCard label="รับทราบแล้ว" value={stats.acknowledged} detail="รวมรายการที่ปิดแล้ว" tone="text-emerald-700" />
        <StatCard label="วันเพิ่ม" value={`${stats.extensionDays} วัน`} detail={`อนุมัติแล้ว ${stats.approvedDays} วัน`} tone="text-orange-700" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <TabButton key={tab.key} tab={tab} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} />
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Clock3 size={16} />}
            {isLoading ? "กำลังโหลด Memo" : `แสดง ${filteredMemos.length} จาก ${memos.length} รายการ`}
          </div>
        </div>
      </div>

      {error || data?.error || actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {actionError || data?.error || "โหลดข้อมูล Memo ไม่สำเร็จ"}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      {activeTab === "create" && (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <FileSignature className="text-orange-600" size={20} />
              <h3 className="text-lg font-extrabold text-gray-900">สร้างบันทึกข้อความ</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">ประเภท Memo</span>
                <select value={memoForm.memo_type} onChange={(event) => setMemoForm({ ...memoForm, memo_type: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400">
                  {memoTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">เกี่ยวข้องกับ</span>
                <select value={memoForm.related_module} onChange={(event) => setMemoForm({ ...memoForm, related_module: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400">
                  {relatedOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold text-gray-500">เรื่อง</span>
                <input value={memoForm.title} onChange={(event) => setMemoForm({ ...memoForm, title: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" placeholder="เช่น แจ้งผลกระทบจากฝนตกต่อแผนงานเทคอนกรีต" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">วันที่เกิดเหตุ</span>
                <input type="date" value={memoForm.event_date} onChange={(event) => setMemoForm({ ...memoForm, event_date: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">วันที่ออก Memo</span>
                <input type="date" value={memoForm.issue_date} onChange={(event) => setMemoForm({ ...memoForm, issue_date: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">เลขอ้างอิงที่เกี่ยวข้อง</span>
                <input value={memoForm.related_ref} onChange={(event) => setMemoForm({ ...memoForm, related_ref: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" placeholder="เช่น Task ID / Defect No. / VO No." />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-gray-500">ลูกค้า / ผู้รับทราบ</span>
                <input value={memoForm.customer_name} onChange={(event) => setMemoForm({ ...memoForm, customer_name: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold text-gray-500">รายละเอียดเหตุการณ์</span>
                <textarea value={memoForm.detail} onChange={(event) => setMemoForm({ ...memoForm, detail: event.target.value })} className="min-h-32 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="ระบุเหตุการณ์ ผลกระทบ และสิ่งที่ต้องแจ้งให้ลูกค้ารับทราบ" />
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <input type="checkbox" checked={memoForm.requires_customer_ack} onChange={(event) => setMemoForm({ ...memoForm, requires_customer_ack: event.target.checked })} />
                  ต้องให้ลูกค้ารับทราบ
                </label>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <input type="checkbox" checked={memoForm.has_time_impact} onChange={(event) => setMemoForm({ ...memoForm, has_time_impact: event.target.checked })} />
                  มีผลต่อระยะเวลา
                </label>
              </div>
              {memoForm.has_time_impact && (
                <>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-gray-500">จำนวนวันที่ขอเพิ่ม</span>
                    <input type="number" min="0" value={memoForm.extension_days} onChange={(event) => setMemoForm({ ...memoForm, extension_days: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-gray-500">เหตุผลการเพิ่มเวลา</span>
                    <input value={memoForm.extension_reason} onChange={(event) => setMemoForm({ ...memoForm, extension_reason: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
                  </label>
                </>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Paperclip className="text-gray-500" size={18} />
                <h3 className="font-extrabold text-gray-900">ไฟล์ประกอบ</h3>
              </div>
              <input type="file" multiple accept="image/*,application/pdf,.pdf" onChange={(event) => addAttachmentFiles(event.target.files)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <p className="mt-2 text-xs font-semibold text-gray-500">รูปภาพจะถูกย่ออัตโนมัติก่อนอัปโหลด เพื่อให้แนบหลักฐานและออก PDF ได้ง่ายขึ้น</p>
              <div className="mt-3">
                <FileList files={attachmentFiles} onRemove={(index) => setAttachmentFiles(attachmentFiles.filter((_file, fileIndex) => fileIndex !== index))} />
              </div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
              <h3 className="font-extrabold text-gray-950">ขั้นตอนเอกสาร</h3>
              <p className="mt-1 text-sm text-gray-600">บันทึกร่างไว้ก่อน หรือออก PDF ทางการพร้อมโลโก้เพื่อส่งให้ลูกค้าได้ทันที</p>
              <div className="mt-4 grid gap-2">
                <button type="button" disabled={busy || !canCreate} onClick={() => createMemo(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  {loadingAction === "create_memo" ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                  บันทึกร่าง
                </button>
                <button type="button" disabled={busy || !canCreate || !canIssue} onClick={() => createMemo(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60">
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                  บันทึกและออก PDF Memo
                </button>
              </div>
            </div>
          </aside>
        </section>
      )}

      {activeTab === "acknowledge" && (
        <section className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Upload className="text-emerald-600" size={19} />
              <h3 className="font-extrabold text-gray-900">แนบหลักฐานลูกค้ารับทราบ</h3>
            </div>
            <div className="space-y-3">
              <select value={selectedMemo?.memo_id || ""} onChange={(event) => setSelectedMemoId(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-orange-400">
                {memos.filter((memo) => memo.pdf_url).map((memo) => (
                  <option key={memo.memo_id} value={memo.memo_id}>{memo.document_no || memo.memo_id} - {memo.title}</option>
                ))}
              </select>
              <input value={ackForm.acknowledged_by} onChange={(event) => setAckForm({ ...ackForm, acknowledged_by: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" placeholder="ผู้รับทราบ" />
              <div className="grid grid-cols-2 gap-2">
                <select value={ackForm.channel} onChange={(event) => setAckForm({ ...ackForm, channel: event.target.value })} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400">
                  <option value="LINE">LINE</option>
                  <option value="Email">Email</option>
                  <option value="Signed PDF">เซ็นเอกสาร</option>
                  <option value="Meeting">ประชุม</option>
                  <option value="Other">อื่น ๆ</option>
                </select>
                <input type="date" value={ackForm.acknowledged_date} onChange={(event) => setAckForm({ ...ackForm, acknowledged_date: event.target.value })} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
              </div>
              <textarea value={ackForm.notes} onChange={(event) => setAckForm({ ...ackForm, notes: event.target.value })} className="min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="หมายเหตุ เช่น ลูกค้ารับทราบทาง LINE แล้ว" />
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700">
                <input type="checkbox" checked={ackForm.extension_approved} onChange={(event) => setAckForm({ ...ackForm, extension_approved: event.target.checked })} />
                อนุมัติจำนวนวันที่ขอเพิ่มแล้ว
              </label>
              <input type="file" multiple accept="image/*,application/pdf,.pdf" onChange={(event) => addEvidenceFiles(event.target.files)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <p className="text-xs font-semibold text-gray-500">หลักฐานรูปภาพจะถูกย่อก่อนบันทึก เหมาะกับแคปหน้าจอ LINE และภาพหน้างาน</p>
              <FileList files={evidenceFiles} onRemove={(index) => setEvidenceFiles(evidenceFiles.filter((_file, fileIndex) => fileIndex !== index))} />
              <button type="button" disabled={busy || !canAcknowledge || !selectedMemo?.pdf_url} onClick={acknowledgeMemo} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60">
                {loadingAction === "acknowledge" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                บันทึกรับทราบ
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="font-extrabold text-gray-900">Memo ที่เลือก</h3>
            {selectedMemo ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(selectedMemo.status)}`}>
                    {MEMO_STATUS_LABELS[String(selectedMemo.status || "")] || selectedMemo.status || "-"}
                  </span>
                  <span className="text-sm font-bold text-gray-900">{selectedMemo.document_no || selectedMemo.memo_id}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedMemo.pdf_url ? <a href={String(selectedMemo.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-orange-600">เปิด PDF <ExternalLink size={14} /></a> : null}
                    {selectedMemo.pdf_url ? (
                      <button type="button" disabled={busy || !canIssue} onClick={() => issueMemoPdf(selectedMemo.memo_id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                        <Printer size={13} /> ออก PDF ใหม่
                      </button>
                    ) : null}
                  </div>
                </div>
                <div>
                  <h4 className="text-lg font-extrabold text-gray-950">{selectedMemo.title}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-gray-600">{selectedMemo.detail}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <StatCard label="ประเภท" value={MEMO_TYPE_LABELS[String(selectedMemo.memo_type || "")] || "-"} detail={formatDate(selectedMemo.issue_date)} tone="text-slate-900" />
                  <StatCard label="เกี่ยวข้องกับ" value={MEMO_RELATED_LABELS[String(selectedMemo.related_module || "")] || "-"} detail={String(selectedMemo.related_ref || "-")} tone="text-blue-700" />
                  <StatCard label="วันเพิ่ม" value={`${numberValue(selectedMemo.extension_days)} วัน`} detail={isTrueText(selectedMemo.has_time_impact) ? "มีผลต่อเวลา" : "ไม่มีผลต่อเวลา"} tone="text-orange-700" />
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="font-extrabold text-gray-900">หลักฐานที่แนบแล้ว</h4>
                  {selectedEvidence.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {selectedEvidence.map((item) => (
                        <a key={item.evidence_id} href={String(item.file_url || "#")} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:text-orange-600">
                          <span className="truncate">{item.file_name || item.channel || "Evidence"}</span>
                          <ExternalLink size={14} />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">ยังไม่มีหลักฐานรับทราบสำหรับ Memo นี้</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">ยังไม่มี Memo ที่ออก PDF แล้ว</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "details" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="text-orange-600" size={18} />
              <h3 className="font-extrabold text-gray-900">Filter Memo</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400">
                <option value="all">ทุกสถานะ</option>
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400">
                <option value="all">ทุกประเภท</option>
                {memoTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400">
                <option value="all">ผู้สร้างทั้งหมด</option>
                {creatorOptions.map((creator) => <option key={creator} value={creator}>{creator}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange-400" />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-extrabold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Memo</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">เกี่ยวข้อง</th>
                    <th className="px-4 py-3">วันเพิ่ม</th>
                    <th className="px-4 py-3">ผู้สร้าง</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMemos.map((memo) => (
                    <tr key={memo.memo_id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="font-extrabold text-gray-950">{memo.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{memo.document_no || memo.memo_id} · {formatDate(memo.issue_date || memo.created_at)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(memo.status)}`}>{MEMO_STATUS_LABELS[String(memo.status || "")] || memo.status || "-"}</span>
                        <p className="mt-2 text-xs text-gray-500">{MEMO_TYPE_LABELS[String(memo.memo_type || "")] || "-"}</p>
                      </td>
                      <td className="px-4 py-4 text-gray-600">
                        {MEMO_RELATED_LABELS[String(memo.related_module || "")] || "-"}
                        {memo.related_ref ? <p className="mt-1 text-xs text-gray-500">{memo.related_ref}</p> : null}
                      </td>
                      <td className="px-4 py-4 font-extrabold text-orange-700">{isTrueText(memo.has_time_impact) ? `${numberValue(memo.extension_days)} วัน` : "-"}</td>
                      <td className="px-4 py-4 text-gray-600">{memo.prepared_by_name || memo.prepared_by_email || "-"}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          {memo.pdf_url ? (
                            <>
                              <a href={String(memo.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-extrabold text-white hover:bg-slate-800">
                                PDF <ExternalLink size={13} />
                              </a>
                              <button type="button" disabled={busy || !canIssue} onClick={() => issueMemoPdf(memo.memo_id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                                <Printer size={13} /> ออกใหม่
                              </button>
                            </>
                          ) : (
                            <button type="button" disabled={busy || !canIssue} onClick={() => issueMemoPdf(memo.memo_id)} className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-orange-700 disabled:opacity-60">
                              <Printer size={13} /> ออก PDF
                            </button>
                          )}
                          {memo.pdf_url && memo.status === "issued" ? (
                            <button type="button" disabled={busy || !canAcknowledge} onClick={() => updateStatus(memo.memo_id, "sent")} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                              <Send size={13} /> ส่งแล้ว
                            </button>
                          ) : null}
                          {["acknowledged", "extension_approved"].includes(String(memo.status || "")) ? (
                            <button type="button" disabled={busy || !canAcknowledge} onClick={() => updateStatus(memo.memo_id, "closed")} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                              <CheckCircle2 size={13} /> ปิด
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredMemos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm font-semibold text-gray-500">ยังไม่มี Memo ตาม filter ที่เลือก</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <History className="text-gray-500" size={18} />
              <h3 className="font-extrabold text-gray-900">Audit Log</h3>
            </div>
            <div className="space-y-2">
              {auditLogs.slice(0, 12).map((log) => (
                <div key={String(log.log_id || `${log.timestamp}-${log.action}`)} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold text-gray-800">{log.summary || log.action}</span>
                    <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{log.actor_name || log.actor_email || "-"} · {log.action}</p>
                </div>
              ))}
              {auditLogs.length === 0 ? <p className="text-sm text-gray-500">ยังไม่มี audit log ของ Memo</p> : null}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
