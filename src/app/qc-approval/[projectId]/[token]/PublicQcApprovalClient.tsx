"use client";

import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { QC_RESULT_LABELS, type QcChecklistItem } from "@/lib/qcChecklists";

type ApprovalData = {
  project: {
    project_id: string;
    name: string;
    client?: string;
  };
  checklist: {
    qc_id: string;
    document_no?: string;
    category?: string;
    phase?: string;
    title?: string;
    status?: string;
    approval_status?: string;
    inspection_date?: string;
    inspected_by_name?: string;
    notes?: string;
    customer_approved_at?: string;
    customer_approved_by?: string;
    customer_approval_note?: string;
    pdf_url?: string;
    evidence_count?: number;
    can_approve?: boolean;
    approval_block_reason?: string;
    items: QcChecklistItem[];
  };
};

function resultClass(result?: string) {
  if (result === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (result === "fail") return "border-red-200 bg-red-50 text-red-700";
  if (result === "repair") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

export default function PublicQcApprovalClient({ projectId, token }: { projectId: string; token: string }) {
  const endpoint = `/api/qc-approval/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const [data, setData] = useState<ApprovalData | null>(null);
  const [approvedBy, setApprovedBy] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(endpoint)
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "เปิดรายการอนุมัติไม่สำเร็จ");
        if (!active) return;
        setData(json.data);
        setApprovedBy(json.data?.checklist?.customer_approved_by || json.data?.project?.client || "");
        setNote(json.data?.checklist?.customer_approval_note || "");
      })
      .catch((fetchError: unknown) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "เปิดรายการอนุมัติไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const stats = useMemo(() => {
    const items = data?.checklist.items || [];
    return {
      total: items.length,
      pass: items.filter((item) => item.result === "pass").length,
      issue: items.filter((item) => item.result === "repair" || item.result === "fail").length,
      pending: items.filter((item) => item.result === "pending" || !item.result).length,
    };
  }, [data?.checklist.items]);

  const submitApproval = async () => {
    if (data?.checklist.can_approve === false) {
      setError(data.checklist.approval_block_reason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนอนุมัติ");
      return;
    }
    if (!approvedBy.trim()) {
      setError("กรุณาระบุชื่อผู้อนุมัติ");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_approved_by: approvedBy,
          customer_approval_note: note,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "บันทึกอนุมัติไม่สำเร็จ");
      setData(json.data);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกอนุมัติไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto flex max-w-2xl items-center justify-center rounded-2xl bg-white p-10 text-slate-500 shadow-sm">
          <Loader2 className="mr-2 animate-spin" size={18} /> กำลังเปิดรายการอนุมัติ
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

  const checklist = data?.checklist;
  const isApproved = checklist?.approval_status === "approved";
  const canApprove = checklist?.can_approve !== false;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70">
        <header className="border-t-8 border-slate-950 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="PMC CONNEXT" width={96} height={40} className="h-10 w-24 object-contain" />
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-orange-600">PMC CONNEXT QC APPROVAL</div>
                <h1 className="text-xl font-black text-slate-950 sm:text-2xl">อนุมัติ QC Checklist</h1>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[11px] font-black uppercase text-slate-500">Document No.</div>
              <div className="text-sm font-black text-slate-950">{checklist?.document_no || checklist?.qc_id}</div>
            </div>
          </div>
        </header>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                <ShieldCheck size={14} /> {checklist?.category || "-"} / {checklist?.phase || "-"}
              </div>
              <h2 className="mt-3 text-2xl font-black text-slate-950">{checklist?.title}</h2>
              <p className="mt-2 text-sm font-semibold text-slate-600">{data?.project.name} | ลูกค้า: {data?.project.client || "-"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="ทั้งหมด" value={stats.total} />
              <Metric label="ผ่าน" value={stats.pass} tone="text-emerald-700" />
              <Metric label="แก้ไข" value={stats.issue} tone={stats.issue ? "text-red-700" : "text-slate-950"} />
              <Metric label="ยังไม่ตรวจ" value={stats.pending} tone={stats.pending ? "text-orange-700" : "text-slate-950"} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 px-5 py-5 sm:px-8 md:grid-cols-4">
          <Info label="วันที่ตรวจ" value={checklist?.inspection_date || "-"} />
          <Info label="ผู้ตรวจ" value={checklist?.inspected_by_name || "-"} />
          <Info label="โซน/รายละเอียด" value={checklist?.notes || "-"} />
          <Info label="หลักฐานแนบ" value={`${checklist?.evidence_count || 0} ไฟล์`} />
        </section>

        <section className="px-5 pb-5 sm:px-8">
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-950 text-white">
                <tr>
                  <th className="px-4 py-3 font-black">หมวดตรวจ</th>
                  <th className="px-4 py-3 font-black">รายการตรวจ</th>
                  <th className="px-4 py-3 font-black">เกณฑ์ยอมรับ</th>
                  <th className="px-4 py-3 font-black">ผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(checklist?.items || []).map((item) => (
                  <tr key={item.item_id} className="align-top">
                    <td className="px-4 py-3 font-bold text-slate-800">{item.section}</td>
                    <td className="px-4 py-3 font-black text-slate-950">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600">{item.acceptance}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${resultClass(item.result)}`}>
                        {QC_RESULT_LABELS[item.result] || item.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          {isApproved ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-lg font-black text-emerald-800">
                <CheckCircle2 size={22} /> อนุมัติเรียบร้อยแล้ว
              </div>
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                ผู้อนุมัติ: {checklist?.customer_approved_by || "-"} | เวลา: {formatDateTime(checklist?.customer_approved_at)}
              </p>
              {checklist?.customer_approval_note ? <p className="mt-2 text-sm text-emerald-700">{checklist.customer_approval_note}</p> : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              {!canApprove ? (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800 md:col-span-2">
                  {checklist?.approval_block_reason || "ต้องตรวจ QC ให้ผ่านครบทุกข้อก่อนอนุมัติ"}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-slate-700">ชื่อผู้อนุมัติ</span>
                  <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" />
                </label>
                <label className="block">
                  <span className="text-sm font-black text-slate-700">หมายเหตุ</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" placeholder="เช่น อนุมัติให้ดำเนินงานต่อ" />
                </label>
              </div>
              <button onClick={submitApproval} disabled={saving || !canApprove} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                อนุมัติรายการนี้
              </button>
            </div>
          )}
          {error ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          {checklist?.pdf_url ? (
            <a href={checklist.pdf_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-slate-700 hover:text-orange-600">
              <ExternalLink size={16} /> เปิด PDF รายงาน QC
            </a>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone = "text-slate-950" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className={`text-xl font-black ${tone}`}>{value}</div>
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
    </div>
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
