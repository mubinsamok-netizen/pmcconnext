"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  Banknote,
  BriefcaseBusiness,
  Database,
  Edit3,
  Eye,
  Filter,
  HardHat,
  Hash,
  Loader2,
  MapPin,
  MessageCircle,
  NotebookText,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { getAppRole } from "@/lib/roles";
import LaborRatesPanel from "./LaborRatesPanel";

type Contractor = {
  _rowIndex?: number;
  contractor_id: string;
  name: string;
  nickname?: string;
  phone: string;
  line_id?: string;
  work_categories?: string;
  service_area?: string;
  employment_type?: string;
  rate_note?: string;
  source?: string;
  status?: string;
  team_size?: string;
  notes?: string;
};

type ApiResponse = { success: boolean; data: Contractor[] };
type FormState = {
  contractor_id: string;
  name: string;
  nickname: string;
  phone: string;
  line_id: string;
  work_categories: string[];
  custom_category: string;
  service_area: string;
  employment_type: string;
  rate_note: string;
  source: string;
  status: string;
  team_size: string;
  notes: string;
};

const workCategories = [
  "งานโครงสร้าง",
  "งานก่อ–ฉาบ",
  "งานกระเบื้อง",
  "งานฝ้า–ผนังเบา",
  "งานสี",
  "งานไฟฟ้า",
  "งานประปา–สุขาภิบาล",
  "งานหลังคา",
  "งานอะลูมิเนียม–กระจก",
  "งานเหล็ก–สเตนเลส",
  "งานไม้–เฟอร์นิเจอร์",
  "งานแอร์",
  "งานภูมิทัศน์",
  "งานทำความสะอาด",
];

const emptyForm: FormState = {
  contractor_id: "",
  name: "",
  nickname: "",
  phone: "",
  line_id: "",
  work_categories: [],
  custom_category: "",
  service_area: "",
  employment_type: "unspecified",
  rate_note: "",
  source: "",
  status: "available",
  team_size: "",
  notes: "",
};

const statusLabels: Record<string, string> = {
  available: "พร้อมรับงาน",
  reserve: "สำรอง",
  inactive: "งดรับงาน",
};

const employmentLabels: Record<string, string> = {
  daily: "รายวัน",
  contract: "เหมางาน",
  both: "รายวัน / เหมา",
  unspecified: "ยังไม่ระบุ",
};

