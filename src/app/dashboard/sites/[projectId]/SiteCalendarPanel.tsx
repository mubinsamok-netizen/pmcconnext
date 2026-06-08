"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Layers3,
} from "lucide-react";

export type SiteCalendarEvent = {
  id: string;
  date: string;
  title: string;
  detail: string;
  source:
    | "โครงการ"
    | "แผนงาน"
    | "Milestone"
    | "ตัดสินใจ"
    | "QC"
    | "Defect"
    | "VO"
    | "บัญชี"
    | "Issue"
    | "วัสดุ"
    | "Memo"
    | "บันทึก"
    | "รายงาน"
    | "เอกสาร"
    | "Lifecycle"
    | "ประกัน";
  href: string;
  tone: "blue" | "green" | "orange" | "red" | "slate";
  time?: string;
};

type CalendarMode = "day" | "week" | "month";

const dayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const modeLabels: Array<{ value: CalendarMode; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const toneClasses = {
  blue: "border-blue-100 bg-blue-50 text-blue-800",
  green: "border-emerald-100 bg-emerald-50 text-emerald-800",
  orange: "border-orange-100 bg-orange-50 text-orange-800",
  red: "border-red-100 bg-red-50 text-red-800",
  slate: "border-slate-100 bg-slate-50 text-slate-700",
};

const dotClasses = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
};

