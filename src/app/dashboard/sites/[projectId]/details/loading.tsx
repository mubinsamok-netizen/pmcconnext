export default function ProjectDetailsLoading() {
  return <div role="status" aria-label="กำลังเตรียมรายละเอียดโครงการ" className="mx-auto w-full max-w-[1680px] space-y-6">
    <div aria-hidden="true" className="motion-safe:animate-pulse space-y-6">
      <div className="h-8 w-60 rounded-lg bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="h-48 bg-gray-200" /><div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">{[0,1,2,3,4,5].map((item) => <div key={item} className="h-24 rounded-xl bg-gray-100" />)}</div></div>
        <div className="space-y-6"><div className="h-64 rounded-2xl bg-gray-100" /><div className="h-48 rounded-2xl bg-gray-100" /></div>
      </div>
    </div>
  </div>;
}
