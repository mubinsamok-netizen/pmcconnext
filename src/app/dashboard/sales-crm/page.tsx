"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Archive,
  Bell,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderKanban,
  ListChecks,
  Pencil,
  PhoneCall,
  Plus,
  Printer,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import ConfirmDialog from "@/components/ConfirmDialog";
import { fetcher } from "@/lib/fetcher";
import { isForemanRole } from "@/lib/siteAccess";

type LeadStatus = "new" | "scheduled" | "waiting" | "deposited" | "not_interested";
type InterestLevel = "low" | "medium" | "high";

type ContactLog = {
  round: number;
  date: string;
  note: string;
  created_by: string;
  created_at: string;
};

type Customer = {
  id: string;
  full_name: string;
  nickname?: string;
  phone: string;
  line_id?: string;
  address?: string;
  requirements?: string;
  interest_level?: InterestLevel;
  status?: LeadStatus;
  contact_logs_json?: string;
  contact_logs?: ContactLog[];
  last_contacted_at?: string;
  project_id?: string;
  notes?: string;
  freebies?: string;
  active?: string;
};

type CustomersResponse = {
  success: boolean;
  data: Customer[];
};

type SalesSummary = {
  total: number;
  new: number;
  scheduled: number;
  waiting: number;
  deposited: number;
  not_interested: number;
};

const statusLabels: Record<LeadStatus, string> = {
  new: "ลูกค้าใหม่",
  scheduled: "นัดเข้าออฟฟิศ",
  waiting: "รอตัดสินใจ",
  deposited: "วางมัดจำแล้ว",
  not_interested: "ไม่สนใจ",
};

const statusStyles: Record<LeadStatus, string> = {
  new: "border-amber-200 bg-amber-50 text-amber-700",
  scheduled: "border-purple-200 bg-purple-50 text-purple-700",
  waiting: "border-blue-200 bg-blue-50 text-blue-700",
  deposited: "border-emerald-200 bg-emerald-50 text-emerald-700",
  not_interested: "border-red-100 bg-red-50 text-red-700",
};

const interestLabels: Record<InterestLevel, string> = {
  low: "ต่ำ",
  medium: "กลาง",
  high: "สูง",
};

const interestStyles: Record<InterestLevel, string> = {
  low: "border-red-100 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const emptyLead = {
  full_name: "",
  nickname: "",
  phone: "",
  line_id: "",
  requirements: "",
  interest_level: "medium" as InterestLevel,
  status: "new" as LeadStatus,
  notes: "",
  freebies: "",
};

const projectStatusPlan = [
  "ออกแบบ",
  "เซ็นสัญญา",
  "เขียนแบบพิมพ์เขียว",
  "ยื่นขออนุญาตก่อสร้าง",
  "ใบอนุญาตออกแล้ว",
  "ขอน้ำ-ไฟชั่วคราว",
  "รอรื้อถอน",
  "อยู่ระหว่างก่อสร้าง",
  "ส่งมอบบ้าน",
];

function getStatus(value?: string): LeadStatus {
  if (value === "scheduled" || value === "waiting" || value === "deposited" || value === "not_interested") return value;
  return "new";
}

function getInterest(value?: string): InterestLevel {
  if (value === "low" || value === "high") return value;
  return "medium";
}

function buildProjectLink(customer: Customer) {
  return `/dashboard/sales-crm/${encodeURIComponent(customer.id)}`;
}

function getTodayInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

