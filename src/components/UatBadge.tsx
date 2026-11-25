import { UAT_LABEL } from "@/lib/appVersion";

export default function UatBadge() {
  return (
    <span className="inline-flex shrink-0 whitespace-nowrap rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
      {UAT_LABEL}
    </span>
  );
}
