"use client";

import { CheckCircle2, ExternalLink, FileText, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";
import { VO_TYPE_LABELS, asVoType, formatMoney, formatThaiDate } from "@/lib/variationOrders";

type VoItem = {
  item_no?: string | number;
  description?: string;
  unit?: string;
  quantity?: string | number;
  unit_price?: string | number;
  amount?: string | number;
};

type ApprovalData = {
  project: {
    project_id: string;
    name: string;
    client?: string;
  };
  vo: {
    vo_id: string;
    vo_type?: string;
    title?: string;
    description?: string;
    status?: string;
    client_name?: string;
    approval_deadline?: string;
    grand_total?: string | number;
    net_payable?: string | number;
    extension_days?: string | number;
    customer_approved_at?: string;
    customer_approved_by?: string;
    customer_approval_note?: string;
    pdf_url?: string;
    approval_pdf_url?: string;
    items: VoItem[];
  };
};

export default function PublicVariationOrderApprovalClient({ projectId, token }: { projectId: string; token: string }) {
  const endpoint = `/api/variation-order-approval/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const [data, setData] = useState<ApprovalData | null>(null);
  const [approvedBy, setApprovedBy] = useState("");
  const [note, setNote] = useState("อนุมัติให้ดำเนินงานเพิ่ม-ลดตามเอกสารนี้");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(endpoint)
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "เปิดรายการอนุมัติ VO ไม่สำเร็จ");
        if (!active) return;
        setData(json.data);
        setApprovedBy(json.data?.vo?.customer_approved_by || json.data?.vo?.client_name || json.data?.project?.client || "");
        setNote(json.data?.vo?.customer_approval_note || "อนุมัติให้ดำเนินงานเพิ่ม-ลดตามเอกสารนี้");
      })
      .catch((fetchError: unknown) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "เปิดรายการอนุมัติ VO ไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const submitApproval = async () => {
    if (!approvedBy.trim()) {
      setError("กรุณาระบุชื่อผู้อนุมัติ");
      return;
    }
    if (!accepted) {
      setError("กรุณาติ๊กยืนยันว่าได้ตรวจสอบรายการ ราคา และระยะเวลาที่ขอดำเนินการแล้ว");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved_by: approvedBy,
          approval_note: note,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "บันทึกอนุมัติ VO ไม่สำเร็จ");
      setData(json.data);
      setAccepted(true);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกอนุมัติ VO ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto flex max-w-2xl items-center justify-center rounded-2xl bg-white p-10 text-slate-500 shadow-sm">
          <Loader2 className="mr-2 animate-spin" size={18} /> กำลังเปิดเอกสาร VO
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <div className="text-lg font-black text-red-700">{error}</div>
          <p className="mt-2 text-sm text-slate-500">กรุณาติดต่อทีมงานโครงการเพื่อตรวจสอบลิงก์อีกครั้ง</p>
        </div>
      </main>
    );
  }

  const vo = data?.vo;
  const isApproved = vo?.status === "approved";
  const voType = asVoType(vo?.vo_type);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70">
        <header className="border-t-8 border-slate-950 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="PMC CONNEXT" width={96} height={40} className="h-10 w-24 object-contain" />
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-orange-600">PMC CONNEXT VO APPROVAL</div>
                <h1 className="text-xl font-black text-slate-950 sm:text-2xl">อนุมัติงานเพิ่ม-ลด</h1>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[11px] font-black uppercase text-slate-500">VO No.</div>
              <div className="text-sm font-black text-slate-950">{vo?.vo_id}</div>
            </div>
          </div>
        </header>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
            <ShieldCheck size={14} /> {VO_TYPE_LABELS[voType]}
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{vo?.title}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">{data?.project.name} | ลูกค้า: {vo?.client_name || data?.project.client || "-"}</p>
        </section>

        <section className="grid gap-4 px-5 py-5 sm:px-8 md:grid-cols-4">
          <Info label="มูลค่ารวม" value={`${formatMoney(vo?.grand_total)} บาท`} />
          <Info label="วันเพิ่ม" value={`${formatMoney(vo?.extension_days)} วัน`} />
          <Info label="กำหนดอนุมัติ" value={formatThaiDate(vo?.approval_deadline)} />
          <Info label="สถานะ" value={isApproved ? "อนุมัติแล้ว" : "รออนุมัติ"} />
        </section>

        <section className="grid gap-5 px-5 pb-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-black uppercase text-slate-500">รายละเอียดงาน</div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{vo?.description || "-"}</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="bg-slate-950 px-4 py-3 text-sm font-black text-white">รายการค่าใช้จ่าย</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">รายการ</th>
                      <th className="px-4 py-3 text-right">จำนวน</th>
                      <th className="px-4 py-3">หน่วย</th>
                      <th className="px-4 py-3 text-right">ราคา/หน่วย</th>
                      <th className="px-4 py-3 text-right">รวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(vo?.items || []).map((item, index) => (
                      <tr key={`${item.item_no}-${index}`}>
                        <td className="px-4 py-3 font-bold">{item.item_no || index + 1}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{item.description || "-"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatMoney(item.quantity)}</td>
                        <td className="px-4 py-3">{item.unit || "-"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatMoney(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-black">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
              <div className="text-xs font-black uppercase text-orange-600">สรุปรายการ VO</div>
              <div className="mt-3 space-y-2 text-sm font-bold text-orange-950">
                <div className="grid grid-cols-[1fr_auto] gap-3"><span>ยอดสุทธิของ VO นี้</span><span className="text-right">{formatMoney(vo?.net_payable)} บาท</span></div>
                <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-orange-200 pt-2"><span>ระยะเวลาที่ขอเพิ่ม</span><span className="text-right">{formatMoney(vo?.extension_days)} วัน</span></div>
                <p className="border-t border-orange-200 pt-2 text-xs leading-5 text-orange-800">ตรวจสอบเฉพาะรายการงานเพิ่ม-ลดนี้ก่อนอนุมัติให้ดำเนินการ</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              {isApproved ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-lg font-black text-emerald-800">
                    <CheckCircle2 size={22} /> อนุมัติเรียบร้อย
                  </div>
                  <p className="mt-2 text-sm font-semibold text-emerald-800">
                    ผู้อนุมัติ: {vo?.customer_approved_by || "-"}<br />
                    เวลา: {formatBangkokDateTime(vo?.customer_approved_at)}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-black text-slate-700">ชื่อผู้อนุมัติ</span>
                    <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-slate-700">หมายเหตุ</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" />
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold leading-6 text-slate-700">
                    <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" />
                    <span>ข้าพเจ้าได้ตรวจสอบรายการ ราคา ระยะเวลา และเอกสารแนบแล้ว อนุมัติให้ทีมงานดำเนินการตาม VO นี้</span>
                  </label>
                  <button onClick={submitApproval} disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
                    {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                    อนุมัติ VO
                  </button>
                </div>
              )}
              {error ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
            </div>

            <div className="space-y-2">
              {vo?.pdf_url ? (
                <a href={vo.pdf_url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black">
                  <FileText size={16} /> เปิด PDF VO
                </a>
              ) : null}
              {vo?.approval_pdf_url ? (
                <a href={vo.approval_pdf_url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                  <ExternalLink size={16} /> เปิด PDF หลักฐานอนุมัติ
                </a>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-950">{value}</div>
    </div>
  );
}
