"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, ImagePlus, Loader2, Save, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { isForemanRole } from "@/lib/siteAccess";

type Project = {
  project_id: string;
  name: string;
  client?: string;
  project_type?: string;
  description?: string;
  address?: string;
  province?: string;
  district?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  budget?: string;
  contract_no?: string;
  site_link?: string;
  pm_name?: string;
  se_name?: string;
  cover_file_id?: string;
  cover_url?: string;
  site_sheet_id?: string;
  drive_folder_id?: string;
  sales_customer_id?: string;
  sales_stage?: string;
  deposit_status?: string;
  line_group_id?: string;
  line_group_name?: string;
  line_notify_enabled?: string;
  active?: string;
};

type ProjectsResponse = {
  success: boolean;
  data: Project[];
};

type ProjectForm = Required<Omit<Project, "cover_file_id" | "cover_url">> & {
  cover_file_id: string;
  cover_url: string;
};

const emptyForm: ProjectForm = {
  project_id: "",
  name: "",
  client: "",
  project_type: "",
  description: "",
  address: "",
  province: "",
  district: "",
  start_date: "",
  end_date: "",
  status: "Planning",
  budget: "",
  contract_no: "",
  site_link: "",
  pm_name: "",
  se_name: "",
  cover_file_id: "",
  cover_url: "",
  site_sheet_id: "",
  drive_folder_id: "",
  sales_customer_id: "",
  sales_stage: "",
  deposit_status: "",
  line_group_id: "",
  line_group_name: "",
  line_notify_enabled: "TRUE",
  active: "TRUE",
};

function normalizeStatus(status?: string) {
  if (status === "In Progress" || status === "On Hold" || status === "Completed" || status === "Cancelled") return status;
  return "Planning";
}

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

function normalizeDate(date?: string) {
  return toIsoDate(date);
}

