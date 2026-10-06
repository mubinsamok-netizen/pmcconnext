"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Banknote,
  CalendarDays,
  Database,
  Edit3,
  Eye,
  FileText,
  Layers3,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { fetcher } from "@/lib/fetcher";

type LaborRate = {
  _rowIndex?: number;
  rate_id: string;
  category: string;
  work_name: string;
  description?: string;
  unit: string;
  min_rate?: string;
  standard_rate: string;
  max_rate?: string;
  area?: string;
  price_scope?: string;
  effective_date?: string;
  source?: string;
  notes?: string;
};

type LaborRateForm = Omit<LaborRate, "_rowIndex">;
type ApiResponse = { success: boolean; data: LaborRate[] };

const categories = [
  "งานโครงสร้าง", "งานก่อ–ฉาบ", "งานกระเบื้อง", "งานฝ้า–ผนังเบา", "งานสี",
  "งานไฟฟ้า", "งานประปา–สุขาภิบาล", "งานหลังคา", "งานอะลูมิเนียม–กระจก",
  "งานเหล็ก–สเตนเลส", "งานไม้–เฟอร์นิเจอร์", "งานแอร์", "งานภูมิทัศน์", "งานทำความสะอาด",
];

const units = ["วัน", "คน/วัน", "จุด", "เมตร", "ตร.ม.", "ลบ.ม.", "กก.", "ชุด", "บาน", "งาน"];

const emptyForm: LaborRateForm = {
  rate_id: "",
  category: "",
  work_name: "",
  description: "",
  unit: "",
  min_rate: "",
  standard_rate: "",
  max_rate: "",
  area: "กรุงเทพฯ และปริมณฑล",
  price_scope: "ค่าแรงอย่างเดียว",
  effective_date: "",
  source: "",
  notes: "",
};

