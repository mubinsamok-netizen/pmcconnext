import type { DefectPhotoProgress as PhotoProgress } from "@/lib/directDriveDefectUpload";

export function DefectPhotoProgress({ files }: { files: PhotoProgress[] }) {
  if (!files.length) return null;
  return (
    <ul className="space-y-2 rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900" aria-label="ความคืบหน้าอัปโหลดรูป Defect">
      {files.map((file, index) => (
        <li key={index} className="space-y-1">
          <p className="break-all font-semibold">{file.name}</p>
          {file.stage === "upload" ? (
            <>
              <p>ส่งไป Google Drive {file.percent}%</p>
              <progress className="w-full" aria-label={file.name} value={file.percent} max={100} />
            </>
          ) : (
            <p role="status">{file.stage === "prepare" ? "กำลังเตรียมรูป WebP" : "กำลังยืนยันรูปและบันทึกรายการ"}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
