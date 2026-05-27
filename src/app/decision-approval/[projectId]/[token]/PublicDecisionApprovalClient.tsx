"use client";

import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

type ApprovalData = {
  project: {
    project_id: string;
    name: string;
    client?: string;
  };
  decision: {
    decision_id: string;
    document_no?: string;
    phase?: string;
    title?: string;
    decision_before?: string;
    decision_status?: string;
    impact_if_changed?: string;
    result_note?: string;
    evidence_note?: string;
    evidence_count?: number;
    decided_at?: string;
    decided_by?: string;
    pdf_url?: string;
  };
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

export default function PublicDecisionApprovalClient({ projectId, token }: { projectId: string; token: string }) {
  const endpoint = `/api/decision-approval/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const [data, setData] = useState<ApprovalData | null>(null);
  const [decidedBy, setDecidedBy] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(endpoint)
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "เปิดรายการยืนยันไม่สำเร็จ");
        if (!active) return;
        setData(json.data);
        setDecidedBy(json.data?.decision?.decided_by || json.data?.project?.client || "");
        setNote(json.data?.decision?.result_note || "ยืนยันให้ดำเนินงานต่อได้");
      })
      .catch((fetchError: unknown) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "เปิดรายการยืนยันไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const submitApproval = async () => {
    if (!decidedBy.trim()) {
      setError("กรุณาระบุชื่อผู้ยืนยัน");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decided_by: decidedBy,
          result_note: note,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "บันทึกยืนยันไม่สำเร็จ");
      setData(json.data);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกยืนยันไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto flex max-w-2xl items-center justify-center rounded-2xl bg-white p-10 text-slate-500 shadow-sm">
          <Loader2 className="mr-2 animate-spin" size={18} /> กำลังเปิดรายการยืนยัน
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

  const decision = data?.decision;
  const isApproved = decision?.decision_status === "ยืนยันแล้ว";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70">
        <header className="border-t-8 border-slate-950 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="PMC CONNEXT" width={96} height={40} className="h-10 w-24 object-contain" />
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-orange-600">PMC CONNEXT DECISION APPROVAL</div>
                <h1 className="text-xl font-black text-slate-950 sm:text-2xl">ยืนยันรายการที่ต้องตัดสินใจ</h1>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[11px] font-black uppercase text-slate-500">Document No.</div>
              <div className="text-sm font-black text-slate-950">{decision?.document_no || decision?.decision_id}</div>
            </div>
          </div>
        </header>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
            <ShieldCheck size={14} /> {decision?.phase || "-"}
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{decision?.title}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">{data?.project.name} | ลูกค้า: {data?.project.client || "-"}</p>
        </section>

        <section className="grid gap-4 px-5 py-5 sm:px-8 md:grid-cols-3">
          <Info label="ต้องตัดสินใจก่อน" value={decision?.decision_before || "-"} />
          <Info label="สถานะ" value={decision?.decision_status || "-"} />
          <Info label="หลักฐานแนบ" value={`${decision?.evidence_count || 0} ไฟล์`} />
        </section>

        <section className="px-5 pb-5 sm:px-8">
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="text-xs font-black uppercase text-orange-600">ผลถ้าเปลี่ยนหลังจากนี้</div>
            <div className="mt-2 text-base font-bold leading-relaxed text-orange-950">{decision?.impact_if_changed || "-"}</div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          {isApproved ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-lg font-black text-emerald-800">
                <CheckCircle2 size={22} /> ยืนยันเรียบร้อยแล้ว
              </div>
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                ผู้ยืนยัน: {decision?.decided_by || "-"} | เวลา: {formatDateTime(decision?.decided_at)}
              </p>
              {decision?.result_note ? <p className="mt-2 text-sm text-emerald-700">{decision.result_note}</p> : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-slate-700">ชื่อผู้ยืนยัน</span>
                  <input value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" />
                </label>
                <label className="block">
                  <span className="text-sm font-black text-slate-700">หมายเหตุ</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" placeholder="เช่น ยืนยันให้ดำเนินงานต่อได้" />
                </label>
              </div>
              <button onClick={submitApproval} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                ยืนยันรายการนี้
              </button>
            </div>
          )}
          {error ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          {decision?.pdf_url ? (
            <a href={decision.pdf_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-slate-700 hover:text-orange-600">
              <ExternalLink size={16} /> เปิด PDF รายการ
            </a>
          ) : null}
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
