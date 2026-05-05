import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft, Building2, CalendarClock, FileText, FolderKanban, PhoneCall, UserRound } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import { isAdminRole } from "@/lib/authz";
import { findAllMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

export const dynamic = "force-dynamic";

type Customer = Record<string, string | number | undefined> & {
  id: string;
  full_name?: string;
  nickname?: string;
  phone?: string;
  line_id?: string;
  address?: string;
  requirements?: string;
  notes?: string;
  freebies?: string;
  contact_logs_json?: string;
  project_id?: string;
  status?: string;
};

type Project = Record<string, string | number | undefined> & {
  project_id: string;
  name?: string;
  client?: string;
  sales_customer_id?: string;
};

function parseLogs(value?: string) {
  if (!value) return [];
  try {
    const logs = JSON.parse(value);
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

function buildProjectCreateLink(customer: Customer) {
  const params = new URLSearchParams({
    sales_customer_id: customer.id,
    client: String(customer.full_name || ""),
    description: [customer.requirements, customer.notes, customer.freebies ? `ของแถม: ${customer.freebies}` : ""]
      .filter(Boolean)
      .join("\n"),
    address: String(customer.address || ""),
    deposit_status: "deposit_paid",
  });
  return `/dashboard/projects/new?${params.toString()}`;
}

function getStatusLabel(status?: string) {
  if (status === "deposited") return "วางมัดจำแล้ว";
  if (status === "scheduled") return "นัดเข้าออฟฟิศ";
  if (status === "waiting") return "รอตัดสินใจ";
  if (status === "not_interested") return "ไม่สนใจ";
  return "ลูกค้าใหม่";
}

export default async function SalesCustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const decodedCustomerId = decodeURIComponent(customerId);
  const session = await getServerSession(authOptions);
  const isAdmin = isAdminRole(session?.user?.role);

  await ensureMasterSchema();
  const [customers, projects] = await Promise.all([
    findAllMaster("Customers") as unknown as Promise<Customer[]>,
    findAllMaster("Projects") as unknown as Promise<Project[]>,
  ]);
  const customer = customers.find((item) => item.id === decodedCustomerId && item.active !== "FALSE");
  if (!customer) notFound();

  const project = projects.find((item) => (
    item.active !== "FALSE" &&
    (item.project_id === customer.project_id || item.sales_customer_id === customer.id)
  ));
  const logs = parseLogs(String(customer.contact_logs_json || "")).slice().reverse();
  const displayName = `${customer.full_name || "-"}${customer.nickname ? ` (${customer.nickname})` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/sales-crm" className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 transition hover:text-gray-900">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600">
              <UserRound size={16} />
              รายละเอียดลูกค้า Sales CRM
            </div>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">{displayName}</h2>
            <p className="text-gray-500">ตรวจข้อมูลลูกค้าที่วางมัดจำ ก่อนเปิดหรือเข้าหน้าโครงการ</p>
          </div>
        </div>

        {project ? (
          <Link href={`/dashboard/sites/${encodeURIComponent(project.project_id)}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white transition hover:bg-orange-700">
            <FolderKanban size={18} />
            เปิดโครงการ
          </Link>
        ) : (
          <Link
            href={isAdmin ? buildProjectCreateLink(customer) : "#"}
            aria-disabled={!isAdmin}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-bold text-white transition ${isAdmin ? "bg-orange-600 hover:bg-orange-700" : "pointer-events-none bg-gray-300"}`}
          >
            <Building2 size={18} />
            สร้างโครงการ
          </Link>
        )}
      </div>

      {!isAdmin && !project && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
          เฉพาะ Admin เท่านั้นที่สร้างโครงการจากลูกค้ารายนี้ได้
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-orange-600">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">ข้อมูลลูกค้าและความต้องการ</h3>
              <p className="text-sm text-gray-500">ข้อมูลจาก Sales Follow-up ก่อนส่งต่อโครงการ</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Info label="สถานะ" value={getStatusLabel(String(customer.status || ""))} />
            <Info label="เบอร์โทร" value={String(customer.phone || "-")} icon={<PhoneCall size={16} />} />
            <Info label="LINE ID" value={String(customer.line_id || "-")} />
            <Info label="ที่อยู่ / สถานที่" value={String(customer.address || "-")} />
          </div>

          <div className="mt-5 space-y-4">
            <TextBlock label="ความต้องการ" value={String(customer.requirements || "-")} />
            <TextBlock label="หมายเหตุฝ่ายขาย" value={String(customer.notes || "-")} />
            <TextBlock label="ของแถม" value={String(customer.freebies || "-")} />
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-gray-700">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">สถานะโครงการ</h3>
                <p className="text-sm text-gray-500">{project ? "เปิดโครงการแล้ว" : "ยังไม่ได้สร้างโครงการ"}</p>
              </div>
            </div>
            {project ? (
              <div className="rounded-xl bg-orange-50 p-4">
                <div className="text-sm font-semibold text-orange-700">{project.project_id}</div>
                <div className="mt-1 font-extrabold text-gray-900">{project.name || "-"}</div>
                <Link href={`/dashboard/sites/${encodeURIComponent(project.project_id)}/lifecycle`} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-orange-700 hover:text-orange-800">
                  <CalendarClock size={15} />
                  ไปที่รายละเอียดงานและประกัน
                </Link>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Admin สามารถกดสร้างโครงการ แล้วให้พนักงานกรอกชื่อโครงการเองในหน้าถัดไป</div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-gray-900">ประวัติการติดต่อ</h3>
            <div className="mt-4 space-y-3">
              {logs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-400">ยังไม่มีประวัติการติดต่อ</div>
              ) : (
                logs.map((log: Record<string, string | number>) => (
                  <div key={`${log.round}-${log.created_at}`} className="rounded-xl bg-gray-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-gray-900">ครั้งที่ {log.round}</span>
                      <span className="text-xs font-semibold text-gray-400">{log.date}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-gray-600">{log.note}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold text-gray-700">{label}</div>
      <div className="mt-2 min-h-14 whitespace-pre-line rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">{value}</div>
    </div>
  );
}
