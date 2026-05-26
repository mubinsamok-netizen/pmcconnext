"use client";

import { CheckCircle2, ExternalLink, FileText, Loader2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

type MemoAckData = {
  project: {
    project_id: string;
    name: string;
    client?: string;
  };
  memo: {
    memo_id: string;
    document_no?: string;
    memo_type?: string;
    title?: string;
    issue_date?: string;
    event_date?: string;
    detail?: string;
    status?: string;
    customer_name?: string;
    pdf_url?: string;
    acknowledged_by?: string;
    acknowledged_date?: string;
    acknowledgement_note?: string;
    evidence_count?: number;
  };
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

export default function PublicMemoAcknowledgementClient({ projectId, token }: { projectId: string; token: string }) {
  const endpoint = `/api/memo-acknowledgement/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const [data, setData] = useState<MemoAckData | null>(null);
  const [acknowledgedBy, setAcknowledgedBy] = useState("");
  const [note, setNote] = useState("รับทราบข้อมูลตามหนังสือแจ้งนี้แล้ว");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(endpoint)
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "เปิด Memo ไม่สำเร็จ");
        if (!active) return;
        setData(json.data);
        setAcknowledgedBy(json.data?.memo?.acknowledged_by || json.data?.memo?.customer_name || json.data?.project?.client || "");
        setNote(json.data?.memo?.acknowledgement_note || "รับทราบข้อมูลตามหนังสือแจ้งนี้แล้ว");
      })
      .catch((fetchError: unknown) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "เปิด Memo ไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const submitAcknowledgement = async () => {
    if (!acknowledgedBy.trim()) {
      setError("กรุณาระบุชื่อผู้รับทราบ");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acknowledged_by: acknowledgedBy,
          acknowledgement_note: note,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "บันทึกรับทราบ Memo ไม่สำเร็จ");
      setData(json.data);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกรับทราบ Memo ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto flex max-w-2xl items-center justify-center rounded-2xl bg-white p-10 text-slate-500 shadow-sm">
          <Loader2 className="mr-2 animate-spin" size={18} /> กำลังเปิด Memo
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

  const memo = data?.memo;
  const isAcknowledged = ["acknowledged", "extension_approved", "closed"].includes(String(memo?.status || ""));

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70">
        <header className="border-t-8 border-slate-950 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="PMC CONNEXT" width={96} height={40} className="h-10 w-24 object-contain" />
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-orange-600">PMC CONNEXT MEMO</div>
                <h1 className="text-xl font-black text-slate-950 sm:text-2xl">หนังสือแจ้งให้รับทราบ</h1>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[11px] font-black uppercase text-slate-500">Document No.</div>
              <div className="text-sm font-black text-slate-950">{memo?.document_no || memo?.memo_id}</div>
            </div>
          </div>
        </header>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
            <FileText size={14} /> {memo?.memo_type || "Memo"}
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{memo?.title}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">{data?.project.name} | ลูกค้า: {memo?.customer_name || data?.project.client || "-"}</p>
        </section>

        <section className="grid gap-4 px-5 py-5 sm:px-8 md:grid-cols-3">
          <Info label="วันที่แจ้ง" value={formatDate(memo?.issue_date)} />
          <Info label="วันที่เกิดเหตุ/อ้างอิง" value={formatDate(memo?.event_date)} />
          <Info label="สถานะ" value={isAcknowledged ? "รับทราบแล้ว" : "รอลูกค้ารับทราบ"} />
        </section>

        <section className="px-5 pb-5 sm:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-black uppercase text-slate-500">รายละเอียด Memo</div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{memo?.detail || "-"}</p>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          {isAcknowledged ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-lg font-black text-emerald-800">
                <CheckCircle2 size={22} /> รับทราบเรียบร้อยแล้ว
              </div>
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                ผู้รับทราบ: {memo?.acknowledged_by || "-"} | เวลา: {formatDateTime(memo?.acknowledged_date)}
              </p>
              {memo?.acknowledgement_note ? <p className="mt-2 text-sm text-emerald-700">{memo.acknowledgement_note}</p> : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-slate-700">ชื่อผู้รับทราบ</span>
                  <input value={acknowledgedBy} onChange={(event) => setAcknowledgedBy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" />
                </label>
                <label className="block">
                  <span className="text-sm font-black text-slate-700">หมายเหตุ</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-200" />
                </label>
              </div>
              <button onClick={submitAcknowledgement} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                รับทราบแล้ว
              </button>
            </div>
          )}
          {error ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          {memo?.pdf_url ? (
            <a href={memo.pdf_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 sm:w-auto">
              <ExternalLink size={16} /> เปิด PDF Memo
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
