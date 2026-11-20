export default function ScheduleSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 p-3">
      <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid grid-cols-[minmax(6rem,1fr)_2fr] gap-4 rounded-lg bg-gray-50 px-3 py-3">
            <div className="h-3 max-w-48 rounded bg-gray-200" />
            <div className="h-3 w-2/3 max-w-72 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
