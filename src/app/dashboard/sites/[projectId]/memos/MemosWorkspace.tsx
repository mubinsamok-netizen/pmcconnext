"use client";

import { fetchWithAttachmentLimit } from "@/lib/attachmentUpload";
import { useEffect, useMemo, useState, useTransition, type ComponentType } from "react";
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
  SquarePen,
  Upload,
  X,
} from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { postNoteAttachmentAction, uploadDriveFile } from "@/lib/directDriveNoteUpload";
import { prepareProjectCover } from "@/lib/prepareProjectCover";
import { hasPermission } from "@/lib/permissions";
import {
  MEMO_RELATED_LABELS,
  MEMO_STATUS_LABELS,
  MEMO_STATUS_STYLES,
  MEMO_TYPE_LABELS,
  isTrueText,
  numberValue,
  parseMemoAttachments,
  todayBangkok,
  type MemoAttachment,
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
  linked_vos?: Record<string, { vo_id: string; title?: string; status?: string }>;
  line?: {
    test_mode?: boolean;
    target_group_id?: string;
    target_group_name?: string;
  };
  error?: string;
};


type TabKey = "create" | "acknowledge" | "details";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: "create", label: "สร้าง Memo", icon: Plus },
  { key: "acknowledge", label: "หลักฐานรับทราบ", icon: ShieldCheck },
  { key: "details", label: "รายละเอียด", icon: FileText },
];

const memoTypeOptions = Object.entries(MEMO_TYPE_LABELS);
const relatedOptions = Object.entries(MEMO_RELATED_LABELS);
const statusOptions = Object.entries(MEMO_STATUS_LABELS);
const VO_READY_MEMO_STATUSES = new Set(["acknowledged", "extension_approved", "closed"]);

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

function dateInputValue(value?: string | number) {
  return String(value || "").slice(0, 10) || todayBangkok();
}

function memoToForm(memo: MemoRecord, fallbackCustomer: string) {
  const hasTimeImpact = isTrueText(memo.has_time_impact);
  return {
    memo_type: String(memo.memo_type || "customer_notice"),
    related_module: String(memo.related_module || "other"),
    related_ref: String(memo.related_ref || ""),
    title: String(memo.title || ""),
    event_date: dateInputValue(memo.event_date),
    issue_date: dateInputValue(memo.issue_date),
    detail: String(memo.detail || ""),
    requires_customer_ack: isTrueText(memo.requires_customer_ack),
    has_time_impact: hasTimeImpact,
    extension_days: hasTimeImpact ? String(memo.extension_days || "0") : "0",
    extension_reason: String(memo.extension_reason || ""),
    customer_name: String(memo.customer_name || fallbackCustomer || ""),
  };
}

function isVoMemo(memo?: MemoRecord) {
  return String(memo?.related_module || "") === "vo";
}

function isMemoReadyForVo(memo?: MemoRecord) {
  if (!memo) return false;
  return !isTrueText(memo.requires_customer_ack) || VO_READY_MEMO_STATUSES.has(String(memo.status || ""));
}

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
  return file.type.startsWith("image/");
}

