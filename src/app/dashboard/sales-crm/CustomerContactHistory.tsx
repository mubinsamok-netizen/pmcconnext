"use client";

import { useState } from "react";
import useSWR from "swr";

type ContactLog = {
  round: number;
  date: string;
  note: string;
  created_at: string;
};

async function fetchHistory(url: string): Promise<ContactLog[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("โหลดประวัติการติดต่อไม่สำเร็จ");
  return (await response.json()).data;
}

export default function CustomerContactHistory({ customerId, count }: { customerId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const { data, error, mutate } = useSWR(
    open && count > 0 ? `/api/sales-customers?view=history&customer_id=${encodeURIComponent(customerId)}&count=${count}` : null,
    fetchHistory,
  );

  if (!count) return <span className="text-sm text-gray-500">ยังไม่มีประวัติ</span>;

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {open ? "ซ่อนประวัติ" : "ดูประวัติการติดต่อ"} ({count})
      </button>
      {open && (
        error ? (
          <button type="button" onClick={() => mutate()} className="block text-xs text-red-700">
            โหลดประวัติไม่สำเร็จ ลองอีกครั้ง
          </button>
        ) : data ? (
          data.slice().reverse().map((log) => (
            <div key={`${log.round}-${log.created_at}`} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">ครั้งที่ {log.round}</span>
                <span className="text-xs text-gray-500">{log.date}</span>
              </div>
              <div className="mt-1 whitespace-pre-line text-gray-600">{log.note}</div>
            </div>
          ))
        ) : (
          <p role="status" className="text-xs text-gray-500">กำลังโหลดประวัติการติดต่อ</p>
        )
      )}
    </div>
  );
}
