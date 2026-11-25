export function ProjectHealthSkeleton() {
  return (
    <div role="status" aria-label="กำลังเตรียมความคืบหน้า" className="space-y-5">
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-5 w-40 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-700" />
          <div className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

export default function ProjectsSkeleton() {
  return (
    <div role="status" aria-label="กำลังเตรียมรายการไซต์งาน" className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} aria-hidden="true" className="grid overflow-hidden rounded-[22px] border border-slate-200 bg-white motion-safe:animate-pulse xl:min-h-[210px] xl:grid-cols-[380px_minmax(420px,1fr)_310px]">
          <div className="h-[190px] bg-slate-200 dark:bg-slate-700 sm:h-[230px] xl:h-full" />
          <div className="space-y-5 p-5 xl:p-6">
            <div className="h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="space-y-4 bg-slate-50 p-5 dark:bg-slate-900 xl:p-6">
            <div className="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}
