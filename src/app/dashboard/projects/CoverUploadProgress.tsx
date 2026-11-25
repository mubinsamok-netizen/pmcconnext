export default function CoverUploadProgress({ percent }: { percent: number | null }) {
  return (
    <div role="status" className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
      <p>{percent === null ? "กำลังเตรียมภาพปก" : percent === 100 ? "ส่งภาพปกแล้ว กำลังบันทึกไซต์งาน" : `กำลังส่งภาพปก ${percent}%`}</p>
      {percent !== null && <progress className="w-full accent-orange-600" aria-label="ความคืบหน้าการส่งภาพปก" max={100} value={percent} />}
    </div>
  );
}
