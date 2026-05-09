"use client";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link as LinkIcon,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState, useTransition, type ComponentType } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { MasterProject } from "@/lib/masterProjects";
import { uploadProjectDocumentDirectly } from "@/lib/directDriveDocumentUpload";

type ProjectDocument = Record<string, string | number | undefined> & {
  document_id: string;
  category?: string;
  title?: string;
  version_number?: string | number;
  file_name?: string;
  mime_type?: string;
  file_size?: string | number;
  drive_url?: string;
  notes?: string;
  uploaded_by_name?: string;
  created_at?: string;
  updated_at?: string;
};

type DefectRound = Record<string, string | number | undefined> & {
  round_id: string;
  document_no?: string;
  title?: string;
  pdf_url?: string;
  inspection_date?: string;
  created_at?: string;
  updated_at?: string;
};

type DefectItem = Record<string, string | number | undefined> & {
  item_id: string;
  item_no?: string | number;
  zone?: string;
  description?: string;
  before_photos_json?: string;
  after_photos_json?: string;
  updated_at?: string;
};

type DefectEvidence = Record<string, string | number | undefined> & {
  evidence_id: string;
  file_name?: string;
  file_url?: string;
  mime_type?: string;
  acknowledged_by?: string;
  acknowledged_date?: string;
  channel?: string;
  created_at?: string;
};

type DefectPhoto = {
  file_name?: string;
  file_url?: string;
  mime_type?: string;
};

type FileItem = {
  id: string;
  title: string;
  fileName: string;
  kind: "document" | "defect_pdf" | "defect_photo" | "acknowledgement";
  category: string;
  source: string;
  url?: string;
  size?: string | number;
  date?: string | number;
  notes?: string;
};

type TabKey = "all" | "documents" | "defects" | "acknowledgement" | "photos";

const CATEGORY_OPTIONS = [
  ["drawing", "แบบ/Shop drawing"],
  ["contract", "สัญญา/อนุมัติ"],
  ["report", "รายงาน"],
  ["handover", "ส่งมอบงาน"],
  ["defect", "Defect"],
  ["other", "อื่นๆ"],
];

const TABS: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: "all", label: "ทั้งหมด", icon: FolderOpen },
  { key: "documents", label: "เอกสารอัปโหลด", icon: FileText },
  { key: "defects", label: "PDF Defect", icon: AlertCircle },
  { key: "acknowledgement", label: "หลักฐานลูกค้า", icon: CheckCircle2 },
  { key: "photos", label: "รูปหน้างาน", icon: ImageIcon },
];

const KIND_LABELS: Record<FileItem["kind"], string> = {
  document: "เอกสาร",
  defect_pdf: "PDF Defect",
  defect_photo: "รูป Defect",
  acknowledgement: "หลักฐานรับทราบ",
};

