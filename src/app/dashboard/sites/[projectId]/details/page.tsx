import {
  Banknote,
  CalendarDays,
  FileText,
  FolderOpen,
  Info,
  Link2,
  MapPin,
  Server,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import type { ComponentType } from "react";
import { getMasterProject } from "@/lib/masterProjects";
import { SiteShell } from "../SiteShell";

export const dynamic = "force-dynamic";

function extractDriveFileId(url?: string) {
  if (!url) return "";
  return url.match(/\/d\/([^/]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1] || "";
}

function getCoverSrc(project: { cover_file_id?: string; cover_url?: string }) {
  const fileId = project.cover_file_id || extractDriveFileId(project.cover_url);
  if (fileId) return `/api/drive/files/${encodeURIComponent(fileId)}`;
  return project.cover_url || "";
}

export default async function SiteDetailsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getMasterProject(projectId);
  const coverSrc = getCoverSrc(project);

  return (
    <SiteShell
      project={project}
      eyebrow="Project Details"
      title="รายละเอียดโครงการ"
      description="ข้อมูลหลักของไซต์ที่บันทึกจากขั้นตอนสร้างโครงการ"
      icon={Info}
      wide
    >
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-6">
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-200 relative">
            {coverSrc ? (
              <Image src={coverSrc} alt={project.name} fill unoptimized className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                <FileText size={72} />
              </div>
            )}
            <div className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-orange-600 shadow-sm">
              {project.status || "Planning"}
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-2xl font-extrabold text-gray-900">{project.name}</h3>
              <p className="mt-2 text-gray-500">{project.description || "ยังไม่มีรายละเอียดเพิ่มเติม"}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoCard icon={FileText} label="รหัสโครงการ" value={project.project_id} />
              <InfoCard icon={FileText} label="ประเภทโครงการ" value={project.project_type || "-"} />
              <InfoCard icon={UserRound} label="ลูกค้า / เจ้าของโครงการ" value={project.client || "-"} />
              <InfoCard icon={FileText} label="เลขที่สัญญา" value={project.contract_no || "-"} />
              <InfoCard icon={CalendarDays} label="วันเริ่มโครงการ" value={project.start_date || "-"} />
              <InfoCard icon={CalendarDays} label="วันสิ้นสุดตามแผน" value={project.end_date || "-"} />
              <InfoCard icon={Banknote} label="มูลค่าสัญญา" value={formatMoney(project.budget)} />
              <InfoCard icon={MapPin} label="ที่ตั้ง" value={[project.address, project.district, project.province].filter(Boolean).join(" / ") || "-"} />
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h4 className="font-bold text-gray-900 mb-4">ทีมรับผิดชอบ</h4>
            <div className="space-y-3">
              <PersonRow label="ผู้จัดการโครงการ (PM)" value={project.pm_name || "-"} />
              <PersonRow label="วิศวกรสนาม (SE)" value={project.se_name || "-"} />
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h4 className="font-bold text-gray-900 mb-4">ระบบข้อมูลของไซต์</h4>
            <div className="space-y-3">
              <SystemRow icon={Server} label="Google Sheet ID" value={project.site_sheet_id || "-"} />
              <SystemRow icon={FolderOpen} label="Google Drive Folder ID" value={project.drive_folder_id || "-"} />
              <SystemRow icon={Info} label="Sales Stage" value={project.sales_stage || "deposited"} />
              <SystemRow icon={Info} label="Deposit Status" value={project.deposit_status || "deposit_paid"} />
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h4 className="font-bold text-gray-900 mb-4">ลิงก์สำคัญ</h4>
            {project.site_link ? (
              <a href={project.site_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700">
                <Link2 size={16} />
                เปิด Google Maps
              </a>
            ) : (
              <p className="text-sm text-gray-500">ยังไม่ได้บันทึกลิงก์แผนที่</p>
            )}
          </section>
        </aside>
      </div>
    </SiteShell>
  );
}

function formatMoney(value?: string) {
  const amount = Number(value || 0);
  if (!amount) return "-";
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(amount);
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <Icon size={16} />
        {label}
      </div>
      <p className="mt-2 font-bold text-gray-900 break-words">{value}</p>
    </div>
  );
}

function PersonRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-bold text-gray-900">{value}</p>
    </div>
  );
}

function SystemRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <Icon size={17} className="mt-0.5 text-gray-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900 break-all">{value}</p>
      </div>
    </div>
  );
}
