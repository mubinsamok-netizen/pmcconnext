"use client";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link as LinkIcon,
  Maximize2,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import NextImage from "next/image";
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
  drive_file_id?: string;
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

type DriveFolderFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  webViewLink?: string | null;
  webContentLink?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  folderPath?: string;
  isFolder?: boolean;
};

type FileItem = {
  id: string;
  title: string;
  fileName: string;
  kind: "document" | "defect_pdf" | "defect_photo" | "acknowledgement" | "drive_file" | "drive_image";
  category: string;
  source: string;
  url?: string;
  previewUrl?: string;
  size?: string | number;
  date?: string | number;
  notes?: string;
  folderPath?: string;
};

type TabKey = "all" | "documents" | "defects" | "acknowledgement" | "photos" | "drive";

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
  { key: "drive", label: "จาก Drive", icon: LinkIcon },
  { key: "defects", label: "PDF Defect", icon: AlertCircle },
  { key: "acknowledgement", label: "หลักฐานลูกค้า", icon: CheckCircle2 },
  { key: "photos", label: "รูปหน้างาน", icon: ImageIcon },
];

const KIND_LABELS: Record<FileItem["kind"], string> = {
  document: "เอกสาร",
  drive_file: "ไฟล์จาก Drive",
  drive_image: "รูปจาก Drive",
  defect_pdf: "PDF Defect",
  defect_photo: "รูป Defect",
  acknowledgement: "หลักฐานรับทราบ",
};

