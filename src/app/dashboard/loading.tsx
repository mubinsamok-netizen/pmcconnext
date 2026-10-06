export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-6xl space-y-5">
      <p className="text-sm text-gray-500 dark:text-slate-400">กำลังโหลดข้อมูล...</p>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="h-8 w-56 rounded-lg bg-gray-200 dark:bg-slate-800" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 rounded-2xl bg-gray-100 dark:bg-slate-900" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-gray-100 dark:bg-slate-900" />
      </div>
    </div>
  );
}
