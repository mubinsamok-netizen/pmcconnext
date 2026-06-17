"use client";

import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";

type AcknowledgementData = {
  project: {
    project_id: string;
    name: string;
    client?: string;
  };
  round: {
    round_id: string;
    document_no?: string;
    title?: string;
    status?: string;
    inspection_date?: string;
    inspector_name?: string;
    item_count?: string | number;
    acknowledged_by?: string;
    acknowledged_date?: string;
    acknowledgement_note?: string;
    locked_at?: string;
    pdf_url?: string;
  };
  items: Array<{
    item_id: string;
    item_no?: string | number;
    zone?: string;
    discipline?: string;
    work_category?: string;
    description?: string;
    cause?: string;
    status?: string;
    owner?: string;
    due_date?: string;
    remarks?: string;
  }>;
};

export default function PublicDefectAcknowledgementClient({ projectId, token }: { projectId: string; token: string }) {
  const endpoint = `/api/defect-acknowledgement/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const [data, setData] = useState<AcknowledgementData | null>(null);
  const [acknowledgedBy, setAcknowledgedBy] = useState("");
  const [note, setNote] = useState("รับทราบรายการ Defect ตามเอกสารแล้ว");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(endpoint)
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "เปิดรายการรับทราบไม่สำเร็จ");
        if (!active) return;
        setData(json.data);
        setAcknowledgedBy(json.data?.round?.acknowledged_by || json.data?.project?.client || "");
        setNote(json.data?.round?.acknowledgement_note || "รับทราบรายการ Defect ตามเอกสารแล้ว");
      })
      .catch((fetchError: unknown) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "เปิดรายการรับทราบไม่สำเร็จ");
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
      if (!response.ok) throw new Error(json.error || "บันทึกรับทราบรายการไม่สำเร็จ");
      setData(json.data);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกรับทราบรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto flex max-w-2xl items-center justify-center rounded-2xl bg-white p-10 text-slate-500 shadow-sm">
          <Loader2 className="mr-2 animate-spin" size={18} /> กำลังเปิดรายการ Defect
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

  const round = data?.round;
  const isAcknowledged = Boolean(round?.locked_at || round?.acknowledged_date || ["in_progress", "ready_for_recheck", "acknowledged", "closed"].includes(String(round?.status || "")));

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70">
        <header className="border-t-8 border-orange-500 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="PMC CONNEXT" width={96} height={40} className="h-10 w-24 object-contain" />
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-orange-600">PMC CONNEXT DEFECT LIST</div>
                <h1 className="text-xl font-black text-slate-950 sm:text-2xl">รับทราบรายการ Defect</h1>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[11px] font-black uppercase text-slate-500">Document No.</div>
              <div className="text-sm font-black text-slate-950">{round?.document_no || round?.round_id}</div>
            </div>
          </div>
        </header>

        <section className="border-y border-slate-200 bg-orange-50 px-5 py-5 sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-700">
            <ShieldCheck size={14} /> Defect Acknowledgement
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{round?.title}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">{data?.project.name} | ลูกค้า: {data?.project.client || "-"}</p>
        </section>

        <section className="grid gap-4 px-5 py-5 sm:px-8 md:grid-cols-3">
          <Info label="วันที่ตรวจ" value={round?.inspection_date || "-"} />
          <Info label="ผู้ตรวจ" value={round?.inspector_name || "-"} />
          <Info label="จำนวนรายการ" value={`${data?.items.length || round?.item_count || 0} รายการ`} />
        </section>

        <section className="px-5 pb-5 sm:px-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800">รายการที่รับทราบ</div>
            <div className="divide-y divide-slate-100">
              {(data?.items || []).map((item) => (
                <div key={item.item_id} className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[56px_1fr_120px]">
                  <div className="font-black text-orange-600">#{item.item_no || "-"}</div>
                  <div>
                    <div className="font-black text-slate-950">{item.zone || "-"}</div>
                    <div className="mt-1 font-semibold text-slate-700">{item.description || "-"}</div>
                    {item.cause ? <div className="mt-1 text-xs text-slate-500">สาเหตุ/ข้อมูลประกอบ: {item.cause}</div> : null}
                  </div>
                  <div className="text-xs font-bold text-slate-500">{item.discipline || "-"} {item.due_date ? `| ${item.due_date}` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-8">
          {isAcknowledged ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-lg font-black text-emerald-800">
                <CheckCircle2 size={22} /> รับทราบรายการเรียบร้อยแล้ว
              </div>
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                ผู้รับทราบ: {round?.acknowledged_by || "-"} | เวลา: {formatBangkokDateTime(round?.locked_at || round?.acknowledged_date)}
              </p>
              {round?.acknowledgement_note ? <p className="mt-2 text-sm text-emerald-700">{round.acknowledgement_note}</p> : null}
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
              <button onClick={submitAcknowledgement} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                รับทราบรายการ
              </button>
            </div>
          )}
          {error ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          {round?.pdf_url ? (
            <a href={round.pdf_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-slate-700 hover:text-orange-600">
              <ExternalLink size={16} /> เปิด PDF Defect
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
