"use client";

import { RefreshCw } from "lucide-react";

export default function FileSourceStatus({ label, loading, error, onRetry }: {
  label: string;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  if (!loading && !error) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600">
      <span className={error && !loading ? "text-red-700" : ""}>
        {loading ? `กำลังโหลด${label}… รายการที่พร้อมใช้งานได้ก่อน` : error}
      </span>
      {error && !loading && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-semibold"><RefreshCw size={14} />ลองโหลด{label}อีกครั้ง</button>}
    </div>
  );
}