function extractDriveFileId(url?: string) {
  if (!url) return "";
  return url.match(/\/d\/([^/]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1] || "";
}

function getCoverSrc(project: Pick<Project, "cover_file_id" | "cover_url">) {
  const fileId = project.cover_file_id || extractDriveFileId(project.cover_url);
  if (fileId) return `/api/drive/files/${encodeURIComponent(fileId)}`;
  return project.cover_url || "";
}

function toForm(project: Project): ProjectForm {
  return {
    project_id: project.project_id || "",
    name: project.name || "",
    client: project.client || "",
    project_type: project.project_type || "",
    description: project.description || "",
    address: project.address || "",
    province: project.province || "",
    district: project.district || "",
    start_date: normalizeDate(project.start_date),
    end_date: normalizeDate(project.end_date),
    status: normalizeStatus(project.status),
    budget: project.budget || "",
    contract_no: project.contract_no || "",
    site_link: project.site_link || "",
    pm_name: project.pm_name || "",
    se_name: project.se_name || "",
    cover_file_id: project.cover_file_id || "",
    cover_url: project.cover_url || "",
    site_sheet_id: project.site_sheet_id || "",
    drive_folder_id: project.drive_folder_id || "",
    sales_customer_id: project.sales_customer_id || "",
    sales_stage: project.sales_stage || "",
    deposit_status: project.deposit_status || "",
    line_group_id: project.line_group_id || "",
    line_group_name: project.line_group_name || "",
    line_notify_enabled: project.line_notify_enabled || "TRUE",
    active: project.active || "TRUE",
  };
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกข้อมูลไซต์งานได้";
  if (message.includes("Service Account") || message.includes("Service Accounts")) {
    return "บัญชี Google Drive ของคุณไม่ได้เต็ม แต่ระบบกำลังอัปโหลดรูปผ่าน Service Account ซึ่งไม่มีพื้นที่เก็บไฟล์รูปภาพโดยตรง ต้องใช้ Shared Drive หรือเปลี่ยนระบบอัปโหลดเป็น OAuth ของผู้ใช้";
  }
  if (message.toLowerCase().includes("storage quota") || message.includes("พื้นที่ Google Drive")) {
    return "พื้นที่ Google Drive ของบัญชีระบบเต็ม ระบบบันทึกข้อมูลได้ แต่ถ้าอัปโหลดรูปปกไม่สำเร็จให้เคลียร์ Drive หรือเปลี่ยน Folder ID ก่อน";
  }
  if (message.includes("without cover upload") || message.includes("Drive folder is not available")) {
    return "บันทึกข้อมูลโครงการแล้ว แต่ยังอัปโหลดรูปปกไม่ได้ เพราะระบบไม่พบ/ใช้ Google Drive Folder ของไซต์งานไม่ได้";
  }
  return message;
}

export default function EditProjectPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { data, isLoading } = useSWR<ProjectsResponse>("/api/projects", fetcher);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isForeman = isForemanRole(session?.user?.role);

  useEffect(() => {
    if (isForeman) {
      router.replace("/dashboard/projects");
    }
  }, [isForeman, router]);

  const project = useMemo(() => {
    const decodedProjectId = decodeURIComponent(params.projectId);
    return (data?.data || []).find((item) => item.project_id === decodedProjectId);
  }, [data?.data, params.projectId]);

  useEffect(() => {
    if (!project || loadedProjectId === project.project_id) return;
    const nextForm = toForm(project);
    // Sync the editable draft once SWR has loaded the selected project.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(nextForm);
    setCoverPreview(getCoverSrc(project));
    setLoadedProjectId(project.project_id);
  }, [loadedProjectId, project]);

  const update = (field: keyof ProjectForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    return () => {
      if (coverPreview.startsWith("blob:")) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  const clearCover = () => {
    setCoverFile(null);
    setCoverPreview("");
    setForm((current) => ({ ...current, cover_file_id: "", cover_url: "" }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, value));
    if (coverFile) formData.append("cover", coverFile);

    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        body: formData,
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.error || "Failed to update project");
      }

      if (result.warning) {
        setError(getErrorMessage(new Error(result.warning)));
        setLoading(false);
        return;
      }

      router.push("/dashboard/projects");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        <span className="inline-block animate-spin text-xl">↻</span>
        <span className="ml-2">กำลังโหลดข้อมูลไซต์งาน...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/dashboard/projects" className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600">
          <ArrowLeft size={16} />
          กลับไปหน้าไซต์งาน
        </Link>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          ไม่พบไซต์งานนี้ใน Master Sheet
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/projects" className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 transition hover:text-gray-900">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">แก้ไขไซต์งาน</h2>
          <p className="text-gray-500">อัปเดตข้อมูลโครงการใน Master Sheet และผูก Google Sheet / Drive ของไซต์</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        <Field label="ภาพปกโครงการ">
          <label className="relative flex h-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 transition hover:border-orange-300 hover:bg-orange-50/40">
            <input type="file" accept="image/*" className="sr-only" onChange={handleCoverChange} />
            {coverPreview ? (
              <>
                <Image src={coverPreview} alt="Project cover preview" fill unoptimized className="absolute inset-0 object-cover" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    clearCover();
                  }}
                  className="absolute right-3 top-3 rounded-lg bg-white/90 p-2 text-gray-500 hover:text-red-600"
                  aria-label="ลบรูปปก"
                  title="ลบรูปปก"
                >
                  <X size={16} />
                </button>
                <span className="attach-file-button absolute bottom-3 left-3">
                  <ImagePlus />
                  เปลี่ยนรูป
                </span>
              </>
            ) : (
              <div className="space-y-3 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-400">
                  <ImagePlus size={24} />
                </div>
                <span className="attach-file-button">
                  <ImagePlus />
                  แนบรูป
                </span>
                <p className="text-sm text-gray-400">ใช้ Drive Folder ID ด้านล่างสำหรับอัปโหลด</p>
              </div>
            )}
          </label>
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="รหัสโครงการ">
            <input value={form.project_id} readOnly className="form-input bg-gray-50 text-gray-500" />
          </Field>
          <Field label="ชื่อโครงการ">
            <input value={form.name} onChange={(event) => update("name", event.target.value)} required className="form-input" />
          </Field>
          <Field label="ลูกค้า">
            <input value={form.client} onChange={(event) => update("client", event.target.value)} className="form-input" />
          </Field>
          <Field label="ประเภทโครงการ">
            <select value={form.project_type} onChange={(event) => update("project_type", event.target.value)} className="form-input bg-white">
              <option value="">เลือกประเภท</option>
              <option value="residential">ที่อยู่อาศัย</option>
              <option value="commercial">อาคารพาณิชย์</option>
              <option value="industrial">โรงงาน / คลังสินค้า</option>
              <option value="renovation">ปรับปรุง / ต่อเติม</option>
            </select>
          </Field>
        </div>

        <Field label="รายละเอียดโครงการ">
          <textarea
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            className="form-input min-h-24"
            placeholder="รายละเอียดเพิ่มเติมของโครงการ"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ที่ตั้งโครงการ">
            <input value={form.address} onChange={(event) => update("address", event.target.value)} className="form-input" />
          </Field>
          <Field label="จังหวัด">
            <input value={form.province} onChange={(event) => update("province", event.target.value)} className="form-input" />
          </Field>
          <Field label="เขต / อำเภอ">
            <input value={form.district} onChange={(event) => update("district", event.target.value)} className="form-input" />
          </Field>
          <Field label="ลิงก์ Google Maps">
            <input value={form.site_link} onChange={(event) => update("site_link", event.target.value)} type="url" className="form-input" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="วันเริ่มโครงการ">
            <input value={form.start_date} onChange={(event) => update("start_date", event.target.value)} type="date" className="form-input" />
          </Field>
          <Field label="วันสิ้นสุดโครงการ">
            <input value={form.end_date} onChange={(event) => update("end_date", event.target.value)} type="date" className="form-input" />
          </Field>
          <Field label="มูลค่าสัญญา (บาท)">
            <input value={form.budget} onChange={(event) => update("budget", event.target.value)} type="number" className="form-input" />
          </Field>
          <Field label="เลขที่สัญญา">
            <input value={form.contract_no} onChange={(event) => update("contract_no", event.target.value)} className="form-input" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ผู้จัดการโครงการ (PM)">
            <input value={form.pm_name} onChange={(event) => update("pm_name", event.target.value)} className="form-input" />
          </Field>
          <Field label="วิศวกรสนาม (SE)">
            <input value={form.se_name} onChange={(event) => update("se_name", event.target.value)} className="form-input" />
          </Field>
          <Field label="สถานะโครงการ">
            <select value={form.status} onChange={(event) => update("status", event.target.value)} className="form-input bg-white">
              <option value="Planning">Planning</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="สถานะจาก Sales CRM">
            <select value={form.deposit_status} onChange={(event) => update("deposit_status", event.target.value)} className="form-input bg-white">
              <option value="">ยังไม่ระบุ</option>
              <option value="deposit_paid">วางมัดจำแล้ว</option>
              <option value="manual">สร้างโดย Admin</option>
            </select>
          </Field>
        </div>

        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
          <div className="mb-4 font-bold text-gray-900">Google Sheet & Drive ของไซต์</div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Google Sheet ID">
              <input value={form.site_sheet_id} onChange={(event) => update("site_sheet_id", event.target.value)} className="form-input bg-white" />
            </Field>
            <Field label="Google Drive Folder ID">
              <input value={form.drive_folder_id} onChange={(event) => update("drive_folder_id", event.target.value)} className="form-input bg-white" />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
          <div className="mb-4 font-bold text-gray-900">LINE รายงานไซต์งาน</div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="LINE Group ID">
              <input value={form.line_group_id} onChange={(event) => update("line_group_id", event.target.value)} className="form-input bg-white" placeholder="ใช้ค่า .env หากเว้นว่าง" />
            </Field>
            <Field label="ชื่อกลุ่ม LINE">
              <input value={form.line_group_name} onChange={(event) => update("line_group_name", event.target.value)} className="form-input bg-white" />
            </Field>
            <Field label="ส่งรายงานเข้า LINE อัตโนมัติ">
              <select value={form.line_notify_enabled} onChange={(event) => update("line_notify_enabled", event.target.value)} className="form-input bg-white">
                <option value="TRUE">เปิดใช้งาน</option>
                <option value="FALSE">ปิดใช้งาน</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-6">
          <Link href="/dashboard/projects" className="rounded-xl border border-gray-200 bg-white px-5 py-2 font-semibold text-gray-700 hover:bg-gray-50">
            ยกเลิก
          </Link>
          <button
            disabled={loading}
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {loading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>
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