const sourceClass = {
  โครงการ: "bg-orange-50 text-orange-700",
  แผนงาน: "bg-blue-50 text-blue-700",
  Milestone: "bg-emerald-50 text-emerald-700",
  ตัดสินใจ: "bg-orange-50 text-orange-700",
  QC: "bg-cyan-50 text-cyan-700",
  Defect: "bg-red-50 text-red-700",
  VO: "bg-violet-50 text-violet-700",
  บัญชี: "bg-indigo-50 text-indigo-700",
  Issue: "bg-rose-50 text-rose-700",
  วัสดุ: "bg-lime-50 text-lime-700",
  Memo: "bg-amber-50 text-amber-700",
  บันทึก: "bg-slate-100 text-slate-700",
  รายงาน: "bg-gray-100 text-gray-700",
  เอกสาร: "bg-sky-50 text-sky-700",
  Lifecycle: "bg-teal-50 text-teal-700",
  ประกัน: "bg-fuchsia-50 text-fuchsia-700",
};

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function sameMonth(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function buildMonthDays(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function buildWeekDays(anchor: Date) {
  const first = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

function groupEvents(events: SiteCalendarEvent[]) {
  const grouped = new Map<string, SiteCalendarEvent[]>();
  events.forEach((event) => {
    const list = grouped.get(event.date) || [];
    list.push(event);
    grouped.set(event.date, list);
  });
  grouped.forEach((list) => {
    list.sort((a, b) => {
      const toneOrder = { red: 0, orange: 1, blue: 2, green: 3, slate: 4 };
      return toneOrder[a.tone] - toneOrder[b.tone] || a.title.localeCompare(b.title, "th");
    });
  });
  return grouped;
}

function eventSummary(events: SiteCalendarEvent[], initialDate: string) {
  const today = initialDate;
  const upcoming = events.filter((event) => event.date >= today).length;
  const urgent = events.filter((event) => event.tone === "red" || event.tone === "orange").length;
  const todayCount = events.filter((event) => event.date === today).length;
  return { upcoming, urgent, todayCount };
}

export default function SiteCalendarPanel({
  events,
  projectId,
  initialDate,
}: {
  events: SiteCalendarEvent[];
  projectId: string;
  initialDate: string;
}) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [cursorDay, setCursorDay] = useState(initialDate);
  const groupedEvents = useMemo(() => groupEvents(events), [events]);
  const selectedDate = parseDay(cursorDay);
  const monthDays = useMemo(() => buildMonthDays(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const selectedEvents = groupedEvents.get(cursorDay) || [];
  const summary = useMemo(() => eventSummary(events, initialDate), [events, initialDate]);

  const move = (direction: -1 | 1) => {
    const next = mode === "month" ? addMonths(selectedDate, direction) : addDays(selectedDate, direction * (mode === "week" ? 7 : 1));
    setCursorDay(toDayKey(next));
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gradient-to-r from-white via-white to-emerald-50/70 p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <CalendarDays size={22} />
            </span>
            <div>
              <h3 className="text-xl font-extrabold text-gray-950">ปฏิทินภาพรวมไซต์</h3>
              <p className="mt-1 text-sm font-semibold text-gray-500">งาน, เอกสาร, การอนุมัติ และกำหนดติดตามจากข้อมูลในระบบ</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => move(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50"
              aria-label="ก่อนหน้า"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setCursorDay(initialDate)}
              className="h-9 rounded-xl border border-gray-200 px-3 text-sm font-extrabold text-gray-700 transition hover:bg-gray-50"
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50"
              aria-label="ถัดไป"
            >
              <ChevronRight size={18} />
            </button>
            <div className="ml-0 rounded-2xl bg-gray-100 p-1 lg:ml-2">
              {modeLabels.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={`h-8 rounded-xl px-3 text-sm font-extrabold transition ${
                    mode === item.value ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <CalendarStat icon={Layers3} label="ทั้งหมด" value={`${events.length} รายการ`} />
          <CalendarStat icon={Clock3} label="วันนี้" value={`${summary.todayCount} รายการ`} />
          <CalendarStat icon={AlertTriangle} label="ต้องจับตา" value={`${summary.urgent} รายการ`} tone={summary.urgent ? "orange" : "green"} />
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 p-4 lg:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">{projectId}</p>
              <h4 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-950">{formatMonth(selectedDate)}</h4>
            </div>
            <div className="hidden items-center gap-2 text-xs font-bold text-gray-500 md:flex">
              <LegendDot tone="blue" label="แผนงาน" />
              <LegendDot tone="orange" label="รออนุมัติ" />
              <LegendDot tone="red" label="เลยกำหนด" />
              <LegendDot tone="green" label="เสร็จแล้ว" />
            </div>
          </div>

          {mode === "month" ? (
            <MonthGrid
              days={monthDays}
              monthDate={selectedDate}
              todayKey={initialDate}
              selectedKey={cursorDay}
              groupedEvents={groupedEvents}
              onSelect={setCursorDay}
            />
          ) : mode === "week" ? (
            <WeekGrid
              days={weekDays}
              todayKey={initialDate}
              selectedKey={cursorDay}
              groupedEvents={groupedEvents}
              onSelect={setCursorDay}
            />
          ) : (
            <DayAgenda date={selectedDate} events={selectedEvents} emptyText="วันนี้ยังไม่มีรายการจากระบบ" />
          )}
        </div>

        <aside className="border-t border-gray-100 bg-gray-50 p-4 xl:border-l xl:border-t-0 lg:p-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-600">Selected Day</p>
                <h4 className="mt-1 text-lg font-extrabold text-gray-950">{formatShortDate(selectedDate)}</h4>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-extrabold text-gray-600">{selectedEvents.length} รายการ</span>
            </div>
            <div className="mt-4 space-y-2">
              {selectedEvents.length > 0 ? (
                selectedEvents.map((event) => <EventLink key={event.id} event={event} />)
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-500">
                  ไม่มีรายการในวันนี้
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-extrabold text-gray-950">
              <CheckCircle2 size={18} className="text-emerald-600" />
              รายการถัดไป
            </div>
            <div className="mt-3 space-y-2">
              {events
                .filter((event) => event.date >= initialDate)
                .slice(0, 5)
                .map((event) => (
                  <EventLink key={`upcoming-${event.id}`} event={event} compact />
                ))}
              {summary.upcoming === 0 ? (
                <div className="rounded-xl bg-gray-50 p-3 text-xs font-semibold text-gray-500">ยังไม่มีรายการถัดไปจากข้อมูลในระบบ</div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CalendarStat({
  icon: Icon,
  label,
  value,
  tone = "gray",
}: {
  icon: typeof Layers3;
  label: string;
  value: string;
  tone?: "gray" | "orange" | "green";
}) {
  const toneClass = tone === "orange" ? "bg-orange-50 text-orange-800" : tone === "green" ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-800";
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${toneClass}`}>
      <Icon size={17} className="shrink-0 opacity-70" />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-extrabold opacity-60">{label}</p>
        <p className="truncate text-sm font-extrabold">{value}</p>
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  monthDate,
  todayKey,
  selectedKey,
  groupedEvents,
  onSelect,
}: {
  days: Date[];
  monthDate: Date;
  todayKey: string;
  selectedKey: string;
  groupedEvents: Map<string, SiteCalendarEvent[]>;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {dayLabels.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-extrabold text-gray-500">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayKey = toDayKey(day);
          const list = groupedEvents.get(dayKey) || [];
          const isToday = dayKey === todayKey;
          const isSelected = dayKey === selectedKey;
          const muted = !sameMonth(day, monthDate);
          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onSelect(dayKey)}
              className={`min-h-[112px] border-b border-r border-gray-100 p-2 text-left transition last:border-r-0 hover:bg-emerald-50/40 ${
                muted ? "bg-slate-50/70 text-gray-300" : "bg-white text-gray-700"
              } ${isSelected ? "ring-2 ring-inset ring-emerald-400" : ""}`}
            >
              <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-extrabold ${isToday ? "bg-red-500 text-white" : ""}`}>
                {day.getDate()}
              </span>
              <div className="mt-2 space-y-1">
                {list.slice(0, 3).map((event) => (
                  <span key={event.id} className={`block truncate rounded-md border px-2 py-1 text-[11px] font-extrabold ${toneClasses[event.tone]}`}>
                    {event.title}
                  </span>
                ))}
                {list.length > 3 ? (
                  <span className="block rounded-md bg-gray-100 px-2 py-1 text-[11px] font-extrabold text-gray-500">+{list.length - 3} เพิ่มเติม</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  days,
  todayKey,
  selectedKey,
  groupedEvents,
  onSelect,
}: {
  days: Date[];
  todayKey: string;
  selectedKey: string;
  groupedEvents: Map<string, SiteCalendarEvent[]>;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {days.map((day) => {
        const dayKey = toDayKey(day);
        const list = groupedEvents.get(dayKey) || [];
        return (
          <button
            key={dayKey}
            type="button"
            onClick={() => onSelect(dayKey)}
            className={`min-h-[220px] rounded-2xl border p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/30 ${
              dayKey === selectedKey ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-gray-400">{dayLabels[day.getDay()]}</span>
              <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-extrabold ${dayKey === todayKey ? "bg-red-500 text-white" : "bg-gray-100 text-gray-700"}`}>
                {day.getDate()}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {list.length > 0 ? list.map((event) => <EventChip key={event.id} event={event} />) : (
                <p className="rounded-xl border border-dashed border-gray-200 p-3 text-xs font-semibold text-gray-400">ว่าง</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DayAgenda({ date, events, emptyText }: { date: Date; events: SiteCalendarEvent[]; emptyText: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Day View</p>
          <h4 className="mt-1 text-xl font-extrabold text-gray-950">{formatShortDate(date)}</h4>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-gray-600 shadow-sm">{events.length} รายการ</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {events.length > 0 ? events.map((event) => <EventLink key={event.id} event={event} />) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-sm font-semibold text-gray-500">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function EventChip({ event }: { event: SiteCalendarEvent }) {
  return (
    <span className={`block rounded-xl border px-2.5 py-2 text-xs font-extrabold leading-snug ${toneClasses[event.tone]}`}>
      <span className="block truncate">{event.title}</span>
      <span className="mt-1 block truncate opacity-65">{event.source}</span>
    </span>
  );
}

function EventLink({ event, compact = false }: { event: SiteCalendarEvent; compact?: boolean }) {
  return (
    <Link
      href={event.href}
      className={`group flex items-start gap-3 rounded-2xl border bg-white transition hover:border-emerald-200 hover:bg-emerald-50/40 ${compact ? "p-3" : "p-3.5"}`}
    >
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClasses[event.tone]}`} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${sourceClass[event.source]}`}>{event.source}</span>
          {event.time ? <span className="text-[11px] font-bold text-gray-400">{event.time}</span> : null}
        </span>
        <span className={`mt-1 block font-extrabold text-gray-950 ${compact ? "truncate text-sm" : "text-sm leading-snug"}`}>{event.title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">{event.detail}</span>
      </span>
      <ExternalLink size={14} className="mt-1 shrink-0 text-gray-300 transition group-hover:text-emerald-600" />
    </Link>
  );
}

function LegendDot({ tone, label }: { tone: SiteCalendarEvent["tone"]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotClasses[tone]}`} />
      {label}
    </span>
  );
}