const KIND_STYLES: Record<FileItem["kind"], string> = {
  document: "border-blue-200 bg-blue-50 text-blue-700",
  defect_pdf: "border-red-200 bg-red-50 text-red-700",
  defect_photo: "border-amber-200 bg-amber-50 text-amber-700",
  acknowledgement: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function parseDefectPhotos(value?: string | number) {
  if (!value) return [] as DefectPhoto[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as DefectPhoto[] : [];
  } catch {
    return [];
  }
}

function formatBytes(value?: string | number) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function safeText(value?: string | number) {
  return String(value || "").trim();
}

function buildDriveFolderUrl(folderId?: string) {
  const value = String(folderId || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(value)}`;
}

function fileMatchesTab(file: FileItem, tab: TabKey) {
  if (tab === "all") return true;
  if (tab === "documents") return file.kind === "document";
  if (tab === "defects") return file.kind === "defect_pdf";
  if (tab === "acknowledgement") return file.kind === "acknowledgement";
  return file.kind === "defect_photo";
}

function collectFiles(documents: ProjectDocument[], defectData?: {
  rounds?: DefectRound[];
  items?: DefectItem[];
  evidence?: DefectEvidence[];
}) {
  const files: FileItem[] = [];

  documents.forEach((doc) => {
    files.push({
      id: doc.document_id,
      title: safeText(doc.title) || safeText(doc.file_name) || "เอกสารไซต์",
      fileName: safeText(doc.file_name) || "ไฟล์เอกสาร",
      kind: "document",
      category: safeText(doc.category) || "other",
      source: `Project Documents${doc.version_number ? ` / v${doc.version_number}` : ""}`,
      url: safeText(doc.drive_url),
      size: doc.file_size,
      date: doc.updated_at || doc.created_at,
      notes: safeText(doc.notes),
    });
  });

  (defectData?.rounds || []).forEach((round) => {
    if (!round.pdf_url) return;
    files.push({
      id: `defect-pdf-${round.round_id}`,
      title: safeText(round.document_no) || safeText(round.title) || "Defect report",
      fileName: `${safeText(round.document_no) || round.round_id}.pdf`,
      kind: "defect_pdf",
      category: "defect",
      source: safeText(round.title) || "Defect inspection",
      url: safeText(round.pdf_url),
      date: round.updated_at || round.created_at || round.inspection_date,
    });
  });

  (defectData?.evidence || []).forEach((evidence) => {
    files.push({
      id: `ack-${evidence.evidence_id}`,
      title: safeText(evidence.file_name) || "หลักฐานรับทราบจากลูกค้า",
      fileName: safeText(evidence.file_name) || "acknowledgement",
      kind: "acknowledgement",
      category: "defect",
      source: [safeText(evidence.channel) || "LINE", safeText(evidence.acknowledged_by)].filter(Boolean).join(" / "),
      url: safeText(evidence.file_url),
      date: evidence.created_at || evidence.acknowledged_date,
    });
  });

  (defectData?.items || []).forEach((item) => {
    const beforePhotos = parseDefectPhotos(item.before_photos_json);
    const afterPhotos = parseDefectPhotos(item.after_photos_json);
    const photos = [
      ...beforePhotos.map((photo) => ({ photo, stage: "ก่อนแก้" })),
      ...afterPhotos.map((photo) => ({ photo, stage: "หลังแก้" })),
    ];

    photos.forEach(({ photo, stage }, index) => {
      files.push({
        id: `defect-photo-${item.item_id}-${stage}-${index}`,
        title: `${stage} ${safeText(item.zone) || `รายการ ${item.item_no || ""}`}`.trim(),
        fileName: safeText(photo.file_name) || "defect-photo",
        kind: "defect_photo",
        category: "defect",
        source: safeText(item.description) || "Defect item",
        url: safeText(photo.file_url),
        date: item.updated_at,
      });
    });
  });

  return files.sort((a, b) => new Date(String(b.date || 0)).getTime() - new Date(String(a.date || 0)).getTime());
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
      <FolderOpen className="mx-auto text-gray-300" size={34} />
      <h3 className="mt-3 font-bold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

function FilesTable({ files }: { files: FileItem[] }) {
  if (files.length === 0) {
    return <EmptyState title="ยังไม่มีไฟล์ในหมวดนี้" description="เมื่อมีการอัปโหลดเอกสารหรือออกเอกสารจากโมดูลอื่น ไฟล์จะแสดงที่นี่อัตโนมัติ" />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">ไฟล์</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">ที่มา</th>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3 text-right">เปิด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {files.map((file) => (
              <tr key={file.id} className="align-top hover:bg-gray-50">
                <td className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-gray-200 bg-white p-2 text-gray-500">
                      {file.kind === "defect_photo" || file.kind === "acknowledgement" ? <ImageIcon size={18} /> : <FileText size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{file.title}</p>
                      <p className="mt-1 break-all text-xs text-gray-500">{file.fileName}</p>
                      {file.notes ? <p className="mt-1 text-xs text-gray-500">{file.notes}</p> : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${KIND_STYLES[file.kind]}`}>
                    {KIND_LABELS[file.kind]}
                  </span>
                  <p className="mt-2 text-xs text-gray-500">{formatBytes(file.size)}</p>
                </td>
                <td className="px-4 py-4 text-gray-600">{file.source || "-"}</td>
                <td className="px-4 py-4 text-gray-600">{formatDate(file.date)}</td>
                <td className="px-4 py-4 text-right">
                  {file.url ? (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      เปิดไฟล์ <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">ไม่มีลิงก์</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FilesWorkspace({ project }: { project: MasterProject }) {
  const projectId = encodeURIComponent(project.project_id);
  const documents = useSWR<{ success?: boolean; data?: ProjectDocument[]; error?: string }>(`/api/sites/${projectId}/documents`, fetcher);
  const defects = useSWR<{ success?: boolean; rounds?: DefectRound[]; items?: DefectItem[]; evidence?: DefectEvidence[]; error?: string }>(`/api/sites/${projectId}/defects`, fetcher);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const files = useMemo(() => collectFiles(documents.data?.data || [], defects.data), [documents.data, defects.data]);
  const filteredFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter((file) => {
      if (!fileMatchesTab(file, activeTab)) return false;
      if (!normalized) return true;
      return [file.title, file.fileName, file.source, file.category, file.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [activeTab, files, query]);

  const uploadPdf = (formData: FormData) => {
    setUploadError("");
    setUploadMessage("กำลังส่งไฟล์ตรงไป Google Drive...");
    startTransition(async () => {
      try {
        const file = formData.get("file");
        if (!(file instanceof File)) {
          setUploadError("กรุณาเลือกไฟล์ PDF");
          setUploadMessage("");
          return;
        }

        const uploadedDocument = await uploadProjectDocumentDirectly({
          endpoint: `/api/sites/${projectId}/documents`,
          category: String(formData.get("category") || "other"),
          title: String(formData.get("title") || file.name),
          notes: String(formData.get("notes") || ""),
          file,
        });

        setUploadMessage("อัปโหลดเข้า Drive และบันทึก Version History แล้ว");
        formRef.current?.reset();
        await documents.mutate((current) => ({
          success: true,
          data: [uploadedDocument, ...(current?.data || [])],
        }), { revalidate: true });
      } catch (error: unknown) {
        setUploadError(error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ");
        setUploadMessage("");
      }
    });
  };

  const totalDocuments = files.filter((file) => file.kind === "document").length;
  const totalDefectPdfs = files.filter((file) => file.kind === "defect_pdf").length;
  const totalEvidence = files.filter((file) => file.kind === "acknowledgement").length;
  const totalPhotos = files.filter((file) => file.kind === "defect_photo").length;
  const driveUrl = buildDriveFolderUrl(project.drive_folder_id);
  const isLoading = documents.isLoading || defects.isLoading;
  const loadError = documents.data?.error || defects.data?.error;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="เอกสารอัปโหลด" value={totalDocuments} tone="text-blue-700" />
        <StatCard label="PDF Defect" value={totalDefectPdfs} tone="text-red-600" />
        <StatCard label="หลักฐานลูกค้า" value={totalEvidence} tone="text-emerald-700" />
        <StatCard label="รูป Defect" value={totalPhotos} tone="text-amber-700" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <form
            ref={formRef}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            action={uploadPdf}
          >
            <div className="mb-4 flex items-center gap-2">
              <Upload className="text-orange-600" size={18} />
              <h3 className="font-bold text-gray-900">อัปโหลดเอกสาร PDF</h3>
            </div>
            <div className="space-y-3">
              <select name="category" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" defaultValue="report">
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input name="title" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="ชื่อเอกสาร" required />
              <input name="file" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" type="file" accept="application/pdf,.pdf" required />
              <textarea name="notes" className="min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="หมายเหตุ" />
              {uploadError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{uploadError}</p> : null}
              {uploadMessage ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{uploadMessage}</p> : null}
              <button disabled={isPending || !driveUrl} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isPending ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                {driveUrl ? "อัปโหลดตรงไป Drive" : "ต้องตั้งค่า Drive Folder ก่อน"}
              </button>
              <p className="text-xs font-semibold text-gray-500">ไฟล์จะถูกส่งตรงไป Google Drive แล้วระบบบันทึก file id และ version history ให้อัตโนมัติ</p>
            </div>
          </form>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FolderOpen className="text-blue-600" size={18} />
              <h3 className="font-bold text-gray-900">โฟลเดอร์ไซต์</h3>
            </div>
            <p className="text-sm text-gray-500">{project.name || project.project_id}</p>
            {driveUrl ? (
              <a
                href={driveUrl}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                เปิด Google Drive <ExternalLink size={16} />
              </a>
            ) : (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                ยังไม่ได้ผูก Drive folder
              </p>
            )}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                        active
                          ? "border-orange-200 bg-orange-50 text-orange-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative min-w-0 lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
                  placeholder="ค้นหาชื่อไฟล์ / หมวด / ที่มา"
                />
              </div>
            </div>
          </div>

          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {loadError}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm font-semibold text-gray-500">
              <RefreshCw className="mx-auto mb-3 animate-spin text-gray-400" size={24} />
              กำลังโหลดไฟล์
            </div>
          ) : (
            <FilesTable files={filteredFiles} />
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <LinkIcon className="text-gray-400" size={20} />
              <h4 className="mt-2 font-bold text-gray-900">Project Documents</h4>
              <p className="mt-1 text-sm text-gray-500">เอกสารที่อัปโหลดเข้าศูนย์รวมไฟล์โดยตรง</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <AlertCircle className="text-gray-400" size={20} />
              <h4 className="mt-2 font-bold text-gray-900">Defect Inspections</h4>
              <p className="mt-1 text-sm text-gray-500">PDF, รูปก่อนแก้/หลังแก้ และหลักฐานรับทราบจากลูกค้า</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <FolderOpen className="text-gray-400" size={20} />
              <h4 className="mt-2 font-bold text-gray-900">Drive Folder</h4>
              <p className="mt-1 text-sm text-gray-500">เปิดโฟลเดอร์หลักของไซต์เมื่อต้องดูไฟล์นอกระบบ</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
