import DataSkeleton from "@/components/DataSkeleton";

type Variant = "page" | "metrics" | "table" | "form";

export default function PaymentRequestsSkeleton({ variant = "page" }: { variant?: Variant }) {
  if (variant === "table") return <DataSkeleton rows={4} label="กำลังเตรียมรายการเบิกเงิน" />;
  if (variant === "metrics") return (
    <div role="status" aria-label="กำลังเตรียมยอดเบิกเงิน" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => <div key={item} aria-hidden="true" className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 motion-safe:animate-pulse dark:border-slate-800 dark:bg-slate-900">
        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-8 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-slate-800" />
      </div>)}
    </div>
  );
  if (variant === "form") return (
    <div role="status" aria-label="กำลังเตรียมแบบฟอร์มเบิกเงิน" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div aria-hidden="true" className="grid gap-4 motion-safe:animate-pulse sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-11 rounded-xl bg-gray-100 dark:bg-slate-800" />)}
      </div>
      <DataSkeleton rows={3} label="กำลังเตรียมข้อมูลผู้รับเงิน" />
    </div>
  );
  return <div className="space-y-5"><PaymentRequestsSkeleton variant="metrics" /><PaymentRequestsSkeleton variant="table" /></div>;
}
