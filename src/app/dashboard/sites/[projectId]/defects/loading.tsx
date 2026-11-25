export default function DefectLoading() {
  return (
    <div role="status" aria-label="กำลังโหลดข้อมูล Defect" className="space-y-5">
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map(index => (
            <div key={index} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-7 w-12 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="h-10 rounded bg-gray-100" />
          <div className="h-48 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
