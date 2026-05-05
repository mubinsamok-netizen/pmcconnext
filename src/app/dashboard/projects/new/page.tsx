"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MapPin,
  Save,
  Server,
  Users,
  X,
} from "lucide-react";
import { isForemanRole } from "@/lib/siteAccess";

type ProjectForm = {
  project_id: string;
  name: string;
  client: string;
  project_type: string;
  description: string;
  address: string;
  province: string;
  district: string;
  start_date: string;
  end_date: string;
  budget: string;
  contract_no: string;
  site_link: string;
  pm_name: string;
  se_name: string;
  status: string;
  site_sheet_id: string;
  drive_folder_id: string;
  sales_customer_id: string;
  sales_stage: string;
  deposit_status: string;
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
  budget: "",
  contract_no: "",
  site_link: "",
  pm_name: "",
  se_name: "",
  status: "Planning",
  site_sheet_id: "",
  drive_folder_id: "",
  sales_customer_id: "",
  sales_stage: "deposited",
  deposit_status: "deposit_paid",
};

const steps = [
  "ข้อมูลโครงการ",
  "สถานที่ & แผนงาน",
  "ทีมงาน & ระบบข้อมูล",
];

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "ไม่สามารถสร้างไซต์งานได้";
  if (message.includes("Service Account") || message.includes("Service Accounts")) {
    return "บัญชี Google Drive ของคุณไม่ได้เต็ม แต่ระบบกำลังอัปโหลดรูปผ่าน Service Account ซึ่งไม่มีพื้นที่เก็บไฟล์รูปภาพโดยตรง ต้องใช้ Shared Drive หรือเปลี่ยนระบบอัปโหลดเป็น OAuth ของผู้ใช้";
  }
  if (message.toLowerCase().includes("storage quota") || message.includes("พื้นที่ Google Drive")) {
    return "พื้นที่ Google Drive ของบัญชีระบบเต็มแล้ว กรุณาลบไฟล์/เพิ่มพื้นที่ หรือใส่ Google Sheet ID และ Google Drive Folder ID ที่มีอยู่แล้ว";
  }
  if (message.includes("without cover upload") || message.includes("Drive folder is not available")) {
    return "บันทึกข้อมูลโครงการแล้ว แต่ยังอัปโหลดรูปปกไม่ได้ เพราะระบบไม่พบ/ใช้ Google Drive Folder ของไซต์งานไม่ได้";
  }
  return message;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ProjectForm>(() => {
    const salesCustomerId = searchParams.get("sales_customer_id");
    if (!salesCustomerId) return emptyForm;

    return {
      ...emptyForm,
      client: searchParams.get("client") || emptyForm.client,
      description: searchParams.get("description") || emptyForm.description,
      address: searchParams.get("address") || emptyForm.address,
      sales_customer_id: salesCustomerId,
      sales_stage: "deposited",
      deposit_status: searchParams.get("deposit_status") || "deposit_paid",
    };
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isForeman = isForemanRole(session?.user?.role);

  useEffect(() => {
    if (isForeman) {
      router.replace("/dashboard/projects");
    }
  }, [isForeman, router]);

  const update = (field: keyof ProjectForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const canContinue = useMemo(() => {
    if (step === 1) return Boolean(form.project_id.trim() && form.name.trim());
    if (step === 2) return Boolean(form.address.trim() || form.province.trim() || form.start_date);
    return true;
  }, [form.address, form.name, form.project_id, form.province, form.start_date, step]);

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
        method: "POST",
        body: formData,
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.error || "Failed to create project");
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/projects" className="p-2 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">สร้างโครงการใหม่</h2>
          <p className="text-gray-500">บันทึกรายละเอียดลง Master Sheet และผูก Google Sheet / Drive ของไซต์</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center">
              <Building2 size={22} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Create New Construction Project</h3>
              <p className="text-sm text-gray-500">ใช้สำหรับโครงการที่พร้อมเปิดงาน หรือมาจาก Sales CRM หลังวางมัดจำ</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            {steps.map((label, index) => {
              const number = index + 1;
              const active = step >= number;
              return (
                <div key={label} className="flex items-center gap-3 flex-1">
                  <button
                    type="button"
                    onClick={() => setStep(number)}
                    className={`w-9 h-9 rounded-full text-sm font-bold transition ${active ? "bg-orange-600 text-white shadow-sm" : "bg-gray-50 text-gray-400 border border-gray-200"}`}
                  >
                    {number}
                  </button>
                  <span className={`hidden sm:inline text-sm font-semibold ${active ? "text-orange-600" : "text-gray-400"}`}>{label}</span>
                  {number < steps.length && <div className={`h-px flex-1 ${step > number ? "bg-orange-300" : "bg-gray-200"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <Field label="ภาพปกโครงการ (Project Cover)">
                  <label className="relative flex h-44 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden hover:border-orange-300 hover:bg-orange-50/40 transition">
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
                        <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-white text-gray-400 border border-gray-200 flex items-center justify-center">
                          <ImagePlus size={24} />
                        </div>
                        <span className="attach-file-button">
                          <ImagePlus />
                          แนบรูป
                        </span>
                        <p className="text-sm text-gray-400">PNG/JPG ขนาดไม่เกิน 5MB</p>
                      </div>
                    )}
                  </label>
                </Field>

                <Field label="ชื่อโครงการ *">
                  <input value={form.name} onChange={(event) => update("name", event.target.value)} required className="form-input" placeholder="เช่น บ้านเดี่ยว Phase 2" />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="ประเภทโครงการ">
                    <select value={form.project_type} onChange={(event) => update("project_type", event.target.value)} className="form-input bg-white">
                      <option value="">เลือกประเภท</option>
                      <option value="residential">ที่อยู่อาศัย</option>
                      <option value="commercial">อาคารพาณิชย์</option>
                      <option value="industrial">โรงงาน / คลังสินค้า</option>
                      <option value="renovation">ปรับปรุง / ต่อเติม</option>
                    </select>
                  </Field>
                  <Field label="รหัสโครงการ *">
                    <input value={form.project_id} onChange={(event) => update("project_id", event.target.value)} required className="form-input" placeholder="เช่น PCM-2026-001" />
                  </Field>
                </div>

                <Field label="ลูกค้า / เจ้าของโครงการ">
                  <input value={form.client} onChange={(event) => update("client", event.target.value)} className="form-input" placeholder="ชื่อบริษัทหรือบุคคล" />
                </Field>

                <Field label="รายละเอียดโครงการ">
                  <textarea value={form.description} onChange={(event) => update("description", event.target.value)} className="form-input min-h-24 resize-y" placeholder="อธิบายรายละเอียดเพิ่มเติมของโครงการ" />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <Field label="ที่ตั้งโครงการ">
                  <input value={form.address} onChange={(event) => update("address", event.target.value)} className="form-input" placeholder="เลขที่ ถนน ตำบล/แขวง" />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="จังหวัด">
                    <input value={form.province} onChange={(event) => update("province", event.target.value)} className="form-input" placeholder="เช่น สมุทรปราการ" />
                  </Field>
                  <Field label="เขต / อำเภอ">
                    <input value={form.district} onChange={(event) => update("district", event.target.value)} className="form-input" placeholder="เช่น เมืองสมุทรปราการ" />
                  </Field>
                  <Field label="วันเริ่มโครงการ">
                    <input value={form.start_date} onChange={(event) => update("start_date", event.target.value)} type="date" className="form-input" />
                  </Field>
                  <Field label="วันสิ้นสุดโครงการ (ตามแผน)">
                    <input value={form.end_date} onChange={(event) => update("end_date", event.target.value)} type="date" className="form-input" />
                  </Field>
                  <Field label="มูลค่าสัญญา (บาท)">
                    <input value={form.budget} onChange={(event) => update("budget", event.target.value)} type="number" className="form-input" placeholder="0" />
                  </Field>
                  <Field label="เลขที่สัญญา">
                    <input value={form.contract_no} onChange={(event) => update("contract_no", event.target.value)} className="form-input" placeholder="เช่น PCM-HW-2026" />
                  </Field>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <Field label="Site Location (ลิงก์ Google Maps)">
                  <input value={form.site_link} onChange={(event) => update("site_link", event.target.value)} type="url" className="form-input" placeholder="วางลิงก์ Google Maps ที่นี่" />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TeamField iconTone="orange" label="ผู้จัดการโครงการ (PM)" value={form.pm_name} onChange={(value) => update("pm_name", value)} />
                  <TeamField iconTone="blue" label="วิศวกรสนาม (SE)" value={form.se_name} onChange={(value) => update("se_name", value)} />
                </div>

                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 space-y-4">
                  <div className="flex items-center gap-2 font-bold text-gray-900">
                    <Server size={18} className="text-orange-600" />
                    Google Sheet & Drive ของไซต์
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Google Sheet ID">
                      <input value={form.site_sheet_id} onChange={(event) => update("site_sheet_id", event.target.value)} className="form-input bg-white" placeholder="เว้นว่างเพื่อให้ระบบสร้างให้" />
                    </Field>
                    <Field label="Google Drive Folder ID">
                      <input value={form.drive_folder_id} onChange={(event) => update("drive_folder_id", event.target.value)} className="form-input bg-white" placeholder="เว้นว่างเพื่อให้ระบบสร้างให้" />
                    </Field>
                  </div>
                  <p className="text-xs text-gray-500">
                    ถ้าเจอข้อความพื้นที่ Drive เต็ม ให้สร้าง Google Sheet/Drive folder เองในบัญชี Admin แล้วนำ ID มาใส่ตรงนี้ก่อนบันทึก
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="สถานะโครงการเริ่มต้น">
                    <select value={form.status} onChange={(event) => update("status", event.target.value)} className="form-input bg-white">
                      <option value="Planning">กำลังวางแผน (Planning)</option>
                      <option value="In Progress">กำลังดำเนินงาน</option>
                    </select>
                  </Field>
                  <Field label="สถานะจาก Sales CRM">
                    <select value={form.deposit_status} onChange={(event) => update("deposit_status", event.target.value)} className="form-input bg-white">
                      <option value="deposit_paid">วางมัดจำแล้ว</option>
                      <option value="manual">สร้างโดย Admin</option>
                    </select>
                  </Field>
                </div>

                <div className="rounded-2xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-500 mb-3">ตัวอย่าง (Preview)</p>
                  <h3 className="text-xl font-extrabold text-gray-900">{form.name || "ชื่อโครงการ"}</h3>
                  <p className="mt-2 text-sm text-gray-500 flex items-center gap-1">
                    <MapPin size={14} />
                    {form.address || form.province || "ที่ตั้งโครงการ"}
                  </p>
                  <span className="mt-4 inline-flex rounded-lg bg-orange-50 px-3 py-1 text-sm font-bold text-orange-700">
                    {form.status}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep((value) => Math.max(1, value - 1))}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 ${step === 1 ? "invisible" : ""}`}
            >
              <ChevronLeft size={16} />
              ย้อนกลับ
            </button>
            <div className="flex-1" />
            <Link href="/dashboard/projects" className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50">
              ยกเลิก
            </Link>
            {step < 3 ? (
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep((value) => Math.min(3, value + 1))}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-50"
              >
                ถัดไป
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                disabled={loading}
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-70 disabled:cursor-wait"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function TeamField({
  label,
  value,
  onChange,
  iconTone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  iconTone: "orange" | "blue";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconTone === "orange" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
        <Users size={20} />
      </div>
      <label className="flex-1 space-y-1">
        <span className="text-sm font-semibold text-gray-600">{label}</span>
        <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-gray-900 font-bold outline-none" placeholder="ชื่อผู้รับผิดชอบ" />
      </label>
    </div>
  );
}
