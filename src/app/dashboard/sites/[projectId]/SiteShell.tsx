import type { ComponentType, ReactNode } from "react";

export type SitePageProject = {
  project_id: string;
  name: string;
  client?: string;
  status?: string;
};

export function SiteShell({
  project,
  eyebrow,
  title,
  description,
  icon: Icon,
  wide = false,
  children,
}: {
  project: SitePageProject;
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`${wide ? "max-w-[1680px]" : "max-w-6xl"} mx-auto space-y-6`}>
      <div className="schedule-screen-only flex flex-col gap-1">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600">
            <Icon size={16} />
            {eyebrow}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">{title}</h2>
          <p className="text-gray-500">{description}</p>
        </div>
      </div>

      {children || (
        <div className="schedule-screen-only bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <h3 className="font-bold text-gray-900">โครงหน้านี้พร้อมต่อรายละเอียด</h3>
          <p className="text-sm text-gray-500 mt-2">ตอนนี้เป็น placeholder เพื่อจัด navigation และ context ของไซต์ให้ครบก่อน</p>
        </div>
      )}
    </div>
  );
}
