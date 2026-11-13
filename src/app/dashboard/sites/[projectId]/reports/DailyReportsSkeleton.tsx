export default function DailyReportsSkeleton({ panel = false }: { panel?: boolean }) {
  return (
    <div role="status" aria-label="กำลังเตรียมรายงาน" className="space-y-5 motion-safe:animate-pulse">
      {!panel && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
              <div className="h-10 w-10 rounded-xl bg-gray-100" />
              <div className="h-7 w-16 rounded bg-gray-100" />
              <div className="h-4 w-28 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      )}
      <div className={`grid gap-5 ${panel ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1.1fr_1.9fr]"}`}>
        {Array.from({ length: panel ? 1 : 2 }, (_, index) => (
          <div key={index} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="h-5 w-36 rounded bg-gray-100" />
            {Array.from({ length: 4 }, (_, row) => <div key={row} className="h-9 rounded bg-gray-100" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
