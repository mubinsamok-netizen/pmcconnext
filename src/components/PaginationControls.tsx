"use client";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
};

export default function PaginationControls({ page, pageSize, total, onPageChange, label }: PaginationControlsProps) {
  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const buttonClass = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <p aria-live="polite" className="text-sm text-gray-600">
        แสดง {start}-{end} จาก {total} รายการ
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>
          ก่อนหน้า
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          หน้า
          <select
            aria-label="เลือกหน้า"
            value={page}
            onChange={(event) => onPageChange(Number(event.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 font-bold text-gray-700"
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1}</option>
            ))}
          </select>
          / {pageCount}
        </label>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className={buttonClass}>
          ถัดไป
        </button>
      </div>
    </nav>
  );
}