function parseCategories(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function toForm(contractor: Contractor): FormState {
  const categories = parseCategories(contractor.work_categories);
  const standard = categories.filter((item) => workCategories.includes(item));
  const custom = categories.filter((item) => !workCategories.includes(item)).join(", ");
  return {
    contractor_id: contractor.contractor_id,
    name: contractor.name || "",
    nickname: contractor.nickname || "",
    phone: contractor.phone || "",
    line_id: contractor.line_id || "",
    work_categories: standard,
    custom_category: custom,
    service_area: contractor.service_area || "",
    employment_type: contractor.employment_type || "unspecified",
    rate_note: contractor.rate_note || "",
    source: contractor.source || "",
    status: contractor.status || "available",
    team_size: contractor.team_size || "",
    notes: contractor.notes || "",
  };
}

export default function ContractorsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = getAppRole(session?.user?.role) === "Admin";
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(isAdmin ? "/api/contractors" : null, fetcher);
  const contractors = useMemo(() => data?.data || [], [data?.data]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"contractors" | "labor-rates">("contractors");

  useEffect(() => {
    if (sessionStatus !== "loading" && !isAdmin) router.replace("/dashboard/projects");
  }, [isAdmin, router, sessionStatus]);

  useEffect(() => {
    if (!modalOpen && !selectedContractor) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
        setSelectedContractor(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen, selectedContractor]);

  const availableCategories = useMemo(() => {
    const categories = new Set(workCategories);
    contractors.forEach((item) => parseCategories(item.work_categories).forEach((category) => categories.add(category)));
    return [...categories];
  }, [contractors]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contractors.filter((contractor) => {
      const categories = parseCategories(contractor.work_categories);
      const matchesQuery = !normalizedQuery || [
        contractor.name,
        contractor.nickname,
        contractor.phone,
        contractor.line_id,
        contractor.service_area,
        ...categories,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      const matchesCategory = categoryFilter === "all" || categories.includes(categoryFilter);
      const matchesStatus = statusFilter === "all" || (contractor.status || "available") === statusFilter;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, contractors, query, statusFilter]);

  const stats = useMemo(() => ({
    total: contractors.length,
    available: contractors.filter((item) => (item.status || "available") === "available").length,
    categories: new Set(contractors.flatMap((item) => parseCategories(item.work_categories))).size,
  }), [contractors]);

  const openCreate = () => {
    setForm(emptyForm);
    setMessage(null);
    setSelectedContractor(null);
    setModalOpen(true);
  };

  const openEdit = (contractor: Contractor) => {
    setForm(toForm(contractor));
    setMessage(null);
    setSelectedContractor(null);
    setModalOpen(true);
  };

  const openDetails = (contractor: Contractor) => {
    setModalOpen(false);
    setSelectedContractor(contractor);
  };

  const setField = (field: keyof FormState, value: string | string[]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleCategory = (category: string) => {
    setForm((current) => ({
      ...current,
      work_categories: current.work_categories.includes(category)
        ? current.work_categories.filter((item) => item !== category)
        : [...current.work_categories, category],
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const customCategories = form.custom_category.split(",").map((item) => item.trim()).filter(Boolean);
    const payload = {
      ...form,
      work_categories: [...new Set([...form.work_categories, ...customCategories])],
    };

    try {
      const response = await fetch("/api/contractors", {
        method: form.contractor_id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ไม่สามารถบันทึกข้อมูลได้");
      await mutate();
      setModalOpen(false);
      setMessage({ type: "success", text: form.contractor_id ? "แก้ไขข้อมูลช่างแล้ว" : "เพิ่มข้อมูลช่างแล้ว" });
    } catch (submitError) {
      setMessage({ type: "error", text: submitError instanceof Error ? submitError.message : "ไม่สามารถบันทึกข้อมูลได้" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contractor: Contractor) => {
    if (!window.confirm(`ลบข้อมูล “${contractor.name}” ออกจากฐานข้อมูลใช่ไหม?`)) return;
    setDeletingId(contractor.contractor_id);
    setMessage(null);
    try {
      const response = await fetch(`/api/contractors?contractor_id=${encodeURIComponent(contractor.contractor_id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ไม่สามารถลบข้อมูลได้");
      await mutate();
      setMessage({ type: "success", text: `ลบข้อมูล ${contractor.name} แล้ว` });
    } catch (deleteError) {
      setMessage({ type: "error", text: deleteError instanceof Error ? deleteError.message : "ไม่สามารถลบข้อมูลได้" });
    } finally {
      setDeletingId(null);
    }
  };

  if (sessionStatus === "loading" || !isAdmin) {
    return <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">กำลังตรวจสอบสิทธิ์...</div>;
  }

  const hasActiveFilters = Boolean(query || categoryFilter !== "all" || statusFilter !== "all");
  const resetFilters = () => {
    setQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-200/60">
            <HardHat size={23} strokeWidth={2.2} />
          </span>
          <div>
            <div className="mb-0.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange-600">
              <Database size={12} /> Master Data
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-950">ฐานข้อมูลช่าง</h2>
            <p className="mt-0.5 text-sm text-gray-500">สมุดรายชื่อช่างและทีมช่างส่วนกลางของบริษัท</p>
          </div>
        </div>
        {activeTab === "contractors" && (
          <button type="button" onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-lg shadow-orange-200/50 transition hover:-translate-y-0.5 hover:bg-orange-700 hover:shadow-xl active:translate-y-0">
            <Plus size={18} strokeWidth={2.5} /> เพิ่มข้อมูลช่าง
          </button>
        )}
      </header>

      <nav className="inline-flex w-full gap-1 rounded-2xl border border-gray-200 bg-gray-100/80 p-1 sm:w-auto" aria-label="หมวดฐานข้อมูลช่าง">
        <button
          type="button"
          onClick={() => {
            setActiveTab("contractors");
            setSelectedContractor(null);
            setModalOpen(false);
          }}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition sm:min-w-44 ${activeTab === "contractors" ? "bg-white text-orange-700 shadow-sm ring-1 ring-gray-200/70" : "text-gray-500 hover:bg-white/60 hover:text-gray-800"}`}
          aria-current={activeTab === "contractors" ? "page" : undefined}
        >
          <UsersRound size={17} /> รายชื่อช่าง
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === "contractors" ? "bg-orange-50 text-orange-700" : "bg-gray-200 text-gray-500"}`}>{contractors.length}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("labor-rates");
            setSelectedContractor(null);
            setModalOpen(false);
          }}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition sm:min-w-48 ${activeTab === "labor-rates" ? "bg-white text-orange-700 shadow-sm ring-1 ring-gray-200/70" : "text-gray-500 hover:bg-white/60 hover:text-gray-800"}`}
          aria-current={activeTab === "labor-rates" ? "page" : undefined}
        >
          <Banknote size={17} /> ฐานข้อมูลค่าแรง
        </button>
      </nav>

      {activeTab === "contractors" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={UsersRound} label="รายชื่อทั้งหมด" detail="ช่างและทีมช่าง" value={stats.total} tone="orange" />
        <StatCard icon={UserRoundCheck} label="พร้อมรับงาน" detail="ติดต่อรับงานได้" value={stats.available} tone="green" />
        <StatCard icon={BriefcaseBusiness} label="หมวดงาน" detail="ประเภทงานที่รวบรวม" value={stats.categories} tone="blue" />
      </div>

      {message && !modalOpen && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <section className="overflow-hidden rounded-[22px] border border-gray-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-gray-900">รายชื่อช่าง</h3>
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-extrabold text-orange-700">{filtered.length}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">ค้นหาและคัดกรองข้อมูลที่ต้องการได้ทันที</p>
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">
                <RotateCcw size={14} /> ล้างตัวกรอง
              </button>
            )}
          </div>
          <div className="grid gap-2.5 lg:grid-cols-[minmax(320px,1fr)_230px_180px]">
            <label className="group relative">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition group-focus-within:text-orange-600" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-10 pr-4 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-50" placeholder="ค้นหาชื่อ เบอร์โทร พื้นที่ หรือประเภทงาน" />
            </label>
            <label className="relative">
              <Filter size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white pl-10 pr-9 text-sm font-semibold text-gray-700 outline-none transition hover:border-gray-300 focus:border-orange-300 focus:ring-4 focus:ring-orange-50">
                <option value="all">ทุกหมวดงาน</option>
                {availableCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">▼</span>
            </label>
            <label className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-emerald-500" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white pl-8 pr-9 text-sm font-semibold text-gray-700 outline-none transition hover:border-gray-300 focus:border-orange-300 focus:ring-4 focus:ring-orange-50">
                <option value="all">ทุกสถานะ</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">▼</span>
            </label>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[920px] text-left">
            <thead className="border-b border-gray-100 bg-slate-50/80 text-[11px] font-extrabold tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3.5">ช่าง / ทีมช่าง</th>
                <th className="px-4 py-3.5">หมวดงาน</th>
                <th className="px-4 py-3.5">ติดต่อ</th>
                <th className="px-4 py-3.5">พื้นที่รับงาน</th>
                <th className="px-4 py-3.5">รูปแบบรับงาน</th>
                <th className="px-4 py-3.5">สถานะ</th>
                <th className="w-32 px-4 py-3.5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filtered.map((contractor) => {
                const categories = parseCategories(contractor.work_categories);
                const status = contractor.status || "available";
                return (
                  <tr key={contractor.contractor_id} className="group align-middle transition hover:bg-orange-50/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 font-extrabold text-orange-700 ring-1 ring-orange-200/60 transition group-hover:scale-105">{contractor.name?.charAt(0) || <HardHat size={18} />}</span>
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900">{contractor.name}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
                            {contractor.nickname && <><span>{contractor.nickname}</span><span className="h-1 w-1 rounded-full bg-gray-300" /></>}
                            <span>{Number(contractor.team_size) > 0 ? `ทีม ${contractor.team_size} คน` : contractor.contractor_id}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[300px] px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {categories.length ? categories.map((category) => <span key={category} className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">{category}</span>) : <span className="text-gray-400">ยังไม่ระบุ</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      <a href={`tel:${contractor.phone}`} className="flex items-center gap-2 font-bold text-gray-700 transition hover:text-orange-600"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gray-100 text-gray-400"><Phone size={13} /></span>{contractor.phone}</a>
                      {contractor.line_id && <div className="mt-1.5 flex items-center gap-1.5 pl-1 text-[11px] text-gray-400"><MessageCircle size={12} />LINE: {contractor.line_id}</div>}
                    </td>
                    <td className="px-4 py-4 text-gray-600"><div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" /><span className="max-w-48 leading-5">{contractor.service_area || "ยังไม่ระบุ"}</span></div></td>
                    <td className="px-4 py-4 text-gray-600">
                      <div className="font-semibold text-gray-700">{employmentLabels[contractor.employment_type || "unspecified"] || "ยังไม่ระบุ"}</div>
                      {contractor.rate_note && <div className="mt-1 text-xs text-gray-400">{contractor.rate_note}</div>}
                    </td>
                    <td className="px-4 py-4"><StatusBadge status={status} /></td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center gap-1">
                        <button type="button" onClick={() => openDetails(contractor)} className="grid h-9 w-9 place-items-center rounded-xl border border-transparent text-gray-400 transition hover:border-blue-200 hover:bg-white hover:text-blue-600 hover:shadow-sm" title="ดูรายละเอียด" aria-label={`ดูรายละเอียด ${contractor.name}`}><Eye size={16} /></button>
                        <button type="button" onClick={() => openEdit(contractor)} className="grid h-9 w-9 place-items-center rounded-xl border border-transparent text-gray-400 transition hover:border-orange-200 hover:bg-white hover:text-orange-600 hover:shadow-sm" title="แก้ไข"><Edit3 size={15} /></button>
                        <button type="button" disabled={deletingId === contractor.contractor_id} onClick={() => handleDelete(contractor)} className="grid h-9 w-9 place-items-center rounded-xl border border-transparent text-gray-300 transition hover:border-red-100 hover:bg-white hover:text-red-500 hover:shadow-sm disabled:opacity-50" title="ลบ">{deletingId === contractor.contractor_id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {isLoading && <tr><td colSpan={7}><TableState icon={<Loader2 size={22} className="animate-spin text-orange-600" />} text="กำลังโหลดฐานข้อมูลช่าง..." /></td></tr>}
              {!isLoading && error && <tr><td colSpan={7}><TableState icon={<X size={22} className="text-red-500" />} text="ไม่สามารถโหลดข้อมูลช่างได้ กรุณาลองใหม่อีกครั้ง" tone="error" /></td></tr>}
              {!isLoading && !error && filtered.length === 0 && <tr><td colSpan={7}><TableState icon={<HardHat size={24} />} text={contractors.length ? "ไม่พบข้อมูลที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลช่าง เริ่มต้นโดยกด “เพิ่มข้อมูลช่าง”"} /></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-gray-100 lg:hidden">
          {filtered.map((contractor) => {
            const categories = parseCategories(contractor.work_categories);
            const status = contractor.status || "available";
            return (
              <article key={contractor.contractor_id} className="p-4 transition hover:bg-orange-50/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-100 font-extrabold text-orange-700">{contractor.name?.charAt(0) || <HardHat size={18} />}</span>
                    <div className="min-w-0"><h4 className="truncate font-extrabold text-gray-900">{contractor.name}</h4><p className="mt-0.5 truncate text-xs text-gray-400">{contractor.nickname || contractor.contractor_id}</p></div>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{categories.length ? categories.map((category) => <span key={category} className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{category}</span>) : <span className="text-xs text-gray-400">ยังไม่ระบุหมวดงาน</span>}</div>
                <div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 sm:grid-cols-2">
                  <div className="flex items-center gap-2"><Phone size={13} className="text-gray-400" /><span className="font-semibold">{contractor.phone}</span></div>
                  <div className="flex items-center gap-2"><MapPin size={13} className="text-gray-400" /><span className="truncate">{contractor.service_area || "ยังไม่ระบุพื้นที่"}</span></div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => openDetails(contractor)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-bold text-orange-700"><Eye size={14} />ดูรายละเอียด</button>
                  <button type="button" onClick={() => openEdit(contractor)} className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white text-gray-500" title="แก้ไข" aria-label={`แก้ไข ${contractor.name}`}><Edit3 size={14} /></button>
                  <button type="button" disabled={deletingId === contractor.contractor_id} onClick={() => handleDelete(contractor)} className="grid h-9 w-9 place-items-center rounded-xl border border-red-100 bg-red-50 text-red-500">{deletingId === contractor.contractor_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>
                </div>
              </article>
            );
          })}
          {isLoading && <TableState icon={<Loader2 size={22} className="animate-spin text-orange-600" />} text="กำลังโหลดฐานข้อมูลช่าง..." />}
          {!isLoading && error && <TableState icon={<X size={22} className="text-red-500" />} text="ไม่สามารถโหลดข้อมูลช่างได้ กรุณาลองใหม่อีกครั้ง" tone="error" />}
          {!isLoading && !error && filtered.length === 0 && <TableState icon={<HardHat size={24} />} text={contractors.length ? "ไม่พบข้อมูลที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลช่าง เริ่มต้นโดยกด “เพิ่มข้อมูลช่าง”"} />}
        </div>

        {!isLoading && !error && contractors.length > 0 && <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-5 py-3 text-xs font-semibold text-gray-400"><span>ข้อมูลช่างทั้งหมด {contractors.length} รายการ</span><span>แสดง {filtered.length} รายการ</span></div>}
          </section>
        </>
      ) : (
        <LaborRatesPanel />
      )}

      {selectedContractor && (
        <ContractorDetailsDialog
          contractor={selectedContractor}
          onClose={() => setSelectedContractor(null)}
          onEdit={() => openEdit(selectedContractor)}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-950/45 p-3 backdrop-blur-sm sm:p-6">
          <div className="my-auto w-full max-w-3xl overflow-hidden rounded-[26px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-orange-50/80 to-white px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-600 text-white shadow-md shadow-orange-200"><HardHat size={19} /></span><div><h3 className="text-lg font-extrabold text-gray-950">{form.contractor_id ? "แก้ไขข้อมูลช่าง" : "เพิ่มข้อมูลช่าง"}</h3><p className="text-xs text-gray-400">ข้อมูลสำหรับสมุดรายชื่อช่างส่วนกลางของบริษัท</p></div></div>
              <button type="button" onClick={() => setModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="ปิด"><X size={19} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5 sm:p-6">
                {message?.type === "error" && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message.text}</div>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="ชื่อช่าง / ชื่อทีม *"><input required value={form.name} onChange={(event) => setField("name", event.target.value)} className="form-input" placeholder="เช่น สมชาย ใจดี" /></Field>
                  <Field label="ชื่อเล่น"><input value={form.nickname} onChange={(event) => setField("nickname", event.target.value)} className="form-input" placeholder="เช่น ช่างชาย" /></Field>
                  <Field label="เบอร์โทรศัพท์ *"><input required value={form.phone} onChange={(event) => setField("phone", event.target.value)} className="form-input" placeholder="08X-XXX-XXXX" /></Field>
                  <Field label="LINE ID"><input value={form.line_id} onChange={(event) => setField("line_id", event.target.value)} className="form-input" placeholder="LINE ID หรือเบอร์ที่ใช้ LINE" /></Field>
                </div>

                <div className="space-y-2">
                  <span className="block text-sm font-bold text-gray-700">หมวดงานที่รับทำ</span>
                  <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 p-3">
                    {workCategories.map((category) => {
                      const selected = form.work_categories.includes(category);
                      return <button key={category} type="button" onClick={() => toggleCategory(category)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-500 hover:border-orange-200"}`}>{category}</button>;
                    })}
                  </div>
                </div>
                <Field label="หมวดงานอื่น ๆ"><input value={form.custom_category} onChange={(event) => setField("custom_category", event.target.value)} className="form-input" placeholder="คั่นหลายหมวดด้วยเครื่องหมายจุลภาค" /></Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="พื้นที่รับงาน"><input value={form.service_area} onChange={(event) => setField("service_area", event.target.value)} className="form-input" placeholder="เช่น กรุงเทพฯ และปริมณฑล" /></Field>
                  <Field label="ขนาดทีม (คน)"><input min="0" type="number" value={form.team_size} onChange={(event) => setField("team_size", event.target.value)} className="form-input" placeholder="เช่น 5" /></Field>
                  <Field label="รูปแบบการรับงาน"><select value={form.employment_type} onChange={(event) => setField("employment_type", event.target.value)} className="form-input bg-white">{Object.entries(employmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                  <Field label="ราคา / เงื่อนไขเบื้องต้น"><input value={form.rate_note} onChange={(event) => setField("rate_note", event.target.value)} className="form-input" placeholder="เช่น 700 บาท/วัน หรือประเมินหน้างาน" /></Field>
                  <Field label="ผู้แนะนำ / แหล่งที่มา"><input value={form.source} onChange={(event) => setField("source", event.target.value)} className="form-input" placeholder="เช่น ผู้รับเหมาคุณเอก" /></Field>
                  <Field label="สถานะ"><select value={form.status} onChange={(event) => setField("status", event.target.value)} className="form-input bg-white">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                </div>
                <Field label="หมายเหตุ"><textarea rows={3} value={form.notes} onChange={(event) => setField("notes", event.target.value)} className="form-input resize-none" placeholder="ข้อมูลเพิ่มเติม เช่น ความถนัด หรือช่วงเวลาที่สะดวกติดต่อ" /></Field>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:px-6">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
                <button disabled={saving} type="submit" className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? "กำลังบันทึก" : "บันทึกข้อมูล"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractorDetailsDialog({
  contractor,
  onClose,
  onEdit,
}: {
  contractor: Contractor;
  onClose: () => void;
  onEdit: () => void;
}) {
  const categories = parseCategories(contractor.work_categories);
  const status = contractor.status || "available";
  const teamSize = Number(contractor.team_size || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-label="ปิดรายละเอียดช่าง" />
      <div role="dialog" aria-modal="true" aria-labelledby="contractor-detail-title" className="relative my-auto w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.3)]">
        <div className="relative isolate overflow-hidden bg-slate-950 px-5 pb-6 pt-5 text-white sm:px-7 sm:pb-7">
          <span className="absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-orange-500/30 blur-3xl" />
          <span className="absolute -bottom-24 left-24 -z-10 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange-300">
              <Database size={12} /> Contractor Profile
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white" aria-label="ปิด"><X size={18} /></button>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-gradient-to-br from-orange-400 to-orange-600 text-2xl font-black text-white shadow-xl shadow-orange-950/30 ring-4 ring-white/10">
                {contractor.name?.charAt(0) || <HardHat size={26} />}
              </span>
              <div className="min-w-0">
                <h3 id="contractor-detail-title" className="truncate text-2xl font-black tracking-tight">{contractor.name}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                  {contractor.nickname && <span className="text-slate-200">{contractor.nickname}</span>}
                  {contractor.nickname && <span className="h-1 w-1 rounded-full bg-slate-600" />}
                  <span>{contractor.contractor_id}</span>
                </div>
              </div>
            </div>
            <div className="self-start rounded-full bg-white p-0.5 sm:self-auto"><StatusBadge status={status} /></div>
          </div>
        </div>

        <div className="max-h-[calc(100vh-250px)] space-y-5 overflow-y-auto p-5 sm:p-7">
          <section>
            <SectionLabel icon={<BriefcaseBusiness size={14} />} label="หมวดงานที่รับทำ" />
            <div className="mt-2.5 flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
              {categories.length ? categories.map((category) => (
                <span key={category} className="rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-blue-700 shadow-sm ring-1 ring-blue-100">{category}</span>
              )) : <span className="text-sm text-gray-400">ยังไม่ได้ระบุหมวดงาน</span>}
            </div>
          </section>

          <section>
            <SectionLabel icon={<Phone size={14} />} label="ข้อมูลติดต่อ" />
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
              <a href={`tel:${contractor.phone}`} className="group flex items-center gap-3 rounded-2xl border border-gray-200 p-3.5 transition hover:border-orange-200 hover:bg-orange-50/50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:bg-orange-600 group-hover:text-white"><Phone size={17} /></span>
                <span className="min-w-0"><span className="block text-[11px] font-bold text-gray-400">เบอร์โทรศัพท์</span><span className="mt-0.5 block truncate text-sm font-extrabold text-gray-900">{contractor.phone || "ยังไม่ระบุ"}</span></span>
              </a>
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><MessageCircle size={17} /></span>
                <span className="min-w-0"><span className="block text-[11px] font-bold text-gray-400">LINE ID</span><span className="mt-0.5 block truncate text-sm font-extrabold text-gray-900">{contractor.line_id || "ยังไม่ระบุ"}</span></span>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel icon={<NotebookText size={14} />} label="รายละเอียดการรับงาน" />
            <div className="mt-2.5 grid overflow-hidden rounded-2xl border border-gray-200 sm:grid-cols-2">
              <DetailItem icon={<MapPin size={16} />} label="พื้นที่รับงาน" value={contractor.service_area || "ยังไม่ระบุ"} />
              <DetailItem icon={<BriefcaseBusiness size={16} />} label="รูปแบบรับงาน" value={employmentLabels[contractor.employment_type || "unspecified"] || "ยังไม่ระบุ"} />
              <DetailItem icon={<UsersRound size={16} />} label="ขนาดทีม" value={teamSize > 0 ? `${teamSize} คน` : "ยังไม่ระบุ"} />
              <DetailItem icon={<Hash size={16} />} label="ผู้แนะนำ / แหล่งที่มา" value={contractor.source || "ยังไม่ระบุ"} />
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50/40 p-4">
              <SectionLabel icon={<Banknote size={14} />} label="ราคา / เงื่อนไขเบื้องต้น" tone="orange" />
              <p className="mt-2 text-sm font-bold leading-6 text-gray-800">{contractor.rate_note || "ยังไม่ได้ระบุราคา"}</p>
            </section>
            <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
              <SectionLabel icon={<NotebookText size={14} />} label="หมายเหตุ" />
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-gray-600">{contractor.notes || "ไม่มีหมายเหตุเพิ่มเติม"}</p>
            </section>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <span className="hidden text-[11px] font-semibold text-gray-400 sm:block">ข้อมูลจากฐานข้อมูลช่างส่วนกลาง</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition hover:bg-gray-100 sm:flex-none">ปิด</button>
            <button type="button" onClick={onEdit} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white shadow-md shadow-orange-200 transition hover:bg-orange-700 sm:flex-none"><Edit3 size={15} />แก้ไขข้อมูล</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ icon, label, tone = "gray" }: { icon: React.ReactNode; label: string; tone?: "gray" | "orange" }) {
  return <div className={`flex items-center gap-1.5 text-xs font-extrabold ${tone === "orange" ? "text-orange-700" : "text-gray-700"}`}>{icon}{label}</div>;
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-20 items-start gap-3 border-b border-gray-100 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-500">{icon}</span>
      <div className="min-w-0"><div className="text-[11px] font-bold text-gray-400">{label}</div><div className="mt-1 break-words text-sm font-bold leading-5 text-gray-800">{value}</div></div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-bold text-gray-700">{label}</span>{children}</label>;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    reserve: "bg-amber-50 text-amber-700 ring-amber-200",
    inactive: "bg-gray-100 text-gray-600 ring-gray-200",
  };
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${styles[status] || styles.available}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{statusLabels[status] || statusLabels.available}</span>;
}

function StatCard({ icon: Icon, label, detail, value, tone }: { icon: typeof UsersRound; label: string; detail: string; value: number; tone: "orange" | "green" | "blue" }) {
  const styles = {
    orange: { icon: "bg-orange-50 text-orange-600 ring-orange-100", glow: "bg-orange-100" },
    green: { icon: "bg-emerald-50 text-emerald-600 ring-emerald-100", glow: "bg-emerald-100" },
    blue: { icon: "bg-blue-50 text-blue-600 ring-blue-100", glow: "bg-blue-100" },
  };
  return (
    <div className="group relative isolate overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-4 shadow-[0_5px_20px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg">
      <span className={`absolute -right-6 -top-8 -z-10 h-24 w-24 rounded-full opacity-30 blur-2xl ${styles[tone].glow}`} />
      <div className="flex items-center gap-3.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 transition group-hover:scale-105 ${styles[tone].icon}`}><Icon size={20} strokeWidth={2.1} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3"><div className="text-sm font-extrabold text-gray-800">{label}</div><div className="text-2xl font-black tracking-tight text-gray-950">{value}</div></div>
          <div className="mt-0.5 text-[11px] font-medium text-gray-400">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function TableState({ icon, text, tone = "default" }: { icon: React.ReactNode; text: string; tone?: "default" | "error" }) {
  return (
    <div className={`flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center text-sm font-semibold ${tone === "error" ? "text-red-600" : "text-gray-400"}`}>
      <span className={`mb-3 grid h-12 w-12 place-items-center rounded-2xl ${tone === "error" ? "bg-red-50" : "bg-gray-50 text-gray-300"}`}>{icon}</span>
      {text}
    </div>
  );
}
