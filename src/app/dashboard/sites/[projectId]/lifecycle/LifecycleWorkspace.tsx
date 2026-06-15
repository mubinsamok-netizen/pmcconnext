"use client";

import { useMemo, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import { ArrowRight, Bell, ExternalLink, FileUp, FolderOpen, Loader2, Save } from "lucide-react";
import useSWR from "swr";
import { documentCategoryOptions, lifecycleStatusOptions } from "@/lib/projectLifecycle";
import { fetcher } from "@/lib/fetcher";
import { uploadProjectDocumentDirectly } from "@/lib/directDriveDocumentUpload";

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

type ProjectMeta = {
  siteSheetId: string;
  driveFolderId: string;
};

type WorkspaceTab = "lifecycle" | "documents" | "warranty";

type StatusDestination =
  | {
      kind: "tab";
      tab: WorkspaceTab;
      label: string;
      description: string;
    }
  | {
      kind: "href";
      href: string;
      label: string;
      description: string;
    };

type LifecycleForm = Record<string, string> & {
  current_status: string;
};

type DocumentRecord = Record<string, string | number | undefined> & {
  document_id: string;
  category?: string;
  title?: string;
  version_number?: string;
  file_name?: string;
  drive_url?: string;
  uploaded_by_name?: string;
  created_at?: string;
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

type DocumentHistoryRow = {
  id: string;
  title: string;
  category: string;
  versionLabel: string;
  date: string;
  driveUrl: string;
  sourceLabel: string;
};

const emptyLifecycle: LifecycleForm = {
  current_status: "design",
  design_start_date: "",
  design_done_date: "",
  contract_signed_date: "",
  drawing_start_date: "",
  drawing_done_date: "",
  permit_submitted_date: "",
  permit_received_date: "",
  permit_expiry_date: "",
  temporary_electric_install_date: "",
  temporary_electric_expiry_date: "",
  temporary_water_install_date: "",
  temporary_water_expiry_date: "",
  demolition_waiting_date: "",
  demolition_done_date: "",
  construction_start_date: "",
  construction_end_date: "",
  notes: "",
};

const emptyWarranty = {
  handover_date: "",
  structure_retention_date: "",
  structure_expiry_date: "",
  structure_notes: "",
  roof_retention_date: "",
  roof_expiry_date: "",
  roof_notes: "",
  architecture_retention_date: "",
  architecture_expiry_date: "",
  architecture_notes: "",
};

const lifecycleDateFields = [
  "design_start_date",
  "design_done_date",
  "contract_signed_date",
  "drawing_start_date",
  "drawing_done_date",
  "permit_submitted_date",
  "permit_received_date",
  "permit_expiry_date",
  "temporary_electric_install_date",
  "temporary_electric_expiry_date",
  "temporary_water_install_date",
  "temporary_water_expiry_date",
  "demolition_waiting_date",
  "demolition_done_date",
  "construction_start_date",
  "construction_end_date",
];

const warrantyDateFields = [
  "handover_date",
  "structure_retention_date",
  "structure_expiry_date",
  "roof_retention_date",
  "roof_expiry_date",
  "architecture_retention_date",
  "architecture_expiry_date",
];

function toIsoDate(date?: string | number) {
  const value = String(date ?? "").trim();
  if (!value) return "";

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0 && numericValue < 100000) {
    const sheetEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(sheetEpoch + Math.floor(numericValue) * 86400000);
    return parsed.toISOString().slice(0, 10);
  }

  const slashMatch = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (slashMatch) {
    const [, first, second, yearValue] = slashMatch;
    let year = Number(yearValue);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;

    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const isMonthFirst = firstNumber <= 12 && secondNumber > 12;
    const day = isMonthFirst ? secondNumber : firstNumber;
    const month = isMonthFirst ? firstNumber : secondNumber;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeDateFields<T extends Record<string, string>>(data: T, fields: string[]) {
  const next: Record<string, string> = { ...data };
  fields.forEach((field) => {
    if (next[field]) next[field] = toIsoDate(next[field]);
  });
  return next as T;
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function isPdfDriveFile(file: DriveFolderFile) {
  return !file.isFolder && (
    file.mimeType === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function getDriveOpenUrl(file: DriveFolderFile) {
  return safeText(file.webViewLink) || safeText(file.webContentLink) || `/api/drive/files/${encodeURIComponent(file.id)}`;
}

function getProjectDocumentDriveCategory(file: DriveFolderFile) {
  const segments = safeText(file.folderPath)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const rootIndex = segments.findIndex((segment) => segment.toLowerCase() === "project documents");
  if (rootIndex < 0) return null;

  const categorySegment = safeText(segments[rootIndex + 1]);
  if (!categorySegment) return null;

  const normalizedCategory = categorySegment.toLowerCase();
  return documentCategoryOptions.find((option) => (
    option.value.toLowerCase() === normalizedCategory ||
    option.label.toLowerCase() === normalizedCategory
  )) || null;
}

function buildDocumentHistory(documents: DocumentRecord[], driveFiles: DriveFolderFile[]) {
  const knownDriveFileIds = new Set(
    documents
      .map((document) => safeText(document.drive_file_id))
      .filter(Boolean)
  );

  const historyRows: DocumentHistoryRow[] = documents.map((document) => ({
    id: safeText(document.document_id) || `doc-${safeText(document.drive_file_id)}`,
    title: safeText(document.title) || safeText(document.file_name) || "เอกสารไซต์",
    category: getCategoryLabel(safeText(document.category)),
    versionLabel: `v${safeText(document.version_number) || "1"}`,
    date: safeText(document.created_at || document.updated_at).slice(0, 10) || "-",
    driveUrl: safeText(document.drive_url),
    sourceLabel: "Version History",
  }));

  driveFiles.forEach((file) => {
    if (!file.id || !isPdfDriveFile(file) || knownDriveFileIds.has(file.id)) return;
    const category = getProjectDocumentDriveCategory(file);
    if (!category) return;

    historyRows.push({
      id: `drive-${file.id}`,
      title: file.name || "PDF ใน Drive",
      category: category.label,
      versionLabel: "Drive",
      date: safeText(file.modifiedTime || file.createdTime).slice(0, 10) || "-",
      driveUrl: getDriveOpenUrl(file),
      sourceLabel: "Drive file",
    });
  });

  return historyRows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

function getStatusDestination(status: string, projectId: string): StatusDestination {
  const siteBase = `/dashboard/sites/${encodeURIComponent(projectId)}`;
  const destinations: Record<string, StatusDestination> = {
    design: {
      kind: "tab",
      tab: "lifecycle",
      label: "กรอกวันออกแบบ",
      description: "บันทึกวันเริ่มและวันออกแบบเสร็จในรายละเอียดงาน",
    },
    contract: {
      kind: "tab",
      tab: "documents",
      label: "ไปที่เอกสารสัญญา",
      description: "แนบสัญญาและเก็บ version history ของไฟล์ PDF",
    },
    construction_drawing: {
      kind: "tab",
      tab: "documents",
      label: "แนบแบบก่อสร้าง",
      description: "อัปโหลดแบบก่อสร้างและดูประวัติเอกสาร",
    },
    permit_submitted: {
      kind: "tab",
      tab: "documents",
      label: "ไปที่เอกสารใบอนุญาต",
      description: "แนบเอกสารยื่นขออนุญาตและติดตามกำหนด 45 วัน",
    },
    permit_issued: {
      kind: "tab",
      tab: "documents",
      label: "แนบใบอนุญาต",
      description: "เก็บใบอนุญาตก่อสร้างและวันหมดอายุ",
    },
    temporary_electric: {
      kind: "tab",
      tab: "lifecycle",
      label: "กรอกวันไฟฟ้าชั่วคราว",
      description: "บันทึกวันติดตั้งและวันหมดอายุเพื่อสร้างแจ้งเตือน",
    },
    temporary_water: {
      kind: "tab",
      tab: "lifecycle",
      label: "กรอกวันประปาชั่วคราว",
      description: "บันทึกวันติดตั้งและวันหมดอายุเพื่อสร้างแจ้งเตือน",
    },
    waiting_demolition: {
      kind: "href",
      href: `${siteBase}/schedule`,
      label: "ไปที่แผนงานรื้อถอน",
      description: "เปิดหน้าแผนงานเพื่อจัดลำดับงานรื้อถอน",
    },
    demolition_done: {
      kind: "href",
      href: `${siteBase}/schedule`,
      label: "ไปที่แผนงานก่อสร้าง",
      description: "ตรวจงานถัดไปหลังรื้อถอนเสร็จ",
    },
    construction: {
      kind: "href",
      href: `${siteBase}/schedule`,
      label: "ไปที่แผนงานก่อสร้าง",
      description: "ติดตามแผนงานและงานที่กำลังดำเนินการ",
    },
    handover: {
      kind: "tab",
      tab: "warranty",
      label: "ไปที่ประกันผลงาน",
      description: "บันทึกวันส่งมอบและคำนวณวันหมดประกัน",
    },
  };

  return destinations[status] || destinations.design;
}

const dateGroups = [
  {
    title: "ออกแบบ",
    fields: [
      ["design_start_date", "วันที่เริ่มออกแบบ"],
      ["design_done_date", "วันที่ออกแบบเสร็จ"],
    ],
  },
  { title: "เซ็นสัญญา", fields: [["contract_signed_date", "วันที่เซ็นสัญญา"]] },
  {
    title: "เขียนแบบก่อสร้าง",
    fields: [
      ["drawing_start_date", "วันที่เขียนแบบ"],
      ["drawing_done_date", "วันที่แบบเสร็จ"],
    ],
  },
  { title: "ยื่นขออนุญาตก่อสร้าง", fields: [["permit_submitted_date", "วันที่ยื่น (เตือนใกล้ครบ 45 วัน)"]] },
  {
    title: "ใบอนุญาตก่อสร้าง",
    fields: [
      ["permit_received_date", "วันที่ได้รับ"],
      ["permit_expiry_date", "วันที่หมดอายุ (เตือนล่วงหน้า 30 วัน)"],
    ],
  },
  {
    title: "ไฟฟ้าชั่วคราว",
    fields: [
      ["temporary_electric_install_date", "วันที่ติดตั้ง"],
      ["temporary_electric_expiry_date", "วันที่หมดอายุ (เตือนล่วงหน้า 30 วัน)"],
    ],
  },
  {
    title: "ประปาชั่วคราว",
    fields: [
      ["temporary_water_install_date", "วันที่ได้รับติดตั้ง"],
      ["temporary_water_expiry_date", "วันที่หมดอายุ (เตือนล่วงหน้า 30 วัน)"],
    ],
  },
  {
    title: "รื้อถอน / ก่อสร้าง",
    fields: [
      ["demolition_waiting_date", "วันที่รอรื้อถอน"],
      ["demolition_done_date", "วันที่รื้อถอนเสร็จ"],
      ["construction_start_date", "วันที่เริ่มก่อสร้าง"],
      ["construction_end_date", "วันที่สิ้นสุดก่อสร้าง (เตือนล่วงหน้า 15 วัน)"],
    ],
  },
];

export default function LifecycleWorkspace({
  projectId,
  isAdmin,
  projectMeta,
}: {
  projectId: string;
  isAdmin: boolean;
  projectMeta: ProjectMeta;
}) {
  const lifecycleKey = `/api/sites/${encodeURIComponent(projectId)}/lifecycle`;
  const warrantyKey = `/api/sites/${encodeURIComponent(projectId)}/warranty`;
  const documentsKey = `/api/sites/${encodeURIComponent(projectId)}/documents`;
  const driveFilesKey = `/api/sites/${encodeURIComponent(projectId)}/drive-files`;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("lifecycle");
  const [lifecycleForm, setLifecycleForm] = useState<LifecycleForm>(emptyLifecycle);
  const [warrantyForm, setWarrantyForm] = useState(emptyWarranty);
  const [documentForm, setDocumentForm] = useState({ category: "contract", title: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const {
    mutate: mutateLifecycle,
  } = useSWR<ApiResponse<Record<string, string> | null>>(lifecycleKey, fetcher, {
    onSuccess(result) {
      if (result.data) setLifecycleForm(normalizeDateFields({ ...emptyLifecycle, ...result.data }, lifecycleDateFields));
    },
  });
  const {
    mutate: mutateWarranty,
  } = useSWR<ApiResponse<Record<string, string> | null>>(activeTab === "warranty" ? warrantyKey : null, fetcher, {
    onSuccess(result) {
      if (result.data) setWarrantyForm(normalizeDateFields({ ...emptyWarranty, ...result.data }, warrantyDateFields));
    },
  });
  const {
    data: documentsData,
    mutate: mutateDocuments,
  } = useSWR<ApiResponse<DocumentRecord[]>>(activeTab === "documents" ? documentsKey : null, fetcher);
  const {
    data: driveFilesData,
    isLoading: driveFilesLoading,
    mutate: mutateDriveFiles,
  } = useSWR<ApiResponse<DriveFolderFile[]>>(activeTab === "documents" ? driveFilesKey : null, fetcher);

  const documents = useMemo(() => documentsData?.data || [], [documentsData?.data]);
  const documentHistory = useMemo(
    () => buildDocumentHistory(documents, driveFilesData?.data || []),
    [documents, driveFilesData?.data]
  );
  const filledLifecycleDates = lifecycleDateFields.filter((field) => Boolean(lifecycleForm[field])).length;
  const filledWarrantyDates = warrantyDateFields.filter((field) => Boolean(warrantyForm[field as keyof typeof emptyWarranty])).length;
  const tabs: { id: WorkspaceTab; label: string; description: string; meta: string }[] = [
    { id: "lifecycle", label: "รายละเอียดงาน", description: "สถานะและวันสำคัญ", meta: `${filledLifecycleDates}/${lifecycleDateFields.length}` },
    { id: "documents", label: "เอกสาร", description: "PDF และ version history", meta: `${documentHistory.length} ไฟล์` },
    { id: "warranty", label: "ประกันผลงาน", description: "วันส่งมอบและวันหมดอายุ", meta: `${filledWarrantyDates}/${warrantyDateFields.length}` },
  ];
  const currentStatusLabel = lifecycleStatusOptions.find((option) => option.value === lifecycleForm.current_status)?.label || lifecycleForm.current_status;
  const currentStatusDestination = getStatusDestination(lifecycleForm.current_status, projectId);

  const saveJson = async (key: string, body: Record<string, string>, next: () => Promise<unknown>, successMessage: string) => {
    if (!isAdmin) return;
    setLoading(key);
    setMessage(null);
    try {
      const res = await fetch(key === "lifecycle" ? lifecycleKey : warrantyKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "บันทึกข้อมูลไม่สำเร็จ");
      await next();
      setMessage(successMessage);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setLoading("");
    }
  };

  const openSelectedDocumentFolder = async () => {
    if (!projectMeta.driveFolderId) return;
    setLoading("document_folder");
    setMessage(null);
    try {
      const res = await fetch(documentsKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open_category_folder",
          category: documentForm.category,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.error) throw new Error(result.error || "เปิดโฟลเดอร์เอกสารไม่สำเร็จ");
      const folderUrl = String(result.data?.folder_url || "");
      if (!folderUrl) throw new Error("ไม่พบลิงก์โฟลเดอร์เอกสาร");
      window.location.href = folderUrl;
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "เปิดโฟลเดอร์เอกสารไม่สำเร็จ");
    } finally {
      setLoading("");
    }
  };

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || !file) return;
    setLoading("document");
    setMessage("กำลังส่งไฟล์ตรงไป Google Drive...");
    try {
      const uploadedDocument = await uploadProjectDocumentDirectly({
        endpoint: documentsKey,
        category: documentForm.category,
        title: documentForm.title || file.name,
        notes: documentForm.notes,
        file,
      }) as DocumentRecord | undefined;
      setDocumentForm({ category: "contract", title: "", notes: "" });
      setFile(null);
      if (uploadedDocument) {
        void mutateDocuments((current) => ({
          success: true,
          data: [uploadedDocument, ...(current?.data || [])],
        }), { revalidate: false });
      }
      void mutateDocuments().catch((error: unknown) => {
        console.warn("Document list refresh failed after upload:", error);
      });
      void mutateDriveFiles().catch((error: unknown) => {
        console.warn("Drive file list refresh failed after upload:", error);
      });
      setMessage("อัปโหลดเข้า Drive และบันทึก version history แล้ว");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setLoading("");
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
          ข้อมูลหน้านี้ให้ Admin เท่านั้นที่บันทึก/อัปโหลด/แก้ไขได้
        </div>
      )}

      {message && (
        <div className="sticky top-20 z-20 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm font-semibold text-orange-700 shadow-sm">
          {message}
        </div>
      )}

      <nav className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              activeTab === tab.id
                ? "border-orange-200 bg-orange-50 text-orange-700 shadow-sm"
                : "border-gray-200 bg-white text-gray-600 hover:border-orange-100 hover:bg-orange-50/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-extrabold">{tab.label}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${activeTab === tab.id ? "bg-white text-orange-700" : "bg-gray-100 text-gray-500"}`}>
                {tab.meta}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold opacity-75">{tab.description}</p>
          </button>
        ))}
      </nav>

      {activeTab === "lifecycle" && (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">รายละเอียดงาน</h3>
            <p className="text-sm text-gray-500">วันที่ในหัวข้อที่มีข้อความเตือนจะถูกนำไปสร้างแจ้งเตือนในกระดิ่ง</p>
          </div>
          <button
            type="button"
            disabled={!isAdmin || loading === "lifecycle"}
            onClick={() => saveJson("lifecycle", lifecycleForm, mutateLifecycle, "บันทึกรายละเอียดงานแล้ว")}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 font-bold text-white transition hover:bg-orange-700 disabled:bg-gray-300"
          >
            {loading === "lifecycle" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            บันทึก
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Field label="สถานะปัจจุบัน">
            <select
              value={lifecycleForm.current_status}
              disabled={!isAdmin}
              onChange={(event) => setLifecycleForm((current) => ({ ...current, current_status: event.target.value }))}
              className="form-input bg-white"
            >
              {lifecycleStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <div className="lg:col-span-2">
            <Field label="หมายเหตุรายละเอียดงาน">
              <textarea
                value={lifecycleForm.notes}
                disabled={!isAdmin}
                onChange={(event) => setLifecycleForm((current) => ({ ...current, notes: event.target.value }))}
                className="form-input min-h-20 resize-y"
              />
            </Field>
          </div>
        </div>

        <StatusDestinationCard
          statusLabel={currentStatusLabel}
          destination={currentStatusDestination}
          onTabClick={setActiveTab}
        />

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {dateGroups.map((group) => (
            <div key={group.title} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <h4 className="mb-3 font-bold text-gray-900">{group.title}</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.fields.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="date"
                      value={lifecycleForm[key] || ""}
                      disabled={!isAdmin}
                      onChange={(event) => setLifecycleForm((current) => ({ ...current, [key]: event.target.value }))}
                      className="form-input bg-white"
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {activeTab === "documents" && (
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={uploadDocument} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-xl font-extrabold text-gray-900">เอกสารโครงการ</h3>
            <p className="text-sm text-gray-500">อัปโหลด PDF หลายไฟล์ พร้อมเก็บ version history ตามหมวดและชื่อเอกสาร</p>
          </div>
          <div className="space-y-4">
            <Field label="หมวดเอกสาร">
              <select
                value={documentForm.category}
                disabled={!isAdmin}
                onChange={(event) => setDocumentForm((current) => ({ ...current, category: event.target.value }))}
                className="form-input bg-white"
              >
                {documentCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="ชื่อเอกสาร">
              <input
                value={documentForm.title}
                disabled={!isAdmin}
                onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))}
                className="form-input"
                placeholder="เช่น สัญญาหลัก, แบบก่อสร้าง"
              />
            </Field>
            <Field label="ไฟล์ PDF">
              <div className="space-y-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                <label className={`attach-file-button ${!isAdmin ? "attach-file-button-disabled" : ""}`}>
                  <input
                    key={file ? "pdf-selected" : "pdf-empty"}
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={!isAdmin}
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    className="sr-only"
                  />
                  <FileUp />
                  {file ? "เปลี่ยนไฟล์ PDF" : "แนบไฟล์ PDF"}
                </label>
                {file && (
                  <div className="rounded-lg border border-orange-100 bg-white px-3 py-2">
                    <p className="truncate text-sm font-extrabold text-gray-800">{file.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-orange-600">เลือกไฟล์แล้ว แต่ยังไม่ได้อัปโหลด กดปุ่มด้านล่างเพื่อส่งตรงเข้า Drive และบันทึก Version History</p>
                  </div>
                )}
                {!file && (
                  <p className="text-xs font-semibold text-gray-500">การเลือกไฟล์ยังไม่ใช่การบันทึก ระบบจะส่งไฟล์ตรงไป Google Drive เมื่อกด “อัปโหลด PDF”</p>
                )}
              </div>
            </Field>
            <Field label="หมายเหตุ version">
              <textarea
                value={documentForm.notes}
                disabled={!isAdmin}
                onChange={(event) => setDocumentForm((current) => ({ ...current, notes: event.target.value }))}
                className="form-input min-h-20 resize-y"
              />
            </Field>
            <button disabled={!isAdmin || !file || loading === "document" || !projectMeta.driveFolderId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 font-bold text-white transition hover:bg-orange-700 disabled:bg-gray-300">
              {loading === "document" ? <Loader2 size={17} className="animate-spin" /> : <FileUp size={17} />}
              {projectMeta.driveFolderId ? "อัปโหลดตรงไป Drive และบันทึก PDF" : "ต้องตั้งค่า Drive Folder ก่อน"}
            </button>
            {projectMeta.driveFolderId ? (
              <button
                type="button"
                onClick={openSelectedDocumentFolder}
                disabled={loading === "document_folder"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
              >
                {loading === "document_folder" ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
                เปิดโฟลเดอร์หมวดนี้ใน Drive <ExternalLink size={16} />
              </button>
            ) : null}
          </div>
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-extrabold text-gray-900">Version History</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-950 text-white">
                <tr>
                  <th className="px-4 py-3">เอกสาร</th>
                  <th className="px-4 py-3">หมวด</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">ไฟล์</th>
                </tr>
              </thead>
              <tbody>
                {driveFilesLoading && documentHistory.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">กำลังโหลดเอกสาร...</td></tr>
                ) : documentHistory.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">ยังไม่มีเอกสาร</td></tr>
                ) : (
                  documentHistory.map((document) => (
                    <tr key={document.id} className="border-b border-gray-100">
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900">{document.title || "-"}</div>
                        <div className="mt-0.5 text-xs font-semibold text-gray-400">{document.sourceLabel}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{document.category}</td>
                      <td className="px-4 py-3 text-gray-600">{document.versionLabel}</td>
                      <td className="px-4 py-3 text-gray-500">{document.date}</td>
                      <td className="px-4 py-3">
                        {document.driveUrl ? (
                          <a href={document.driveUrl} target="_blank" rel="noreferrer" className="font-bold text-orange-600 hover:text-orange-700">
                            เปิดไฟล์
                          </a>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {activeTab === "warranty" && (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">ประกันผลงาน</h3>
            <p className="text-sm text-gray-500">วันส่งมอบจะช่วยคำนวณวันหมดอายุ 20 ปี / 5 ปี / 1 ปีให้อัตโนมัติ</p>
          </div>
          <button
            type="button"
            disabled={!isAdmin || loading === "warranty"}
            onClick={() => saveJson("warranty", warrantyForm, mutateWarranty, "บันทึกประกันผลงานแล้ว")}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 font-bold text-white transition hover:bg-orange-700 disabled:bg-gray-300"
          >
            {loading === "warranty" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            บันทึก
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="ส่งมอบบ้าน วันที่">
            <input
              type="date"
              value={warrantyForm.handover_date}
              disabled={!isAdmin}
              onChange={(event) => setWarrantyForm((current) => ({ ...current, handover_date: event.target.value }))}
              className="form-input bg-white"
            />
          </Field>
          <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 md:col-span-2">
            <Bell size={17} />
            ประกันโครงสร้างเตือนล่วงหน้า 90 วัน, หลังคา 60 วัน, สถาปัตย์ 30 วัน
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <WarrantyCard
            title="รับประกันโครงสร้างหลัก 20 ปี"
            retentionKey="structure_retention_date"
            expiryKey="structure_expiry_date"
            notesKey="structure_notes"
            form={warrantyForm}
            setForm={setWarrantyForm}
            disabled={!isAdmin}
          />
          <WarrantyCard
            title="รับประกันหลังคาและการรั่วซึม 5 ปี"
            retentionKey="roof_retention_date"
            expiryKey="roof_expiry_date"
            notesKey="roof_notes"
            form={warrantyForm}
            setForm={setWarrantyForm}
            disabled={!isAdmin}
          />
          <WarrantyCard
            title="รับประกันงานสถาปัตยกรรม 1 ปี"
            retentionKey="architecture_retention_date"
            expiryKey="architecture_expiry_date"
            notesKey="architecture_notes"
            form={warrantyForm}
            setForm={setWarrantyForm}
            disabled={!isAdmin}
          />
        </div>
      </section>
      )}
    </div>
  );
}

function getCategoryLabel(value: string) {
  return documentCategoryOptions.find((option) => option.value === value)?.label || value || "-";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function StatusDestinationCard({
  statusLabel,
  destination,
  onTabClick,
}: {
  statusLabel: string;
  destination: StatusDestination;
  onTabClick: Dispatch<SetStateAction<WorkspaceTab>>;
}) {
  const actionClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-orange-700";

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-orange-100 bg-orange-50/70 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase text-orange-600">ทางไปทำงานต่อจากสถานะนี้</p>
        <h4 className="mt-1 text-base font-extrabold text-gray-950">{statusLabel}</h4>
        <p className="mt-1 text-sm font-semibold text-gray-600">{destination.description}</p>
      </div>
      {destination.kind === "href" ? (
        <Link href={destination.href} className={actionClass}>
          {destination.label}
          <ArrowRight size={16} />
        </Link>
      ) : (
        <button type="button" onClick={() => onTabClick(destination.tab)} className={actionClass}>
          {destination.label}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

function WarrantyCard({
  title,
  retentionKey,
  expiryKey,
  notesKey,
  form,
  setForm,
  disabled,
}: {
  title: string;
  retentionKey: keyof typeof emptyWarranty;
  expiryKey: keyof typeof emptyWarranty;
  notesKey: keyof typeof emptyWarranty;
  form: typeof emptyWarranty;
  setForm: Dispatch<SetStateAction<typeof emptyWarranty>>;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h4 className="font-bold text-gray-900">{title}</h4>
      <div className="mt-4 space-y-3">
        <Field label="เก็บประกัน วันที่">
          <input
            type="date"
            value={form[retentionKey]}
            disabled={disabled}
            onChange={(event) => setForm((current) => ({ ...current, [retentionKey]: event.target.value }))}
            className="form-input bg-white"
          />
        </Field>
        <Field label="วันหมดอายุ">
          <input
            type="date"
            value={form[expiryKey]}
            disabled={disabled}
            onChange={(event) => setForm((current) => ({ ...current, [expiryKey]: event.target.value }))}
            className="form-input bg-white"
          />
        </Field>
        <Field label="หมายเหตุ">
          <textarea
            value={form[notesKey]}
            disabled={disabled}
            onChange={(event) => setForm((current) => ({ ...current, [notesKey]: event.target.value }))}
            className="form-input min-h-28 resize-y bg-white"
            placeholder="เช่น ครั้งที่ 1 ลูกค้าแจ้งหลังคารั่ว วันที่ xx/xx/xx"
          />
        </Field>
      </div>
    </div>
  );
}