function money(value?: string) {
  const amount = Number(value || 0);
  return amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function optionalPrice(value?: string) {
  return Number(value || 0) > 0 ? `฿${money(value)}` : "ยังไม่ระบุ";
}

function priceRange(rate: LaborRate) {
  const minimum = Number(rate.min_rate || 0);
  const maximum = Number(rate.max_rate || 0);
  if (!minimum && !maximum) return "ยังไม่ระบุช่วง";
  if (!minimum) return `ไม่เกิน ฿${money(rate.max_rate)}`;
  if (!maximum) return `เริ่มต้น ฿${money(rate.min_rate)}`;
  return `฿${money(rate.min_rate)} – ฿${money(rate.max_rate)}`;
}

function displayDate(value?: string) {
  if (!value) return "ยังไม่ระบุ";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function LaborRatesPanel() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>("/api/labor-rates", fetcher);
  const rates = useMemo(() => data?.data || [], [data?.data]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [form, setForm] = useState<LaborRateForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<LaborRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!formOpen && !selectedRate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFormOpen(false);
        setSelectedRate(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [formOpen, selectedRate]);

  const categoryOptions = useMemo(() => [...new Set([...categories, ...rates.map((rate) => rate.category).filter(Boolean)])], [rates]);
  const unitOptions = useMemo(() => [...new Set([...units, ...rates.map((rate) => rate.unit).filter(Boolean)])], [rates]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th-TH");
    return rates.filter((rate) => {
      const matchesQuery = !normalized || [rate.work_name, rate.category, rate.description, rate.area, rate.source]
        .some((value) => String(value || "").toLocaleLowerCase("th-TH").includes(normalized));
      return matchesQuery && (categoryFilter === "all" || rate.category === categoryFilter) && (unitFilter === "all" || rate.unit === unitFilter);
    });
  }, [categoryFilter, query, rates, unitFilter]);

  const stats = useMemo(() => ({
    total: rates.length,
    categories: new Set(rates.map((rate) => rate.category).filter(Boolean)).size,
    areas: new Set(rates.map((rate) => rate.area).filter(Boolean)).size,
  }), [rates]);

  const setField = (field: keyof LaborRateForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const openCreate = () => {
    setForm(emptyForm);
    setSelectedRate(null);
    setMessage(null);
    setFormOpen(true);
  };

  const openEdit = (rate: LaborRate) => {
    setForm({
      rate_id: rate.rate_id,
      category: rate.category || "",
      work_name: rate.work_name || "",
      description: rate.description || "",
      unit: rate.unit || "",
      min_rate: rate.min_rate || "",
      standard_rate: rate.standard_rate || "",
      max_rate: rate.max_rate || "",
      area: rate.area || "",
      price_scope: rate.price_scope || "",
      effective_date: rate.effective_date || "",
      source: rate.source || "",
      notes: rate.notes || "",
    });
    setSelectedRate(null);
    setMessage(null);
    setFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/labor-rates", {
        method: form.rate_id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ไม่สามารถบันทึกข้อมูลค่าแรงได้");
      await mutate();
      setFormOpen(false);
      setMessage({ type: "success", text: form.rate_id ? "แก้ไขข้อมูลค่าแรงแล้ว" : "เพิ่มข้อมูลค่าแรงแล้ว" });
    } catch (submitError) {
      setMessage({ type: "error", text: submitError instanceof Error ? submitError.message : "ไม่สามารถบันทึกข้อมูลค่าแรงได้" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rate: LaborRate) => {
    if (!window.confirm(`ลบรายการค่าแรง “${rate.work_name}” ใช่ไหม?`)) return;
    setDeletingId(rate.rate_id);
    setMessage(null);
    try {
      const response = await fetch(`/api/labor-rates?rate_id=${encodeURIComponent(rate.rate_id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ไม่สามารถลบข้อมูลค่าแรงได้");
      await mutate();
      setMessage({ type: "success", text: `ลบรายการ ${rate.work_name} แล้ว` });
    } catch (deleteError) {
      setMessage({ type: "error", text: deleteError instanceof Error ? deleteError.message : "ไม่สามารถลบข้อมูลค่าแรงได้" });
    } finally {
      setDeletingId(null);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setCategoryFilter("all");
    setUnitFilter("all");
  };
  const hasFilters = Boolean(query || categoryFilter !== "all" || unitFilter !== "all");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<Banknote size={20} />} label="รายการค่าแรง" value={stats.total} tone="orange" />
        <SummaryCard icon={<Layers3 size={20} />} label="หมวดงาน" value={stats.categories} tone="blue" />
        <SummaryCard icon={<MapPin size={20} />} label="พื้นที่อ้างอิง" value={stats.areas} tone="green" />
      </div>

      {message && !formOpen && !selectedRate && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message.text}</div>
      )}

      <section className="overflow-hidden rounded-[22px] border border-gray-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
        <div className="border-b border-gray-100 p-4 sm:p-5">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div><div className="flex items-center gap-2"><h3 className="font-extrabold text-gray-900">ราคาค่าแรงมาตรฐาน</h3><span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-extrabold text-orange-700">{filtered.length}</span></div><p className="mt-0.5 text-xs text-gray-400">ราคากลางสำหรับใช้อ้างอิงและประมาณต้นทุน</p></div>
            <div className="flex gap-2">
              {hasFilters && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100"><RotateCcw size={14} />ล้างตัวกรอง</button>}
              <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white shadow-md shadow-orange-200 hover:bg-orange-700"><Plus size={17} />เพิ่มรายการค่าแรง</button>
            </div>
          </div>
          <div className="grid gap-2.5 lg:grid-cols-[minmax(300px,1fr)_230px_170px]">
            <label className="relative"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-10 pr-4 text-sm outline-none focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-50" placeholder="ค้นหารายการงาน หมวดงาน หรือพื้นที่" /></label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="form-input bg-white"><option value="all">ทุกหมวดงาน</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="form-input bg-white"><option value="all">ทุกหน่วย</option>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-gray-100 bg-slate-50/80 text-[11px] font-extrabold tracking-wide text-gray-500"><tr><th className="px-5 py-3.5">รายการงาน</th><th className="px-4 py-3.5">หมวดงาน</th><th className="px-4 py-3.5">หน่วย</th><th className="px-4 py-3.5">ช่วงราคา</th><th className="px-4 py-3.5">ราคากลาง</th><th className="px-4 py-3.5">พื้นที่</th><th className="px-4 py-3.5">เริ่มใช้</th><th className="w-32 px-4 py-3.5 text-center">จัดการ</th></tr></thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filtered.map((rate) => <LaborRateRow key={rate.rate_id} rate={rate} deleting={deletingId === rate.rate_id} onView={() => setSelectedRate(rate)} onEdit={() => openEdit(rate)} onDelete={() => handleDelete(rate)} />)}
              {isLoading && <tr><td colSpan={8}><PanelState icon={<Loader2 size={22} className="animate-spin text-orange-600" />} text="กำลังโหลดข้อมูลค่าแรง..." /></td></tr>}
              {!isLoading && error && <tr><td colSpan={8}><PanelState icon={<X size={22} className="text-red-500" />} text="ไม่สามารถโหลดข้อมูลค่าแรงได้" tone="error" /></td></tr>}
              {!isLoading && !error && filtered.length === 0 && <tr><td colSpan={8}><PanelState icon={<Banknote size={23} />} text={rates.length ? "ไม่พบข้อมูลที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลค่าแรง เริ่มต้นโดยกด “เพิ่มรายการค่าแรง”"} /></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-gray-100 lg:hidden">
          {filtered.map((rate) => (
            <article key={rate.rate_id} className="p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="font-extrabold text-gray-900">{rate.work_name}</div><div className="mt-1 text-xs font-semibold text-blue-600">{rate.category}</div></div><span className="rounded-xl bg-orange-50 px-3 py-1.5 text-sm font-black text-orange-700">฿{money(rate.standard_rate)}<small className="ml-1 font-semibold text-orange-500">/{rate.unit}</small></span></div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 p-3 text-xs text-gray-500"><span>{rate.area || "ทุกพื้นที่"}</span><span>{priceRange(rate)}</span></div>
              <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setSelectedRate(rate)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-bold text-orange-700"><Eye size={14} />รายละเอียด</button><button type="button" onClick={() => openEdit(rate)} className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 text-gray-500" aria-label={`แก้ไข ${rate.work_name}`}><Edit3 size={14} /></button><button type="button" onClick={() => handleDelete(rate)} className="grid h-9 w-9 place-items-center rounded-xl border border-red-100 bg-red-50 text-red-500" aria-label={`ลบ ${rate.work_name}`}>{deletingId === rate.rate_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</button></div>
            </article>
          ))}
          {isLoading && <PanelState icon={<Loader2 size={22} className="animate-spin text-orange-600" />} text="กำลังโหลดข้อมูลค่าแรง..." />}
          {!isLoading && error && <PanelState icon={<X size={22} className="text-red-500" />} text="ไม่สามารถโหลดข้อมูลค่าแรงได้" tone="error" />}
          {!isLoading && !error && filtered.length === 0 && <PanelState icon={<Banknote size={23} />} text={rates.length ? "ไม่พบข้อมูลที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลค่าแรง เริ่มต้นโดยกด “เพิ่มรายการค่าแรง”"} />}
        </div>
        {!isLoading && !error && rates.length > 0 && <div className="flex justify-between border-t border-gray-100 bg-gray-50/50 px-5 py-3 text-xs font-semibold text-gray-400"><span>ข้อมูลทั้งหมด {rates.length} รายการ</span><span>แสดง {filtered.length} รายการ</span></div>}
      </section>

      {selectedRate && <LaborRateDetails rate={selectedRate} onClose={() => setSelectedRate(null)} onEdit={() => openEdit(selectedRate)} />}
      {formOpen && <LaborRateFormDialog form={form} saving={saving} error={message?.type === "error" ? message.text : ""} categoryOptions={categoryOptions} unitOptions={unitOptions} setField={setField} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />}
    </div>
  );
}

function LaborRateRow({ rate, deleting, onView, onEdit, onDelete }: { rate: LaborRate; deleting: boolean; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <tr className="align-middle transition hover:bg-orange-50/40">
      <td className="px-5 py-4"><div className="font-bold text-gray-900">{rate.work_name}</div><div className="mt-1 text-[11px] text-gray-400">{rate.description || rate.rate_id}</div></td>
      <td className="px-4 py-4"><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">{rate.category}</span></td>
      <td className="px-4 py-4 font-semibold text-gray-600">{rate.unit}</td>
      <td className="px-4 py-4 text-xs font-semibold text-gray-500">{priceRange(rate)}</td>
      <td className="px-4 py-4"><div className="font-black text-orange-700">฿{money(rate.standard_rate)}</div><div className="text-[10px] text-gray-400">ต่อ {rate.unit}</div></td>
      <td className="max-w-44 px-4 py-4 text-xs text-gray-600">{rate.area || "ทุกพื้นที่"}</td>
      <td className="px-4 py-4 text-xs text-gray-500">{displayDate(rate.effective_date)}</td>
      <td className="px-4 py-4"><div className="flex justify-center gap-1"><IconButton label={`ดูรายละเอียด ${rate.work_name}`} onClick={onView} icon={<Eye size={16} />} tone="blue" /><IconButton label={`แก้ไข ${rate.work_name}`} onClick={onEdit} icon={<Edit3 size={15} />} tone="orange" /><IconButton label={`ลบ ${rate.work_name}`} onClick={onDelete} icon={deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} tone="red" /></div></td>
    </tr>
  );
}

function LaborRateDetails({ rate, onClose, onEdit }: { rate: LaborRate; onClose: () => void; onEdit: () => void }) {
  return (
    <ModalBackdrop label="ปิดรายละเอียดค่าแรง" onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="labor-rate-detail-title" className="relative my-auto w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="relative isolate overflow-hidden bg-slate-950 p-6 text-white sm:p-7"><span className="absolute -right-14 -top-16 -z-10 h-52 w-52 rounded-full bg-orange-500/30 blur-3xl" /><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange-300"><Database size={12} />Labor Rate</div><h3 id="labor-rate-detail-title" className="mt-3 text-2xl font-black">{rate.work_name}</h3><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="rounded-lg bg-blue-500/15 px-2.5 py-1 font-bold text-blue-200">{rate.category}</span><span>{rate.rate_id}</span></div></div><button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white/70 hover:bg-white/20" aria-label="ปิด"><X size={18} /></button></div><div className="mt-6 flex items-end justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"><div><div className="text-xs font-semibold text-slate-400">ราคากลางอ้างอิง</div><div className="mt-1 text-3xl font-black text-orange-400">฿{money(rate.standard_rate)}</div></div><div className="pb-1 text-sm font-bold text-slate-300">ต่อ {rate.unit}</div></div></div>
        <div className="max-h-[calc(100vh-300px)] space-y-4 overflow-y-auto p-5 sm:p-7">
          <div className="grid gap-3 sm:grid-cols-3"><DetailBox label="ราคาต่ำสุด" value={optionalPrice(rate.min_rate)} /><DetailBox label="ราคากลาง" value={`฿${money(rate.standard_rate)}`} tone="orange" /><DetailBox label="ราคาสูงสุด" value={optionalPrice(rate.max_rate)} /></div>
          <div className="grid overflow-hidden rounded-2xl border border-gray-200 sm:grid-cols-2"><InfoCell icon={<MapPin size={16} />} label="พื้นที่อ้างอิง" value={rate.area || "ทุกพื้นที่"} /><InfoCell icon={<Ruler size={16} />} label="ลักษณะราคา" value={rate.price_scope || "ยังไม่ระบุ"} /><InfoCell icon={<CalendarDays size={16} />} label="วันที่เริ่มใช้" value={displayDate(rate.effective_date)} /><InfoCell icon={<FileText size={16} />} label="แหล่งข้อมูล" value={rate.source || "ยังไม่ระบุ"} /></div>
          <section className="rounded-2xl bg-gray-50 p-4"><div className="text-xs font-extrabold text-gray-700">รายละเอียดขอบเขตงาน</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{rate.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p></section>
          {rate.notes && <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4"><div className="text-xs font-extrabold text-amber-800">หมายเหตุ</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900/70">{rate.notes}</p></section>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600">ปิด</button><button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white"><Edit3 size={15} />แก้ไขข้อมูล</button></div>
      </div>
    </ModalBackdrop>
  );
}

function LaborRateFormDialog({ form, saving, error, categoryOptions, unitOptions, setField, onClose, onSubmit }: { form: LaborRateForm; saving: boolean; error: string; categoryOptions: string[]; unitOptions: string[]; setField: (field: keyof LaborRateForm, value: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <ModalBackdrop label="ปิดแบบฟอร์มค่าแรง" onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="labor-rate-form-title" className="relative my-auto w-full max-w-3xl overflow-hidden rounded-[26px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-600 text-white"><Banknote size={19} /></span><div><h3 id="labor-rate-form-title" className="text-lg font-extrabold text-gray-950">{form.rate_id ? "แก้ไขข้อมูลค่าแรง" : "เพิ่มรายการค่าแรง"}</h3><p className="text-xs text-gray-400">กำหนดราคากลางสำหรับใช้อ้างอิงภายในบริษัท</p></div></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100" aria-label="ปิด"><X size={19} /></button></div>
        <form onSubmit={onSubmit}>
          <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5 sm:p-6">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2"><Field label="หมวดงาน *"><input list="labor-category-options" required value={form.category} onChange={(event) => setField("category", event.target.value)} className="form-input" placeholder="เลือกหรือพิมพ์หมวดงาน" /><datalist id="labor-category-options">{categoryOptions.map((item) => <option key={item} value={item} />)}</datalist></Field><Field label="ชื่อรายการงาน *"><input required value={form.work_name} onChange={(event) => setField("work_name", event.target.value)} className="form-input" placeholder="เช่น ปูกระเบื้องพื้น" /></Field></div>
            <Field label="รายละเอียด / ขอบเขตงาน"><textarea rows={2} value={form.description} onChange={(event) => setField("description", event.target.value)} className="form-input resize-none" placeholder="ระบุสิ่งที่รวมอยู่ในราคานี้" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="หน่วย *"><input list="labor-unit-options" required value={form.unit} onChange={(event) => setField("unit", event.target.value)} className="form-input" placeholder="เช่น ตร.ม." /><datalist id="labor-unit-options">{unitOptions.map((item) => <option key={item} value={item} />)}</datalist></Field><Field label="ลักษณะราคา"><select value={form.price_scope} onChange={(event) => setField("price_scope", event.target.value)} className="form-input bg-white"><option>ค่าแรงอย่างเดียว</option><option>รวมเครื่องมือ</option><option>รวมวัสดุสิ้นเปลือง</option><option>รวมวัสดุและค่าแรง</option></select></Field></div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4"><div className="mb-3 text-xs font-extrabold text-orange-800">ช่วงราคาอ้างอิง (บาท)</div><div className="grid gap-3 sm:grid-cols-3"><Field label="ราคาต่ำสุด"><input min="0" step="0.01" type="number" value={form.min_rate} onChange={(event) => setField("min_rate", event.target.value)} className="form-input bg-white" placeholder="0" /></Field><Field label="ราคากลาง *"><input required min="0.01" step="0.01" type="number" value={form.standard_rate} onChange={(event) => setField("standard_rate", event.target.value)} className="form-input border-orange-200 bg-white" placeholder="0" /></Field><Field label="ราคาสูงสุด"><input min="0" step="0.01" type="number" value={form.max_rate} onChange={(event) => setField("max_rate", event.target.value)} className="form-input bg-white" placeholder="0" /></Field></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="พื้นที่อ้างอิง"><input value={form.area} onChange={(event) => setField("area", event.target.value)} className="form-input" placeholder="เช่น กรุงเทพฯ และปริมณฑล" /></Field><Field label="วันที่เริ่มใช้ราคา"><input type="date" value={form.effective_date} onChange={(event) => setField("effective_date", event.target.value)} className="form-input" /></Field><Field label="แหล่งข้อมูลราคา"><input value={form.source} onChange={(event) => setField("source", event.target.value)} className="form-input" placeholder="เช่น ราคาเฉลี่ยจากผู้รับเหมา 3 ราย" /></Field><Field label="หมายเหตุ"><input value={form.notes} onChange={(event) => setField("notes", event.target.value)} className="form-input" placeholder="เงื่อนไขหรือข้อมูลเพิ่มเติม" /></Field></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:px-6"><button type="button" onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600">ยกเลิก</button><button disabled={saving} type="submit" className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? "กำลังบันทึก" : "บันทึกข้อมูล"}</button></div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

function ModalBackdrop({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6"><button type="button" onClick={onClose} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" aria-label={label} />{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-bold text-gray-700">{label}</span>{children}</label>;
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "orange" | "blue" | "green" }) {
  const colors = { orange: "bg-orange-50 text-orange-600", blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600" };
  return <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span><div><div className="text-2xl font-black text-gray-950">{value}</div><div className="text-xs font-bold text-gray-400">{label}</div></div></div>;
}

function IconButton({ label, onClick, icon, tone }: { label: string; onClick: () => void; icon: React.ReactNode; tone: "blue" | "orange" | "red" }) {
  const colors = { blue: "hover:border-blue-200 hover:text-blue-600", orange: "hover:border-orange-200 hover:text-orange-600", red: "text-gray-300 hover:border-red-100 hover:text-red-500" };
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`grid h-9 w-9 place-items-center rounded-xl border border-transparent text-gray-400 transition hover:bg-white hover:shadow-sm ${colors[tone]}`}>{icon}</button>;
}

function DetailBox({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "orange" }) {
  return <div className={`rounded-2xl border p-4 text-center ${tone === "orange" ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-gray-50"}`}><div className="text-[11px] font-bold text-gray-400">{label}</div><div className={`mt-1 text-lg font-black ${tone === "orange" ? "text-orange-700" : "text-gray-800"}`}>{value}</div></div>;
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-h-20 gap-3 border-b border-gray-100 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-500">{icon}</span><div><div className="text-[11px] font-bold text-gray-400">{label}</div><div className="mt-1 text-sm font-bold text-gray-800">{value}</div></div></div>;
}

function PanelState({ icon, text, tone = "default" }: { icon: React.ReactNode; text: string; tone?: "default" | "error" }) {
  return <div className={`flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center text-sm font-semibold ${tone === "error" ? "text-red-600" : "text-gray-400"}`}><span className={`mb-3 grid h-12 w-12 place-items-center rounded-2xl ${tone === "error" ? "bg-red-50" : "bg-gray-50 text-gray-300"}`}>{icon}</span>{text}</div>;
}
