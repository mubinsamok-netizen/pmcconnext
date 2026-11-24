export default function DataSkeleton({ rows = 4, label = "กำลังเตรียมข้อมูล" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="w-full space-y-3 p-4">
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 rounded-xl border border-gray-100 p-4 dark:border-slate-800">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
