export default function OverviewSkeleton({ label, cards = false, compact = false }: { label: string; cards?: boolean; compact?: boolean }) {
  return (
    <div role="status" aria-label={label} className={cards ? "grid grid-cols-2 gap-3 lg:grid-cols-6" : "rounded-2xl border border-gray-100 bg-gray-50 p-4"}>
      {Array.from({ length: cards ? 6 : 1 }, (_, index) => <div key={index} aria-hidden="true" className={`motion-safe:animate-pulse rounded-xl bg-gray-200 ${compact ? "h-8" : cards ? "h-28" : "h-40"}`} />)}
    </div>
  );
}