function isPreviewableFile(file: File) {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

type MemoTransfer = { file: File; percent: number; status: string; id?: string };
type MemoUpload = {
  memoId: string;
  kind: "attachment" | "evidence";
  files: MemoTransfer[];
  previousPdf: string;
  issuePdf: boolean;
  acknowledgement?: Record<string, unknown>;
};

const quietHeaders = { "X-PMC-No-Global-Loading": "1" };

async function fetchMemo(url: string): Promise<ApiResponse> {
  const response = await fetch(url, { headers: quietHeaders });
  if (!response.ok) throw new Error("โหลดข้อมูล Memo ไม่สำเร็จ");
  return response.json();
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

function FileList({ files, onRemove, emptyLabel }: { files: File[]; onRemove: (index: number) => void; emptyLabel?: string }) {
  return <PreviewFileList files={files} onRemove={onRemove} emptyLabel={emptyLabel} />;
}

type PreviewFile = {
  file: File;
  url: string;
  key: string;
};

function PreviewFileList({ files, onRemove, emptyLabel = "ยังไม่ได้เลือกไฟล์" }: { files: File[]; onRemove: (index: number) => void; emptyLabel?: string }) {
  const previewFiles = useMemo<PreviewFile[]>(() => {
    return files.map((file, index) => ({
      file,
      url: isPreviewableFile(file) ? URL.createObjectURL(file) : "",
      key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    }));
  }, [files]);

  useEffect(() => {
    return () => {
      previewFiles.forEach((item) => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
    };
  }, [previewFiles]);

  return (
    <div className={files.length > 0 ? "space-y-2" : "rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs font-bold text-gray-400"}>
      {files.length === 0 ? emptyLabel : null}
      {previewFiles.map(({ file, url, key }, index) => {
        const isImage = file.type.startsWith("image/");
        const isPdf = file.type === "application/pdf";

        return (
          <div key={key} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs font-semibold text-gray-600">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
              {isImage && url ? (
                // eslint-disable-next-line @next/next/no-img-element -- Local object URLs are client-only file previews.
                <img src={url} alt={file.name} className="h-full w-full object-cover" />
              ) : (
                <FileText size={24} className={isPdf ? "text-red-500" : "text-gray-400"} />
              )}
            </div>
            <div className="min-w-0">
              <span className="block truncate font-extrabold text-gray-800">{file.name}</span>
              <span className="mt-0.5 block text-[11px] text-gray-400">
                {formatBytes(file.size)}{isCompressibleImage(file) ? " · จะย่อรูปก่อนอัปโหลด" : ""}
              </span>
              <span className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-gray-500 ring-1 ring-gray-200">
                {isImage ? "รูปภาพ" : isPdf ? "PDF" : file.type || "ไฟล์"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Preview ${file.name}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-extrabold text-gray-700 hover:text-orange-600" title="Preview file">
                  Preview
                  <ExternalLink size={12} />
                </a>
              ) : null}
              <button type="button" onClick={() => onRemove(index)} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-200 hover:text-red-600" title="Remove file" aria-label={`Remove ${file.name}`}>
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExistingAttachmentList({ attachments }: { attachments: MemoAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      {attachments.map((attachment, index) => {
        const mimeType = String(attachment.mime_type || "");
        const isImage = mimeType.startsWith("image/");
        const isPdf = mimeType === "application/pdf";
        const fileUrl = attachment.file_id
          ? `/api/drive/files/${encodeURIComponent(attachment.file_id)}`
          : String(attachment.file_url || "");

        return (
          <div key={attachment.file_id || `${attachment.file_name}-${index}`} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 text-xs font-semibold text-gray-600">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg border border-emerald-100 bg-white">
              {isImage && fileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Existing Drive files are served through the authenticated file route.
                <img src={fileUrl} alt={attachment.file_name || "ไฟล์แนบเดิม"} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <FileText size={24} className={isPdf ? "text-red-500" : "text-gray-400"} />
              )}
            </div>
            <div className="min-w-0">
              <span className="block truncate font-extrabold text-gray-800">{attachment.file_name || `ไฟล์แนบ ${index + 1}`}</span>
              <span className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-200">
                ไฟล์เดิม · {isImage ? "รูปภาพ" : isPdf ? "PDF" : mimeType || "ไฟล์"}
              </span>
            </div>
            {fileUrl ? (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 text-[11px] font-extrabold text-emerald-700 hover:text-orange-600" title="เปิดไฟล์เดิม">
                เปิดดู
                <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function MemosWorkspace({ project, userRole }: { project: Project; userRole: string }) {
  const endpoint = `/api/sites/${encodeURIComponent(project.project_id)}/memos`;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(endpoint, fetchMemo);
  const memos = useMemo(() => data?.data || [], [data?.data]);
  const evidence = useMemo(() => data?.evidence || [], [data?.evidence]);
  const auditEndpoint = `${endpoint}?view=audit`;
  const [auditOpen, setAuditOpen] = useState(false);
  const { mutate: mutateCache } = useSWRConfig();
  const { data: auditData, error: auditError, mutate: retryAudit } = useSWR<ApiResponse>(
    auditOpen ? auditEndpoint : null,
    fetchMemo,
  );
  const auditLogs = auditData?.audit_logs || [];
  const linkedVos = useMemo(() => data?.linked_vos || {}, [data?.linked_vos]);
  const canCreate = hasPermission(userRole, "siteMemo.create");
  const canIssue = hasPermission(userRole, "siteMemo.issue");
  const canAcknowledge = hasPermission(userRole, "siteMemo.acknowledge");
  const canCreateVo = hasPermission(userRole, "vo.create");
  const [activeTab, setActiveTab] = useState<TabKey>(canCreate ? "create" : "details");
  const [memoForm, setMemoForm] = useState({ ...emptyMemoForm, customer_name: project.client || "" });
  const [ackForm, setAckForm] = useState({ ...emptyAckForm, acknowledged_by: project.client || "" });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [editingMemoId, setEditingMemoId] = useState("");
  const [selectedMemoId, setSelectedMemoId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [upload, setUpload] = useState<MemoUpload | null>(null);
  const [uploadRunning, setUploadRunning] = useState(false);
  const [pdfJob, setPdfJob] = useState<{ memoId: string; previousPdf: string; started: number; evidence: boolean } | null>(null);
  const [pdfTimedOut, setPdfTimedOut] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedMemo = useMemo(
    () => memos.find((memo) => memo.memo_id === selectedMemoId) || memos.find((memo) => memo.pdf_url) || memos[0],
    [memos, selectedMemoId]
  );
  const editingMemo = useMemo(
    () => memos.find((memo) => memo.memo_id === editingMemoId),
    [editingMemoId, memos]
  );
  const existingAttachments = useMemo(
    () => parseMemoAttachments(editingMemo?.attachments_json),
    [editingMemo]
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

  const pdfReady = pdfJob && memos.some((memo) =>
    memo.memo_id === pdfJob.memoId && memo.pdf_file_id && memo.pdf_file_id !== pdfJob.previousPdf
  );

  useEffect(() => {
    if (!pdfJob || pdfReady || pdfTimedOut) return;
    const timer = window.setInterval(() => {
      if (Date.now() - pdfJob.started > 90_000) {
        setPdfTimedOut(true);
        return;
      }
      void mutate().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pdfJob, pdfReady, pdfTimedOut, mutate]);

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    setLoadingAction(action);
    setMessage("");
    setActionError("");
    try {
      const response = await fetchWithAttachmentLimit(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...quietHeaders },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(String(result.error || "ทำรายการไม่สำเร็จ"));
      void mutateCache(auditEndpoint, undefined, { revalidate: auditOpen }).catch(() => undefined);
      if ((action === "create_memo" || action === "update_memo") && result.data?.memo_id) {
        const saved = result.data as MemoRecord;
        await mutate((current) => ({
          ...current,
          success: true,
          data: [saved, ...(current?.data || []).filter((memo) => memo.memo_id !== saved.memo_id)]
            .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()),
        }), { revalidate: false });
        // Refresh the memo list without holding the completed save open.
        void mutate().catch(() => setActionError("บันทึกสำเร็จแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณารีเฟรช"));
      } else {
        void mutate().catch(() => undefined);
      }
      return result;
    } catch (postError) {
      setActionError(postError instanceof Error ? postError.message : "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setLoadingAction("");
    }
  };

  const resetMemoEditor = () => {
    setEditingMemoId("");
    setMemoForm({ ...emptyMemoForm, customer_name: project.client || "" });
    setAttachmentFiles([]);
  };

  const startEditMemo = (memo: MemoRecord) => {
    setSelectedMemoId(memo.memo_id);
    setEditingMemoId(memo.memo_id);
    setMemoForm(memoToForm(memo, project.client || ""));
    setAttachmentFiles([]);
    setActionError("");
    setMessage(`กำลังแก้ไข ${memo.document_no || memo.memo_id}`);
    setActiveTab("create");
  };

  const requestPdf = async (memoId: string, previousPdf: string, evidence = false) => {
    const result = await postAction(evidence ? "refresh_acknowledged_pdf" : "issue_pdf", { memo_id: memoId, defer_pdf: true });
    if (result?.pdf_pending) {
      setPdfTimedOut(false);
      setPdfJob({ memoId, previousPdf, started: Date.now(), evidence });
    }
    return Boolean(result?.pdf_pending);
  };

  const uploadMemoFiles = async (batch: MemoUpload) => {
    setUploadRunning(true);
    setActionError("");
    const files = [...batch.files];
    const updateFile = (index: number, patch: Partial<MemoTransfer>) => {
      files[index] = { ...files[index], ...patch };
      setUpload({ ...batch, files: [...files] });
    };
    setUpload({ ...batch, files: [...files] });
    try {
      for (const [index, entry] of files.entries()) {
        if (entry.id) continue;
        try {
          updateFile(index, { status: "กำลังเตรียมไฟล์", percent: 0 });
          const file = isCompressibleImage(entry.file) ? await prepareProjectCover(entry.file) : entry.file;
          const mime = /\.pdf$/i.test(file.name) ? "application/pdf" : file.type || "application/octet-stream";
          updateFile(index, { status: "กำลังอัปโหลด" });
          const session = await postNoteAttachmentAction(endpoint, {
            action: "start_upload", kind: batch.kind, memo_id: batch.memoId,
            file_name: file.name, file_size: file.size, mime_type: mime,
          });
          const id = await uploadDriveFile(session.upload_url, file, mime, (percent) => updateFile(index, { percent }));
          updateFile(index, { id, percent: 100, status: "ส่งถึง Drive แล้ว" });
        } catch (error) {
          updateFile(index, { status: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" });
        }
      }
      if (files.some((file) => !file.id)) {
        setActionError("มีไฟล์อัปโหลดไม่สำเร็จ ลองอีกครั้งเพื่อส่งเฉพาะไฟล์ที่ค้าง");
        return;
      }

      const isEvidence = batch.kind === "evidence";
      const result = await postAction(isEvidence ? "acknowledge" : "attach_uploads", {
        ...batch.acknowledgement, memo_id: batch.memoId,
        file_ids: files.map((file) => file.id), defer_pdf: isEvidence,
      });
      if (!result?.success) return;
      setUpload(null);
      if (isEvidence) {
        setEvidenceFiles([]);
        setAckForm({ ...emptyAckForm, acknowledged_by: project.client || "" });
        setActiveTab("details");
        setPdfTimedOut(false);
        setPdfJob({ memoId: batch.memoId, previousPdf: batch.previousPdf, started: Date.now(), evidence: true });
        setMessage("บันทึกหลักฐานรับทราบแล้ว");
      } else if (batch.issuePdf) {
        if (await requestPdf(batch.memoId, batch.previousPdf)) setMessage("บันทึก Memo และไฟล์แนบแล้ว");
      } else {
        setMessage("บันทึกไฟล์แนบแล้ว");
      }
    } finally {
      setUploadRunning(false);
    }
  };

  const createMemo = (issuePdf: boolean) => {
    startTransition(async () => {
      const saved = await postAction(editingMemoId ? "update_memo" : "create_memo", {
        ...memoForm, memo_id: editingMemoId,
      });
      const memoId = String(saved?.data?.memo_id || "");
      if (!memoId) return;
      const previousPdf = String(saved.data.pdf_file_id || "");
      const files = attachmentFiles.map((file) => ({ file, percent: 0, status: "รออัปโหลด" }));
      resetMemoEditor();
      setSelectedMemoId(memoId);
      setActiveTab("details");
      setMessage("บันทึกข้อมูล Memo แล้ว");
      if (files.length) {
        void uploadMemoFiles({ memoId, kind: "attachment", files, previousPdf, issuePdf });
      } else if (issuePdf) {
        void requestPdf(memoId, previousPdf);
      }
    });
  };

  const issueMemoPdf = (memoId: string) => {
    void requestPdf(memoId, String(memos.find((memo) => memo.memo_id === memoId)?.pdf_file_id || ""));
  };

  const sendMemoAcknowledgement = (memoId: string) => {
    startTransition(async () => {
      const result = await postAction("send_acknowledgement", {
        memo_id: memoId,
        origin: window.location.origin,
      });
      if (result?.success) {
        const target = result.data?.line_group_id ? ` ไปยังกลุ่ม ${result.data.line_group_id}` : "";
        setMessage(`ส่ง LINE ให้ลูกค้ารับทราบ Memo แล้ว${target}`);
      }
    });
  };

  const createVoFromMemo = (memo: MemoRecord) => {
    startTransition(async () => {
      const result = await postAction("create_vo_from_memo", { memo_id: memo.memo_id });
      const voId = String(result?.data?.vo_id || "");
      if (result?.success && voId) {
        setSelectedMemoId(memo.memo_id);
        setMessage(result.existing ? `Memo นี้มีรายการงานเพิ่ม-ลดแล้ว: ${voId}` : `สร้างร่างงานเพิ่ม-ลดจาก Memo แล้ว: ${voId}`);
      }
    });
  };

  const acknowledgeMemo = () => {
    if (!selectedMemo?.memo_id || !evidenceFiles.length) return;
    void uploadMemoFiles({
      memoId: selectedMemo.memo_id,
      kind: "evidence",
      files: evidenceFiles.map((file) => ({ file, percent: 0, status: "รออัปโหลด" })),
      previousPdf: String(selectedMemo.pdf_file_id || ""),
      issuePdf: true,
      acknowledgement: ackForm,
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
    if (nextFiles.length > 0) setAttachmentFiles((current) => [...current, ...nextFiles].slice(0, 10));
  };

  const addEvidenceFiles = (files: FileList | null) => {
    const nextFiles = Array.from(files || []);
    if (nextFiles.length > 0) setEvidenceFiles((current) => [...current, ...nextFiles].slice(0, 10));
  };

  const selectedEvidence = useMemo(() => {
    if (!selectedMemo?.memo_id) return [];
    return evidence.filter((item) => item.memo_id === selectedMemo.memo_id);
  }, [evidence, selectedMemo]);

  const busy = isPending || Boolean(loadingAction) || Boolean(upload) || Boolean(pdfJob && !pdfReady && !pdfTimedOut);

  const renderVoAction = (memo: MemoRecord, compact = false) => {
    if (!isVoMemo(memo)) return null;
    const linkedVo = linkedVos[memo.memo_id];
    if (linkedVo?.vo_id) {
      return (
        <a href={`/dashboard/sites/${encodeURIComponent(project.project_id)}/variation-orders`} className={`inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 font-extrabold text-blue-700 hover:bg-blue-100 ${compact ? "px-3 py-2 text-xs" : "px-3 py-1.5 text-xs"}`}>
          <ExternalLink size={13} /> เปิด VO {linkedVo.vo_id}
        </a>
      );
    }
    const readyForVo = isMemoReadyForVo(memo);
    return (
      <button
        type="button"
        disabled={busy || !canCreateVo || !readyForVo}
        onClick={() => createVoFromMemo(memo)}
        title={!readyForVo ? "ต้องบันทึกลูกค้ารับทราบก่อนสร้างงานเพิ่ม-ลด" : undefined}
        className={`inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 font-extrabold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "px-3 py-2 text-xs" : "px-3 py-1.5 text-xs"}`}
      >
        {loadingAction === "create_vo_from_memo" ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
        {readyForVo ? "สร้างร่างงานเพิ่ม-ลด" : "รอลูกค้ารับทราบก่อน"}
      </button>
    );
  };

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

      {upload && (
        <section data-no-global-loading="true" aria-label="สถานะอัปโหลดไฟล์ Memo" className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
          {upload.files.map(({ file, percent, status }, index) => (
            <div key={`${index}-${file.name}`} className="text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span>{index + 1}. {file.name}</span><span>{status} · {percent}%</span></div>
              <progress aria-label={file.name} className="w-full" value={percent} max={100} />
            </div>
          ))}
          {!uploadRunning && (
            <div className="flex gap-3">
              <button type="button" className="text-sm font-bold text-orange-700" onClick={() => uploadMemoFiles(upload)}>ลองอัปโหลดหรือยืนยันอีกครั้ง</button>
              <button type="button" className="text-sm text-gray-600" onClick={() => setUpload(null)}>ปิดคิวไฟล์</button>
            </div>
          )}
        </section>
      )}

      {pdfJob && (
        <section data-no-global-loading="true" role="status" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          {pdfReady ? "PDF Memo พร้อมเปิดแล้ว" : pdfTimedOut ? "ยังยืนยันผลการสร้าง PDF ไม่ได้" : "กำลังสร้าง PDF Memo เบื้องหลัง"}
          {pdfTimedOut && !pdfReady && (
            <button type="button" disabled={Boolean(loadingAction)} className="ml-3 font-bold underline" onClick={() => requestPdf(pdfJob.memoId, pdfJob.previousPdf, pdfJob.evidence)}>ลองสร้างอีกครั้ง</button>
          )}
        </section>
      )}

      {activeTab === "create" && (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <FileSignature className="text-orange-600" size={20} />
              <h3 className="text-lg font-extrabold text-gray-900">สร้างบันทึกข้อความ</h3>
              {editingMemoId ? (
                <>
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-extrabold text-orange-700">โหมดแก้ไข</span>
                  <button type="button" onClick={resetMemoEditor} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-600 hover:bg-gray-50">
                    <X size={14} />
                    ยกเลิกแก้ไข
                  </button>
                </>
              ) : null}
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
              <input
                type="file"
                multiple
                accept="image/*,application/pdf,.pdf"
                onChange={(event) => {
                  addAttachmentFiles(event.target.files);
                  event.target.value = "";
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-2 text-xs font-semibold text-gray-500">รูปภาพจะถูกย่ออัตโนมัติก่อนอัปโหลด เพื่อให้แนบหลักฐานและออก PDF ได้ง่ายขึ้น</p>
              {editingMemoId && existingAttachments.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-extrabold text-emerald-700">ไฟล์เดิมที่แนบไว้</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">{existingAttachments.length} ไฟล์</span>
                  </div>
                  <ExistingAttachmentList attachments={existingAttachments} />
                  <p className="mt-2 text-[11px] font-semibold text-gray-500">ไฟล์เดิมจะยังคงอยู่หลังบันทึก สามารถเลือกไฟล์ด้านบนเพื่อแนบเพิ่มได้</p>
                </div>
              ) : null}
              <div className="mt-3">
                {editingMemoId ? <p className="mb-2 text-xs font-extrabold text-gray-600">ไฟล์ที่จะเพิ่มใหม่</p> : null}
                <FileList
                  files={attachmentFiles}
                  onRemove={(index) => setAttachmentFiles(attachmentFiles.filter((_file, fileIndex) => fileIndex !== index))}
                  emptyLabel={editingMemoId ? "ยังไม่ได้เลือกไฟล์ใหม่เพิ่มเติม" : undefined}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
              <h3 className="font-extrabold text-gray-950">ขั้นตอนเอกสาร</h3>
              <p className="mt-1 text-sm text-gray-600">บันทึกร่างไว้ก่อน หรือออก PDF ทางการพร้อมโลโก้เพื่อส่งให้ลูกค้าได้ทันที</p>
              <div className="mt-4 grid gap-2">
                <button type="button" disabled={busy || !canCreate} onClick={() => createMemo(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  {loadingAction === "create_memo" || loadingAction === "update_memo" ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                  {editingMemoId ? "บันทึกการแก้ไข" : "บันทึกร่าง"}
                </button>
                <button type="button" disabled={busy || !canCreate || !canIssue} onClick={() => createMemo(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60">
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                  {editingMemoId ? "บันทึกและออก PDF ใหม่" : "บันทึกและออก PDF Memo"}
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
              <input
                type="file"
                multiple
                accept="image/*,application/pdf,.pdf"
                onChange={(event) => {
                  addEvidenceFiles(event.target.files);
                  event.target.value = "";
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="text-xs font-semibold text-gray-500">หลักฐานรูปภาพจะถูกย่อก่อนบันทึก เหมาะกับแคปหน้าจอ LINE และภาพหน้างาน</p>
              <FileList files={evidenceFiles} onRemove={(index) => setEvidenceFiles(evidenceFiles.filter((_file, fileIndex) => fileIndex !== index))} />
              <button type="button" disabled={busy || !canAcknowledge || !selectedMemo?.pdf_url || evidenceFiles.length === 0} onClick={acknowledgeMemo} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60">
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
                    <button type="button" disabled={busy || !canCreate} onClick={() => startEditMemo(selectedMemo)} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-extrabold text-orange-700 hover:bg-orange-100 disabled:opacity-60">
                      <SquarePen size={13} /> แก้ไข Memo
                    </button>
                    {renderVoAction(selectedMemo)}
                    {selectedMemo.pdf_url ? <a href={String(selectedMemo.pdf_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-orange-600">เปิด PDF <ExternalLink size={14} /></a> : null}
                    {selectedMemo.pdf_url ? (
                      <button type="button" disabled={busy || !canIssue} onClick={() => issueMemoPdf(selectedMemo.memo_id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                        <Printer size={13} /> ออก PDF ใหม่
                      </button>
                    ) : null}
                    {!["acknowledged", "extension_approved", "closed", "rejected"].includes(String(selectedMemo.status || "")) ? (
                      <button type="button" disabled={busy || !canIssue} onClick={() => sendMemoAcknowledgement(selectedMemo.memo_id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60">
                        {loadingAction === "send_acknowledgement" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} ส่ง LINE รับทราบ
                      </button>
                    ) : null}
                    {selectedMemo.acknowledgement_url ? (
                      <a href={String(selectedMemo.acknowledgement_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
                        ลิงก์รับทราบ <ExternalLink size={13} />
                      </a>
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
                          <button type="button" disabled={busy || !canCreate} onClick={() => startEditMemo(memo)} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-extrabold text-orange-700 hover:bg-orange-100 disabled:opacity-60">
                            <SquarePen size={13} /> แก้ไข
                          </button>
                          {renderVoAction(memo, true)}
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
                          {!["acknowledged", "extension_approved", "closed", "rejected"].includes(String(memo.status || "")) ? (
                            <button type="button" disabled={busy || !canIssue} onClick={() => sendMemoAcknowledgement(memo.memo_id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60">
                              {loadingAction === "send_acknowledgement" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} LINE
                            </button>
                          ) : null}
                          {memo.acknowledgement_url ? (
                            <a href={String(memo.acknowledgement_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
                              Link <ExternalLink size={13} />
                            </a>
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
              <h3 className="font-extrabold text-gray-900">ประวัติการทำรายการ</h3>
              <button
                type="button"
                aria-expanded={auditOpen}
                onClick={() => setAuditOpen(!auditOpen)}
                className="ml-auto rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                {auditOpen ? "ซ่อนประวัติ" : "ดูประวัติ"}
              </button>
            </div>
            {auditOpen && <div className="space-y-2">
              {auditError ? (
                <button type="button" onClick={() => retryAudit()} className="text-sm text-red-700">
                  โหลดประวัติไม่สำเร็จ ลองอีกครั้ง
                </button>
              ) : !auditData ? (
                <p role="status" className="text-sm text-gray-500">กำลังโหลดประวัติ</p>
              ) : null}
              {auditLogs.map((log) => (
                <div key={String(log.log_id || `${log.timestamp}-${log.action}`)} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold text-gray-800">{log.summary || log.action}</span>
                    <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{log.actor_name || log.actor_email || "-"} · {log.action}</p>
                </div>
              ))}
              {auditData && !auditError && auditLogs.length === 0 ? (
                <p className="text-sm text-gray-500">ยังไม่มีประวัติการทำรายการ</p>
              ) : null}
            </div>}
          </div>
        </section>
      )}
    </div>
  );
}
