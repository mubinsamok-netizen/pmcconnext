import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate, type IconType, type DashboardAction, type RecentItem } from "./overviewData";

export function InfoCard({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "red";
}) {
  const toneClass = tone === "red" ? "border-red-100 bg-red-50 text-red-700" : "border-gray-100 bg-gray-50 text-gray-950";
  return (
    <div className={`min-w-0 rounded-2xl border p-2.5 ${toneClass}`}>
      <p className="truncate text-[11px] font-extrabold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold sm:text-base">{value}</p>
    </div>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "gray",
  href,
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
  tone?: "gray" | "orange" | "green" | "red" | "blue";
  href?: string;
}) {
  const toneClass = {
    gray: "bg-white text-gray-950 border-gray-200",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    red: "bg-red-50 text-red-800 border-red-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
  }[tone];
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold text-current opacity-65">{label}</p>
        <Icon size={18} className="shrink-0 opacity-70" />
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs font-semibold opacity-65">{detail}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`block rounded-2xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${toneClass}`}>
      {content}
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  href,
  actionLabel,
  children,
}: {
  title: string;
  icon: IconType;
  href: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <Icon size={18} />
          </span>
          <h3 className="text-lg font-extrabold text-gray-950">{title}</h3>
        </div>
        <Link href={href} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
          {actionLabel}
        </Link>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ActionRow({ action }: { action: DashboardAction }) {
  const toneClass = {
    red: "bg-red-50 text-red-700 border-red-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
  }[action.tone];
  const Icon = action.icon;

  return (
    <Link href={action.href} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 transition hover:border-orange-200 hover:bg-orange-50/40">
      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block font-extrabold text-gray-950">{action.title}</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-gray-500">{action.detail}</span>
      </span>
    </Link>
  );
}

export function RecentRow({ item }: { item: RecentItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 transition hover:border-orange-200 hover:bg-orange-50/40">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-orange-700 shadow-sm">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold text-gray-950">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">{item.detail}</span>
      </span>
      <span className="hidden shrink-0 text-xs font-bold text-gray-400 sm:block">{formatDate(item.date) || "-"}</span>
    </Link>
  );
}

export function SmallMetric({
  label,
  value,
  suffix,
  tone = "gray",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "gray" | "orange" | "green" | "red";
}) {
  const toneClass = {
    gray: "bg-gray-50 text-gray-950 border-gray-100",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    red: "bg-red-50 text-red-800 border-red-100",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="truncate text-xs font-extrabold opacity-65">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold tracking-tight">
        {value}
        {suffix && <span className="ml-1 text-xs font-bold opacity-60">{suffix}</span>}
      </p>
    </div>
  );
}

export function InfoStrip({
  icon: Icon,
  label,
  value,
}: {
  icon: IconType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gray-50 p-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-orange-600" />
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-gray-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-gray-950">{value}</p>
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-sm font-semibold text-gray-500">
      {text}
    </div>
  );
}

export function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: IconType }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
      <Icon size={16} />
      {label}
    </Link>
  );
}

export function ExternalQuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: IconType }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
      <Icon size={16} />
      {label}
      <ExternalLink size={14} />
    </a>
  );
}

export function ResourceRow({
  icon: Icon,
  label,
  value,
  actionHref,
  actionLabel,
}: {
  icon: IconType;
  label: string;
  value: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gray-50 p-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-orange-600" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-gray-900">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-500">{value}</p>
        {actionHref ? (
          <a href={actionHref} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
            {actionLabel || "เปิดลิงก์"}
            <ExternalLink size={13} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