export default function SalesCrmPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data, error, isLoading, mutate } = useSWR<CustomersResponse>("/api/sales-customers", fetcher);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [editForm, setEditForm] = useState(emptyLead);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "table">("form");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [contactDialogCustomer, setContactDialogCustomer] = useState<Customer | null>(null);
  const [contactForm, setContactForm] = useState({ date: getTodayInputValue(), note: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCloseLead, setPendingCloseLead] = useState<Customer | null>(null);
  const isForeman = isForemanRole(session?.user?.role);

  useEffect(() => {
    if (isForeman) {
      router.replace("/dashboard/projects");
    }
  }, [isForeman, router]);

  const customers = useMemo(() => data?.data || [], [data?.data]);

  const summary = useMemo(() => {
    return customers.reduce(
      (acc, customer) => {
        const status = getStatus(customer.status);
        acc.total += 1;
        acc[status] += 1;
        return acc;
      },
      { total: 0, new: 0, scheduled: 0, waiting: 0, deposited: 0, not_interested: 0 }
    );
  }, [customers]);

  const depositedCustomers = useMemo(
    () => customers.filter((customer) => getStatus(customer.status) === "deposited"),
    [customers]
  );

  const filteredCustomers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return customers.filter((customer) => {
      const status = getStatus(customer.status);
      const matchStatus = statusFilter === "all" || status === statusFilter;
      const matchKeyword =
        !keyword ||
        [
          customer.full_name,
          customer.nickname,
          customer.phone,
          customer.line_id,
          customer.address,
          customer.requirements,
          customer.notes,
          customer.freebies,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return matchStatus && matchKeyword;
    });
  }, [customers, searchTerm, statusFilter]);

  const updateLead = (field: keyof typeof emptyLead, value: string) => {
    setLeadForm((current) => ({ ...current, [field]: value }));
  };

  const updateEditLead = (field: keyof typeof emptyLead, value: string) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const updateCustomer = async (customerId: string, patch: Partial<Customer>) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sales-customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: customerId, action: "update", ...patch }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "ไม่สามารถอัปเดต Lead ได้");
      }

      await mutate();
      return true;
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "ไม่สามารถอัปเดต Lead ได้");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const openEditLead = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditForm({
      full_name: customer.full_name || "",
      nickname: customer.nickname || "",
      phone: customer.phone || "",
      line_id: customer.line_id || "",
      requirements: customer.requirements || "",
      interest_level: getInterest(customer.interest_level),
      status: getStatus(customer.status),
      notes: customer.notes || "",
      freebies: customer.freebies || "",
    });
  };

  const openContactDialog = (customer: Customer) => {
    setContactDialogCustomer(customer);
    setContactForm({ date: getTodayInputValue(), note: "" });
  };

  const saveEditLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCustomer) return;

    const ok = await updateCustomer(editingCustomer.id, editForm);
    if (ok) {
      setEditingCustomer(null);
      setMessage("บันทึกการแก้ไข Lead แล้ว");
    }
  };

  const createLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/sales-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadForm),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "ไม่สามารถเพิ่ม Lead ได้");
      }

      setLeadForm(emptyLead);
      setMessage("เพิ่ม Lead ใหม่แล้ว");
      await mutate();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "ไม่สามารถเพิ่ม Lead ได้");
    } finally {
      setLoading(false);
    }
  };

  const addContactLog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactDialogCustomer) return;

    const note = contactForm.note.trim();
    if (!note) {
      setMessage("กรุณาใส่บันทึกการติดต่อ");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/sales-customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contactDialogCustomer.id,
          action: "add_contact_log",
          note,
          date: contactForm.date || getTodayInputValue(),
          status: "waiting",
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "ไม่สามารถบันทึกการติดต่อได้");
      }

      setContactDialogCustomer(null);
      setContactForm({ date: getTodayInputValue(), note: "" });
      setMessage("บันทึกการติดต่อแล้ว");
      await mutate();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "ไม่สามารถบันทึกการติดต่อได้");
    } finally {
      setLoading(false);
    }
  };

  const markDeposited = async (customerId: string) => {
    await updateCustomer(customerId, { status: "deposited" });
    setMessage("เปลี่ยนสถานะเป็นวางมัดจำแล้ว");
  };

  const closeLead = async (customer: Customer) => {
    const ok = await updateCustomer(customer.id, { active: "FALSE", status: "not_interested" });
    if (ok) {
      setPendingCloseLead(null);
      setMessage("ปิด Lead แล้ว");
    }
  };

  const printSalesFollowUp = () => {
    document.body.classList.add("printing-sales-crm");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-sales-crm"), 250);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600">
            <ClipboardList size={16} />
            Master Workspace
          </div>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">Sales CRM</h2>
          <p className="text-gray-500">Sales Follow-up ตามเอกสารฝ่ายขาย พร้อมส่งต่อลูกค้าที่วางมัดจำแล้วไปสร้างไซต์งาน</p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <RefreshCw size={17} className={isLoading ? "animate-spin" : ""} />
          โหลดใหม่
        </button>
      </div>

      {(error || message) && (
        <div className={`rounded-xl border p-4 ${error ? "border-red-100 bg-red-50 text-red-600" : "border-orange-100 bg-orange-50 text-orange-700"}`}>
          {error ? "ไม่สามารถโหลดข้อมูล Sales CRM จาก Master Sheet ได้" : message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <SummaryCard label="Lead ทั้งหมด" value={summary.total} />
        <SummaryCard label="ลูกค้าใหม่" value={summary.new} />
        <SummaryCard label="นัดเข้าออฟฟิศ" value={summary.scheduled} />
        <SummaryCard label="รอตัดสินใจ" value={summary.waiting} />
        <SummaryCard label="วางมัดจำแล้ว" value={summary.deposited} />
        <SummaryCard label="ไม่สนใจ" value={summary.not_interested} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition ${activeTab === "form" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
          >
            <UserPlus size={17} />
            กรอก Lead
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("table")}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition ${activeTab === "table" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
          >
            <ListChecks size={17} />
            ตาราง Sales Follow-up
          </button>
        </div>
      </div>

      {activeTab === "form" && (
      <form onSubmit={createLead} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <UserPlus size={22} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">เพิ่ม Lead ใหม่</h3>
            <p className="text-sm text-gray-500">ข้อมูลตามตาราง Sales Follow-up: ชื่อ/เบอร์, ความต้องการ, ระดับความสนใจ และสถานะ</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="ชื่อลูกค้า *">
            <input value={leadForm.full_name} onChange={(event) => updateLead("full_name", event.target.value)} required className="form-input" />
          </Field>
          <Field label="ชื่อเล่น">
            <input value={leadForm.nickname} onChange={(event) => updateLead("nickname", event.target.value)} className="form-input" />
          </Field>
          <Field label="เบอร์โทร *">
            <input value={leadForm.phone} onChange={(event) => updateLead("phone", event.target.value)} required className="form-input" />
          </Field>
          <Field label="LINE ID">
            <input value={leadForm.line_id} onChange={(event) => updateLead("line_id", event.target.value)} className="form-input" />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="ระดับความสนใจ">
            <select value={leadForm.interest_level} onChange={(event) => updateLead("interest_level", event.target.value)} className="form-input bg-white">
              <option value="low">ต่ำ</option>
              <option value="medium">กลาง</option>
              <option value="high">สูง</option>
            </select>
          </Field>
          <Field label="สถานะ">
            <select value={leadForm.status} onChange={(event) => updateLead("status", event.target.value)} className="form-input bg-white">
              <option value="new">ลูกค้าใหม่</option>
              <option value="scheduled">นัดเข้าออฟฟิศ</option>
              <option value="waiting">รอตัดสินใจ</option>
              <option value="deposited">วางมัดจำแล้ว</option>
              <option value="not_interested">ไม่สนใจ</option>
            </select>
          </Field>
          <Field label="ของแถม">
            <input value={leadForm.freebies} onChange={(event) => updateLead("freebies", event.target.value)} className="form-input" />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="ความต้องการ">
            <textarea
              value={leadForm.requirements}
              onChange={(event) => updateLead("requirements", event.target.value)}
              className="form-input min-h-28"
              placeholder="เช่น สร้างที่บางนา, งบ 10 ล้าน, ที่ดิน 100 ตร.ว., ต้องการบ้าน 3 ชั้น"
            />
          </Field>
          <Field label="หมายเหตุ">
            <textarea
              value={leadForm.notes}
              onChange={(event) => updateLead("notes", event.target.value)}
              className="form-input min-h-28"
              placeholder="เช่น รถ 10 ล้อเข้าไม่ได้, อยู่ในหมู่บ้าน, มีงานรื้อถอน"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <button disabled={loading} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:opacity-70">
            <Plus size={18} />
            บันทึก Lead
          </button>
        </div>
      </form>
      )}

      {activeTab === "table" && (
      <>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_240px]">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
            <Search size={18} className="text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="ค้นหาชื่อลูกค้า เบอร์โทร LINE สถานที่ งบประมาณ หรือความต้องการ"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "all")}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="new">ลูกค้าใหม่</option>
            <option value="scheduled">นัดเข้าออฟฟิศ</option>
            <option value="waiting">รอตัดสินใจ</option>
            <option value="deposited">วางมัดจำแล้ว</option>
            <option value="not_interested">ไม่สนใจ</option>
          </select>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="font-bold text-gray-900">Sales Follow-up</h3>
            <p className="text-sm text-gray-500">ตารางตามเอกสารฝ่ายขาย พร้อม dropdown ระดับความสนใจและสถานะ</p>
          </div>
          <button
            type="button"
            onClick={() => setPrintDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-orange-200 hover:text-orange-600"
          >
            <Printer size={17} />
            Print
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left text-sm">
            <thead className="bg-gray-950 text-white">
              <tr>
                <th className="w-14 px-4 py-3">ลำดับ</th>
                <th className="w-56 px-4 py-3">ชื่อและเบอร์โทร</th>
                <th className="w-72 px-4 py-3">ความต้องการ</th>
                <th className="w-40 px-4 py-3">ระดับความสนใจ</th>
                <th className="w-80 px-4 py-3">ประวัติการติดต่อ</th>
                <th className="w-44 px-4 py-3">สถานะ</th>
                <th className="w-64 px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">ยังไม่มี Lead ใน Master Sheet</td>
                </tr>
              ) : (
                filteredCustomers.map((customer, index) => {
                  const status = getStatus(customer.status);
                  const interest = getInterest(customer.interest_level);
                  const logs = customer.contact_logs || [];
                  const visibleLogs = logs.slice(-4).reverse();
                  const hiddenLogCount = Math.max(0, logs.length - visibleLogs.length);
                  const canCreateProject = status === "deposited";

                  return (
                    <tr key={customer.id} className="border-b border-gray-100 align-top hover:bg-orange-50/20">
                      <td className="px-4 py-4 font-semibold text-gray-500">{index + 1}</td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{customer.full_name}</div>
                        <div className="mt-1 flex items-center gap-1 text-gray-500">
                          <PhoneCall size={14} />
                          {customer.phone}
                        </div>
                        {customer.nickname && <div className="mt-1 text-xs text-gray-400">ชื่อเล่น: {customer.nickname}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="whitespace-pre-line text-gray-700">{customer.requirements || "-"}</div>
                        {customer.notes && <div className="mt-2 text-xs text-gray-500">หมายเหตุ: {customer.notes}</div>}
                        {customer.freebies && <div className="mt-1 text-xs text-gray-500">ของแถม: {customer.freebies}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={interest}
                          disabled={loading}
                          onChange={(event) => updateCustomer(customer.id, { interest_level: event.target.value as InterestLevel })}
                          className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${interestStyles[interest]}`}
                        >
                          <option value="low">ต่ำ</option>
                          <option value="medium">กลาง</option>
                          <option value="high">สูง</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        {logs.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-400">รวม {logs.length} ครั้ง</div>
                            {visibleLogs.map((log) => (
                              <div key={`${customer.id}-${log.round}-${log.created_at}`} className="rounded-lg bg-gray-50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-gray-900">ครั้งที่ {log.round}</span>
                                  <span className="text-xs text-gray-400">{log.date}</span>
                                </div>
                                <div className="mt-1 whitespace-pre-line text-gray-600">{log.note}</div>
                              </div>
                            ))}
                            {hiddenLogCount > 0 && (
                              <div className="text-xs text-gray-400">มีประวัติก่อนหน้านี้อีก {hiddenLogCount} ครั้ง</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">ยังไม่มีประวัติ</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={status}
                          disabled={loading}
                          onChange={(event) => updateCustomer(customer.id, { status: event.target.value as LeadStatus })}
                          className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${statusStyles[status]}`}
                        >
                          <option value="new">ลูกค้าใหม่</option>
                          <option value="scheduled">นัดเข้าออฟฟิศ</option>
                          <option value="waiting">รอตัดสินใจ</option>
                          <option value="deposited">วางมัดจำแล้ว</option>
                          <option value="not_interested">ไม่สนใจ</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-3">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => openContactDialog(customer)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-70"
                          >
                            <PhoneCall size={15} />
                            บันทึกติดต่อ
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => openEditLead(customer)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Pencil size={14} />
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              disabled={loading || status === "deposited"}
                              onClick={() => markDeposited(customer.id)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} />
                              มัดจำ
                            </button>
                            <Link
                              href={buildProjectLink(customer)}
                              className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${canCreateProject ? "bg-orange-600 hover:bg-orange-700" : "pointer-events-none bg-gray-300"}`}
                            >
                              รายละเอียด
                            </Link>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => setPendingCloseLead(customer)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              <Archive size={14} />
                              ปิด Lead
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}

      {activeTab === "table" && (
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InfoPanel
          icon={FolderKanban}
          title="โครงการจากฝ่ายขาย"
          description="ลูกค้าที่วางมัดจำแล้วจะถูกส่งต่อไปสร้างไซต์งาน พร้อมข้อมูลลูกค้า ความต้องการ หมายเหตุ และของแถม"
        >
          <div className="space-y-2">
            {depositedCustomers.length === 0 ? (
              <div className="text-sm text-gray-400">ยังไม่มีลูกค้าวางมัดจำ</div>
            ) : (
              depositedCustomers.slice(0, 4).map((customer) => (
                <Link
                  key={customer.id}
                  href={buildProjectLink(customer)}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm hover:border-orange-200 hover:bg-orange-50"
                >
                  <span className="font-semibold text-gray-800">{customer.full_name}</span>
                  <span className="text-orange-600">ดูรายละเอียด</span>
                </Link>
              ))
            )}
          </div>
        </InfoPanel>

        <InfoPanel
          icon={Bell}
          title="สถานะโครงการที่ต้องต่อยอด"
          description="เตรียมใช้กับรายละเอียดโครงการหลังสร้างไซต์ เช่น ออกแบบ เซ็นสัญญา ขออนุญาต น้ำไฟชั่วคราว และส่งมอบบ้าน"
        >
          <div className="flex flex-wrap gap-2">
            {projectStatusPlan.map((status) => (
              <span key={status} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">{status}</span>
            ))}
          </div>
        </InfoPanel>

        <InfoPanel
          icon={FileText}
          title="เอกสารและประกันผลงาน"
          description="เตรียมต่อยอดเป็นพื้นที่อัปโหลด PDF หลายไฟล์ และแจ้งเตือนประกันโครงสร้าง 20 ปี หลังคา 5 ปี งานสถาปัตย์ 1 ปี"
        >
          <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
            <span className="rounded-lg bg-gray-50 px-3 py-2">สัญญา / ใบอนุญาต / แบบบ้าน / แบบก่อสร้าง</span>
            <span className="rounded-lg bg-gray-50 px-3 py-2">วันส่งมอบบ้านและวันหมดประกัน</span>
          </div>
        </InfoPanel>
      </section>
      )}

      {printDialogOpen && (
        <div className="sales-crm-print-dialog fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto max-w-6xl rounded-2xl bg-white shadow-2xl">
            <div className="sales-crm-print-controls flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Print Preview</h3>
                <p className="text-sm text-gray-500">ตัวอย่างเอกสาร Sales Follow-up ก่อนพิมพ์</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPrintDialogOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  onClick={printSalesFollowUp}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 font-semibold text-white transition hover:bg-orange-700"
                >
                  <Printer size={17} />
                  พิมพ์เอกสาร
                </button>
              </div>
            </div>
            <CrmPrintDocument customers={filteredCustomers} summary={summary} statusFilter={statusFilter} />
          </div>
        </div>
      )}

      {contactDialogCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">
                  <PhoneCall size={14} />
                  บันทึกติดต่อ
                </div>
                <h3 className="mt-3 text-xl font-bold text-gray-900">บันทึกการติดต่อ</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {contactDialogCustomer.full_name} · {contactDialogCustomer.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContactDialogCustomer(null)}
                className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={addContactLog} className="space-y-5 p-5">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-bold uppercase text-gray-400">รายละเอียดลูกค้า</div>
                <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-2">
                  <div>
                    <div className="font-semibold text-gray-900">{contactDialogCustomer.requirements || "-"}</div>
                    <div className="mt-1 text-xs text-gray-400">ความต้องการ</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {(contactDialogCustomer.contact_logs || []).length} ครั้ง
                    </div>
                    <div className="mt-1 text-xs text-gray-400">ประวัติการติดต่อเดิม</div>
                  </div>
                </div>
              </div>

              <Field label="วันที่ติดต่อ">
                <input
                  type="date"
                  value={contactForm.date}
                  onChange={(event) => setContactForm((current) => ({ ...current, date: event.target.value }))}
                  className="form-input"
                />
              </Field>

              <Field label="บันทึกการติดต่อ *">
                <textarea
                  value={contactForm.note}
                  onChange={(event) => setContactForm((current) => ({ ...current, note: event.target.value }))}
                  required
                  className="form-input min-h-32"
                  placeholder="เช่น โทรคุยแล้ว ลูกค้าขอเช็คแบบ/งบประมาณ นัดดูหน้างาน หรือรอตัดสินใจ"
                />
              </Field>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  onClick={() => setContactDialogCustomer(null)}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-orange-600 px-5 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:opacity-70"
                >
                  {loading ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">แก้ไข Lead</h3>
                <p className="text-sm text-gray-500">อัปเดตข้อมูลลูกค้า ความต้องการ สถานะ และของแถม</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEditLead} className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="ชื่อลูกค้า *">
                  <input
                    value={editForm.full_name}
                    onChange={(event) => updateEditLead("full_name", event.target.value)}
                    required
                    className="form-input"
                  />
                </Field>
                <Field label="ชื่อเล่น">
                  <input
                    value={editForm.nickname}
                    onChange={(event) => updateEditLead("nickname", event.target.value)}
                    className="form-input"
                  />
                </Field>
                <Field label="เบอร์โทร *">
                  <input
                    value={editForm.phone}
                    onChange={(event) => updateEditLead("phone", event.target.value)}
                    required
                    className="form-input"
                  />
                </Field>
                <Field label="LINE ID">
                  <input
                    value={editForm.line_id}
                    onChange={(event) => updateEditLead("line_id", event.target.value)}
                    className="form-input"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="ระดับความสนใจ">
                  <select
                    value={editForm.interest_level}
                    onChange={(event) => updateEditLead("interest_level", event.target.value)}
                    className="form-input bg-white"
                  >
                    <option value="low">ต่ำ</option>
                    <option value="medium">กลาง</option>
                    <option value="high">สูง</option>
                  </select>
                </Field>
                <Field label="สถานะ">
                  <select
                    value={editForm.status}
                    onChange={(event) => updateEditLead("status", event.target.value)}
                    className="form-input bg-white"
                  >
                    <option value="new">ลูกค้าใหม่</option>
                    <option value="scheduled">นัดเข้าออฟฟิศ</option>
                    <option value="waiting">รอตัดสินใจ</option>
                    <option value="deposited">วางมัดจำแล้ว</option>
                    <option value="not_interested">ไม่สนใจ</option>
                  </select>
                </Field>
                <Field label="ของแถม">
                  <input
                    value={editForm.freebies}
                    onChange={(event) => updateEditLead("freebies", event.target.value)}
                    className="form-input"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="ความต้องการ">
                  <textarea
                    value={editForm.requirements}
                    onChange={(event) => updateEditLead("requirements", event.target.value)}
                    className="form-input min-h-32"
                  />
                </Field>
                <Field label="หมายเหตุ">
                  <textarea
                    value={editForm.notes}
                    onChange={(event) => updateEditLead("notes", event.target.value)}
                    className="form-input min-h-32"
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-orange-600 px-5 py-2 font-semibold text-white transition hover:bg-orange-700 disabled:opacity-70"
                >
                  {loading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingCloseLead)}
        title="ปิด Lead?"
        message={`ต้องการปิด Lead ของ ${pendingCloseLead?.full_name || "-"} ใช่ไหม ข้อมูลจะยังอยู่ใน Master Sheet แต่จะถูกซ่อนจากรายการปกติ`}
        confirmLabel="ปิด Lead"
        cancelLabel="ยกเลิก"
        loading={loading}
        onConfirm={() => {
          if (pendingCloseLead) void closeLead(pendingCloseLead);
        }}
        onCancel={() => setPendingCloseLead(null)}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function CrmPrintDocument({
  customers,
  summary,
  statusFilter,
}: {
  customers: Customer[];
  summary: SalesSummary;
  statusFilter: LeadStatus | "all";
}) {
  const printedAt = new Date().toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const filterLabel = statusFilter === "all" ? "ทุกสถานะ" : statusLabels[statusFilter];

  return (
    <div className="sales-crm-print-document bg-white p-8 text-gray-950">
      <div className="mb-6 flex items-center gap-5 border-b-2 border-gray-950 pb-5">
        <Image src="/logo.png" alt="Pichayamongkol Construction" width={180} height={56} className="h-14 w-auto object-contain" />
        <div className="min-w-0">
          <h1 className="text-2xl font-black leading-tight text-gray-950">Sales Follow-up Report</h1>
          <p className="mt-1 text-sm text-gray-600">Pichayamongkol Construction Co., Ltd.</p>
          <p className="text-sm text-gray-600">รายงานติดตามลูกค้าฝ่ายขาย | พิมพ์วันที่ {printedAt}</p>
        </div>
        <div className="ml-auto rounded-xl border border-gray-200 px-4 py-3 text-right">
          <div className="text-xs font-semibold text-gray-500">ตัวกรอง</div>
          <div className="font-bold text-gray-950">{filterLabel}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-6 gap-3">
        <PrintMetric label="ทั้งหมด" value={summary.total} />
        <PrintMetric label="ลูกค้าใหม่" value={summary.new} />
        <PrintMetric label="นัดเข้าออฟฟิศ" value={summary.scheduled} />
        <PrintMetric label="รอตัดสินใจ" value={summary.waiting} />
        <PrintMetric label="วางมัดจำแล้ว" value={summary.deposited} />
        <PrintMetric label="ไม่สนใจ" value={summary.not_interested} />
      </div>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-gray-950 text-white">
            <th className="w-10 border border-gray-300 px-2 py-2 text-left">#</th>
            <th className="w-44 border border-gray-300 px-2 py-2 text-left">ลูกค้า</th>
            <th className="w-56 border border-gray-300 px-2 py-2 text-left">ความต้องการ</th>
            <th className="w-24 border border-gray-300 px-2 py-2 text-left">ความสนใจ</th>
            <th className="w-28 border border-gray-300 px-2 py-2 text-left">สถานะ</th>
            <th className="border border-gray-300 px-2 py-2 text-left">ประวัติการติดต่อล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr>
              <td colSpan={6} className="border border-gray-300 px-3 py-8 text-center text-gray-500">ไม่มีข้อมูลตามตัวกรองนี้</td>
            </tr>
          ) : (
            customers.map((customer, index) => {
              const logs = customer.contact_logs || [];
              const latestLogs = logs.slice(-3).reverse();
              const status = getStatus(customer.status);
              const interest = getInterest(customer.interest_level);

              return (
                <tr key={customer.id} className="break-inside-avoid">
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{index + 1}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top">
                    <div className="font-bold text-gray-950">{customer.full_name}</div>
                    <div className="text-gray-600">{customer.phone}</div>
                    {customer.nickname && <div className="text-gray-500">ชื่อเล่น: {customer.nickname}</div>}
                  </td>
                  <td className="whitespace-pre-line border border-gray-300 px-2 py-2 align-top">
                    {customer.requirements || "-"}
                    {customer.notes && <div className="mt-1 text-gray-500">หมายเหตุ: {customer.notes}</div>}
                    {customer.freebies && <div className="mt-1 text-gray-500">ของแถม: {customer.freebies}</div>}
                  </td>
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{interestLabels[interest]}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{statusLabels[status]}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top">
                    {latestLogs.length > 0 ? (
                      <div className="space-y-1">
                        <div className="font-semibold text-gray-500">รวม {logs.length} ครั้ง</div>
                        {latestLogs.map((log) => (
                          <div key={`${customer.id}-print-${log.round}-${log.created_at}`}>
                            <span className="font-bold">ครั้งที่ {log.round}</span> · {log.date} · {log.note}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">ยังไม่มีประวัติ</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div className="mt-8 grid grid-cols-3 gap-8 text-center text-xs text-gray-600">
        <div>
          <div className="mb-8 border-b border-gray-400" />
          ผู้จัดทำ
        </div>
        <div>
          <div className="mb-8 border-b border-gray-400" />
          ผู้ตรวจสอบ
        </div>
        <div>
          <div className="mb-8 border-b border-gray-400" />
          ผู้อนุมัติ
        </div>
      </div>
    </div>
  );
}

function PrintMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-lg font-black text-gray-950">{value}</div>
      <div className="text-[10px] font-semibold text-gray-500">{label}</div>
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

function InfoPanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <Icon size={20} />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
