"use client";

import { useMemo, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { Bell, FileUp, Loader2, Save } from "lucide-react";
import useSWR from "swr";
import { documentCategoryOptions, lifecycleStatusOptions } from "@/lib/projectLifecycle";
import { fetcher } from "@/lib/fetcher";

type ApiResponse<T> = {
  success: boolean;
  data: T;
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

export default function LifecycleWorkspace({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const lifecycleKey = `/api/sites/${encodeURIComponent(projectId)}/lifecycle`;
  const warrantyKey = `/api/sites/${encodeURIComponent(projectId)}/warranty`;
  const documentsKey = `/api/sites/${encodeURIComponent(projectId)}/documents`;
  const [lifecycleForm, setLifecycleForm] = useState<LifecycleForm>(emptyLifecycle);
  const [warrantyForm, setWarrantyForm] = useState(emptyWarranty);
  const [documentForm, setDocumentForm] = useState({ category: "contract", title: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const { mutate: mutateLifecycle } = useSWR<ApiResponse<Record<string, string> | null>>(lifecycleKey, fetcher, {
    onSuccess(result) {
      if (result.data) setLifecycleForm({ ...emptyLifecycle, ...result.data });
    },
  });
  const { mutate: mutateWarranty } = useSWR<ApiResponse<Record<string, string> | null>>(warrantyKey, fetcher, {
    onSuccess(result) {
      if (result.data) setWarrantyForm({ ...emptyWarranty, ...result.data });
    },
  });
  const { data: documentsData, mutate: mutateDocuments } = useSWR<ApiResponse<DocumentRecord[]>>(documentsKey, fetcher);

  const documents = useMemo(() => documentsData?.data || [], [documentsData?.data]);

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

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || !file) return;
    setLoading("document");
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("category", documentForm.category);
      formData.append("title", documentForm.title || file.name);
      formData.append("notes", documentForm.notes);
      formData.append("file", file);
      const res = await fetch(documentsKey, { method: "POST", body: formData });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "อัปโหลดไฟล์ไม่สำเร็จ");
      setDocumentForm({ category: "contract", title: "", notes: "" });
      setFile(null);
      await mutateDocuments();
      setMessage("อัปโหลดเอกสารและบันทึก version แล้ว");
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
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm font-semibold text-orange-700">
          {message}
        </div>
      )}

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
              <div className="space-y-2">
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
                  <p className="truncate text-sm font-semibold text-gray-600">
                    {file.name}
                  </p>
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
            <button disabled={!isAdmin || !file || loading === "document"} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 font-bold text-white transition hover:bg-orange-700 disabled:bg-gray-300">
              {loading === "document" ? <Loader2 size={17} className="animate-spin" /> : <FileUp size={17} />}
              อัปโหลด PDF
            </button>
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
                {documents.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">ยังไม่มีเอกสาร</td></tr>
                ) : (
                  documents.map((document) => (
                    <tr key={document.document_id} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-bold text-gray-900">{document.title || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{getCategoryLabel(String(document.category || ""))}</td>
                      <td className="px-4 py-3 text-gray-600">v{document.version_number || "1"}</td>
                      <td className="px-4 py-3 text-gray-500">{String(document.created_at || "").slice(0, 10) || "-"}</td>
                      <td className="px-4 py-3">
                        {document.drive_url ? (
                          <a href={String(document.drive_url)} target="_blank" rel="noreferrer" className="font-bold text-orange-600 hover:text-orange-700">
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