const KIND_STYLES: Record<FileItem["kind"], string> = {
  document: "border-blue-200 bg-blue-50 text-blue-700",
  drive_file: "border-slate-200 bg-slate-50 text-slate-700",
  drive_image: "border-cyan-200 bg-cyan-50 text-cyan-700",
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

function safeText(value?: unknown) {
  return String(value || "").trim();
}

function buildDriveFolderUrl(folderId?: string) {
  const value = String(folderId || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(value)}`;
}

function extractDriveFileId(value?: string | number) {
  const text = safeText(value);
  if (!text) return "";
  const directMatch = text.match(/\/api\/drive\/files\/([^/?#]+)/i);
  if (directMatch?.[1]) return decodeURIComponent(directMatch[1]);
  const driveMatch = text.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([^/?#]+)/i);
  if (driveMatch?.[1]) return decodeURIComponent(driveMatch[1]);
  const idMatch = text.match(/[?&]id=([^&#]+)/i);
  return idMatch?.[1] ? decodeURIComponent(idMatch[1]) : "";
}

function getDriveOpenUrl(file: DriveFolderFile) {
  return safeText(file.webViewLink) || safeText(file.webContentLink) || `/api/drive/files/${encodeURIComponent(file.id)}`;
}

function buildDrivePreviewUrl(fileId?: string) {
  const value = safeText(fileId);
  return value ? `/api/drive/files/${encodeURIComponent(value)}` : "";
}

function isImageDriveFile(file: DriveFolderFile) {
  return file.mimeType.startsWith("image/");
}

function isPhotoFile(file: FileItem) {
  return file.kind === "defect_photo" || file.kind === "drive_image" || file.kind === "acknowledgement";
}

function fileMatchesTab(file: FileItem, tab: TabKey) {
  if (tab === "all") return true;
  if (tab === "documents") return file.kind === "document" || file.kind === "drive_file";
  if (tab === "drive") return file.kind === "drive_file" || file.kind === "drive_image";
  if (tab === "defects") return file.kind === "defect_pdf";
  if (tab === "acknowledgement") return file.kind === "acknowledgement";
  return file.kind === "defect_photo" || file.kind === "drive_image";
}

function collectFiles(documents: ProjectDocument[], defectData?: {
  rounds?: DefectRound[];
  items?: DefectItem[];
  evidence?: DefectEvidence[];
}, driveFiles: DriveFolderFile[] = []) {
  const files: FileItem[] = [];
  const knownDriveFileIds = new Set<string>();

  documents.forEach((doc) => {
    const driveFileId = safeText(doc.drive_file_id) || extractDriveFileId(doc.drive_url);
    if (driveFileId) knownDriveFileIds.add(driveFileId);
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
      const photoUrl = safeText(photo.file_url);
      const driveFileId = extractDriveFileId(photoUrl);
      files.push({
        id: `defect-photo-${item.item_id}-${stage}-${index}`,
        title: `${stage} ${safeText(item.zone) || `รายการ ${item.item_no || ""}`}`.trim(),
        fileName: safeText(photo.file_name) || "defect-photo",
        kind: "defect_photo",
        category: "defect",
        source: safeText(item.description) || "Defect item",
        url: photoUrl,
        previewUrl: driveFileId ? buildDrivePreviewUrl(driveFileId) : photoUrl,
        date: item.updated_at,
      });
    });
  });

  files.forEach((file) => {
    const driveFileId = extractDriveFileId(file.url);
    if (driveFileId) knownDriveFileIds.add(driveFileId);
  });

  driveFiles.forEach((file) => {
    if (!file.id || file.isFolder || knownDriveFileIds.has(file.id)) return;
    const folderPath = safeText(file.folderPath);
    const isImage = isImageDriveFile(file);
    files.push({
      id: `drive-${file.id}`,
      title: file.name || "Drive file",
      fileName: file.name || file.id,
      kind: isImage ? "drive_image" : "drive_file",
      category: "drive",
      source: folderPath ? `Google Drive / ${folderPath}` : "Google Drive",
      url: getDriveOpenUrl(file),
      previewUrl: isImage ? buildDrivePreviewUrl(file.id) : "",
      size: file.size || undefined,
      date: file.modifiedTime || file.createdTime || undefined,
      notes: "ไฟล์ที่อยู่ในโฟลเดอร์โครงการโดยตรง",
      folderPath,
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
    return <EmptyState title="ยังไม่มีไฟล์ในหมวดนี้" description="เมื่อมีไฟล์ในโฟลเดอร์ Drive ของไซต์ หรือมีการอัปโหลดเอกสารจากระบบ ไฟล์จะแสดงที่นี่อัตโนมัติ" />;
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
                      {file.kind === "defect_photo" || file.kind === "drive_image" || file.kind === "acknowledgement" ? <ImageIcon size={18} /> : <FileText size={18} />}
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

function PhotoGallery({
  files,
  onPreview,
}: {
  files: FileItem[];
  onPreview: (file: FileItem) => void;
}) {
  if (files.length === 0) {
    return <EmptyState title="ยังไม่มีรูปในโฟลเดอร์นี้" description="ลองเลือกโฟลเดอร์เดือนอื่น หรืออัปโหลดรูปเข้าผ่าน Daily Reports / Photos ใน Google Drive" />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {files.map((file) => (
        <article key={file.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => onPreview(file)}
            className="group relative block aspect-[4/3] w-full overflow-hidden bg-gray-100 text-left"
          >
            {file.previewUrl ? (
              <NextImage
                src={file.previewUrl}
                alt={file.title}
                fill
                unoptimized
                sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition duration-200 group-hover:scale-[1.03]"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-300">
                <ImageIcon size={42} />
              </div>
            )}
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-slate-950/80 px-2 py-1 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">
              <Maximize2 size={12} /> Preview
            </span>
          </button>
          <div className="space-y-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-950">{file.title}</p>
              <p className="mt-1 truncate text-xs font-semibold text-gray-500">{file.fileName}</p>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
              <span className="truncate">{file.folderPath || file.source || "-"}</span>
              <span className="shrink-0">{formatDate(file.date)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${KIND_STYLES[file.kind]}`}>
                {KIND_LABELS[file.kind]}
              </span>
              {file.url ? (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
                >
                  เปิดไฟล์ <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function PhotoPreviewDialog({
  file,
  onClose,
}: {
  file?: FileItem | null;
  onClose: () => void;
}) {
  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-gray-950">{file.title}</h3>
            <p className="mt-1 truncate text-xs font-semibold text-gray-500">{file.folderPath || file.source || file.fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="ปิด preview"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 bg-gray-950 p-3">
          {file.previewUrl ? (
            <div className="relative h-[70vh] w-full">
              <NextImage
                src={file.previewUrl}
                alt={file.title}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
              />
            </div>
          ) : (
            <div className="flex h-[60vh] items-center justify-center text-gray-500">
              <ImageIcon size={56} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm">
          <div className="min-w-0 text-gray-600">
            <span className="font-bold text-gray-900">{file.fileName}</span>
            <span className="mx-2 text-gray-300">/</span>
            <span>{formatDate(file.date)}</span>
          </div>
          {file.url ? (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              เปิดไฟล์ต้นฉบับ <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FilesWorkspace({ project }: { project: MasterProject }) {
  const projectId = encodeURIComponent(project.project_id);
  const documents = useSWR<{ success?: boolean; data?: ProjectDocument[]; error?: string }>(`/api/sites/${projectId}/documents`, fetcher);
  const defects = useSWR<{ success?: boolean; rounds?: DefectRound[]; items?: DefectItem[]; evidence?: DefectEvidence[]; error?: string }>(`/api/sites/${projectId}/defects`, fetcher);
  const driveFiles = useSWR<{ success?: boolean; data?: DriveFolderFile[]; error?: string }>(`/api/sites/${projectId}/drive-files`, fetcher);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [openDrivePending, setOpenDrivePending] = useState(false);
  const [activePhotoFolder, setActivePhotoFolder] = useState("");
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const files = useMemo(
    () => collectFiles(documents.data?.data || [], defects.data, driveFiles.data?.data || []),
    [documents.data, defects.data, driveFiles.data]
  );
  const filteredFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter((file) => {
      if (!fileMatchesTab(file, activeTab)) return false;
      if (activeTab === "photos" && activePhotoFolder && (file.folderPath || "__none__") !== activePhotoFolder) return false;
      if (!normalized) return true;
      return [file.title, file.fileName, file.source, file.category, file.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [activePhotoFolder, activeTab, files, query]);
  const photoFolders = useMemo(() => {
    const folderCounts = new Map<string, number>();
    files.filter(isPhotoFile).forEach((file) => {
      const key = file.folderPath || "__none__";
      folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
    });
    return Array.from(folderCounts.entries())
      .sort(([a], [b]) => {
        if (a === "__none__") return 1;
        if (b === "__none__") return -1;
        return b.localeCompare(a, "th");
      })
      .map(([value, count]) => ({
        value,
        label: value === "__none__" ? "ไม่ระบุโฟลเดอร์" : value,
        count,
      }));
  }, [files]);

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
        await driveFiles.mutate();
      } catch (error: unknown) {
        setUploadError(error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ");
        setUploadMessage("");
      }
    });
  };

  const openSelectedCategoryFolder = async () => {
    setUploadError("");
    setUploadMessage("");

    if (!driveUrl) {
      setUploadError("ยังไม่ได้ตั้งค่า Drive Folder ของไซต์งาน");
      return;
    }

    const formData = formRef.current ? new FormData(formRef.current) : new FormData();
    const category = String(formData.get("category") || "other");
    setOpenDrivePending(true);

    try {
      const response = await fetch(`/api/sites/${projectId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open_category_folder",
          category,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.data?.folder_url) {
        throw new Error(payload?.error || "เปิดโฟลเดอร์ Drive ไม่สำเร็จ");
      }

      window.open(String(payload.data.folder_url), "_blank", "noopener,noreferrer");
      setUploadMessage("เปิดโฟลเดอร์หมวดนี้ใน Google Drive แล้ว สามารถลากไฟล์ไปวางใน Drive ได้โดยตรง");
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : "เปิดโฟลเดอร์ Drive ไม่สำเร็จ");
    } finally {
      setOpenDrivePending(false);
    }
  };

  const totalDocuments = files.filter((file) => file.kind === "document").length;
  const totalDriveFiles = files.filter((file) => file.kind === "drive_file" || file.kind === "drive_image").length;
  const totalDefectPdfs = files.filter((file) => file.kind === "defect_pdf").length;
  const totalEvidence = files.filter((file) => file.kind === "acknowledgement").length;
  const totalPhotos = files.filter((file) => file.kind === "defect_photo" || file.kind === "drive_image").length;
  const driveUrl = buildDriveFolderUrl(project.drive_folder_id);
  const isLoading = documents.isLoading || defects.isLoading || driveFiles.isLoading;
  const loadError = documents.data?.error || defects.data?.error || driveFiles.data?.error;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        <StatCard label="เอกสารอัปโหลด" value={totalDocuments} tone="text-blue-700" />
        <StatCard label="ไฟล์ใน Drive" value={totalDriveFiles} tone="text-slate-700" />
        <StatCard label="PDF Defect" value={totalDefectPdfs} tone="text-red-600" />
        <StatCard label="หลักฐานลูกค้า" value={totalEvidence} tone="text-emerald-700" />
        <StatCard label="รูปทั้งหมด" value={totalPhotos} tone="text-amber-700" />
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
              <button
                type="button"
                disabled={openDrivePending || !driveUrl}
                onClick={openSelectedCategoryFolder}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {openDrivePending ? <RefreshCw className="animate-spin" size={16} /> : <FolderOpen size={16} />}
                เปิดโฟลเดอร์หมวดนี้ใน Drive
                <ExternalLink size={14} />
              </button>
              <p className="text-xs font-semibold text-gray-500">อัปโหลดผ่านระบบจะบันทึก file id และ version history ให้อัตโนมัติ ส่วนปุ่มเปิดโฟลเดอร์ใช้สำหรับแนบ/ลากไฟล์เข้า Google Drive โดยตรง</p>
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
              <div className="grid min-w-0 gap-2 lg:w-[520px] lg:grid-cols-[1fr_220px]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
                    placeholder="ค้นหาชื่อไฟล์ / หมวด / ที่มา"
                  />
                </div>
                {activeTab === "photos" ? (
                  <select
                    value={activePhotoFolder}
                    onChange={(event) => setActivePhotoFolder(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-orange-400"
                    aria-label="เลือกโฟลเดอร์รูป"
                  >
                    <option value="">ทุกโฟลเดอร์รูป ({files.filter(isPhotoFile).length})</option>
                    {photoFolders.map((folder) => (
                      <option key={folder.value} value={folder.value}>
                        {folder.label} ({folder.count})
                      </option>
                    ))}
                  </select>
                ) : null}
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
          ) : activeTab === "photos" ? (
            <PhotoGallery files={filteredFiles.filter(isPhotoFile)} onPreview={setPreviewFile} />
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
      <PhotoPreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
