"use client";

import { CheckCircle2, ExternalLink, FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { formatBangkokDateTime } from "@/lib/bangkokDateTime";
import { VO_TYPE_LABELS, asVoItemRowType, asVoType, formatMoney, formatThaiDate, numberValue } from "@/lib/variationOrders";

type VoItem = {
  item_no?: string | number;
  sort_order?: string | number;
  row_type?: string;
  change_type?: "add" | "deduct";
  parent_item_no?: string | number;
  description?: string;
  unit?: string;
  quantity?: string | number;
  unit_price?: string | number;
  material_unit_price?: string | number;
  material_amount?: string | number;
  labor_unit_price?: string | number;
  labor_amount?: string | number;
  amount?: string | number;
};

type VoAttachment = {
  id: string;
  name: string;
  url: string;
};

type ItemDecisionValue = "approved" | "rejected";

type ItemDecision = {
  item_key: string;
  item_no?: string | number;
  description?: string;
  amount?: string | number;
  change_type?: "add" | "deduct";
  decision?: ItemDecisionValue;
  note?: string;
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
    increase_total?: string | number;
    decrease_total?: string | number;
    net_change?: string | number;
    extension_days?: string | number;
    customer_approved_at?: string;
    customer_approved_by?: string;
    customer_approval_note?: string;
    rejection_reason?: string;
    pdf_url?: string;
    approval_pdf_url?: string;
    attachments?: VoAttachment[];
    item_decisions?: ItemDecision[];
    items: VoItem[];
  };
};

function getItemKey(item: VoItem, index: number) {
  return `${String(item.item_no || index + 1)}:${String(item.description || "").trim()}`;
}

function createItemDecision(item: VoItem, index: number, saved?: ItemDecision): ItemDecision {
  return {
    item_key: getItemKey(item, index),
    item_no: item.item_no || index + 1,
    description: item.description || "",
    amount: item.change_type === "deduct" ? -Math.abs(numberValue(item.amount)) : Math.abs(numberValue(item.amount)),
    change_type: item.change_type,
    decision: saved?.decision,
    note: saved?.note || "",
  };
}

function decisionItemsFor(items: VoItem[]) {
  const groups = items.filter((item) => asVoItemRowType(String(item.row_type || "")) === "group");
  if (groups.length === 0) {
    return items.filter((item) => (
      asVoItemRowType(String(item.row_type || "")) !== "note" &&
      String(item.description || "").trim()
    ));
  }

  return items.filter((item) => {
    const rowType = asVoItemRowType(String(item.row_type || ""));
    if (!String(item.description || "").trim() || rowType === "note") return false;
    if (rowType === "detail") return true;
    if (rowType !== "group") return false;
    return !items.some((candidate) => (
      asVoItemRowType(String(candidate.row_type || "")) === "detail" &&
      String(candidate.parent_item_no || "") === String(item.item_no || "") &&
      String(candidate.description || "").trim()
    ));
  });
}

function hasVisibleItemContent(item: VoItem) {
  const textValues = [item.description, item.unit];
  const numberValues = [
    item.quantity,
    item.unit_price,
    item.material_unit_price,
    item.material_amount,
    item.labor_unit_price,
    item.labor_amount,
    item.amount,
  ];

  return textValues.some((value) => String(value ?? "").trim())
    || numberValues.some((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

export default function PublicVariationOrderApprovalClient({ projectId, token }: { projectId: string; token: string }) {
  const endpoint = `/api/variation-order-approval/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}`;
  const [data, setData] = useState<ApprovalData | null>(null);
  const [approvedBy, setApprovedBy] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [itemDecisions, setItemDecisions] = useState<Record<string, ItemDecision>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(endpoint, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "เปิดรายการอนุมัติ VO ไม่สำเร็จ");
        if (!active) return;
        setData(json.data);
        setApprovedBy(json.data?.vo?.customer_approved_by || json.data?.vo?.client_name || json.data?.project?.client || "");
        setNote(json.data?.vo?.customer_approval_note || "");
        const savedDecisions = Array.isArray(json.data?.vo?.item_decisions) ? json.data.vo.item_decisions as ItemDecision[] : [];
        const nextDecisions: Record<string, ItemDecision> = {};
        decisionItemsFor(json.data?.vo?.items || []).forEach((item: VoItem, index: number) => {
          const key = getItemKey(item, index);
          const saved = savedDecisions.find((decision) => decision.item_key === key || String(decision.item_no || "") === String(item.item_no || index + 1))
            || savedDecisions.find((decision) => (
              asVoItemRowType(String(item.row_type || "")) === "detail" &&
              String(decision.item_no || "") === String(item.parent_item_no || "")
            ));
          nextDecisions[key] = createItemDecision(item, index, saved);
        });
        setItemDecisions(nextDecisions);
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

  const vo = data?.vo;
  const decisionItems = useMemo(() => decisionItemsFor(vo?.items || []), [vo?.items]);
  const itemDecisionList = useMemo(() => {
    return decisionItems.map((item, index) => {
      const key = getItemKey(item, index);
      return itemDecisions[key] || createItemDecision(item, index);
    });
  }, [decisionItems, itemDecisions]);
  const hasItems = itemDecisionList.length > 0;
  const approvedItemCount = itemDecisionList.filter((item) => item.decision === "approved").length;
  const rejectedItemCount = itemDecisionList.filter((item) => item.decision === "rejected").length;
  const pendingItemCount = itemDecisionList.filter((item) => !item.decision).length;
  const approvedItemTotal = itemDecisionList
    .filter((item) => item.decision === "approved")
    .reduce((sum, item) => sum + numberValue(item.amount), 0);
  const hasRejectedItemsWithoutGeneralNote = rejectedItemCount > 0 && !note.trim();

  const updateItemDecision = (key: string, patch: Partial<ItemDecision>) => {
    setItemDecisions((current) => ({
      ...current,
      [key]: { ...current[key], item_key: key, ...patch },
    }));
  };

  const approveAllItems = () => {
    setItemDecisions((current) => Object.fromEntries(decisionItems.map((item, index) => {
      const key = getItemKey(item, index);
      return [key, {
        ...(current[key] || createItemDecision(item, index)),
        decision: "approved" as const,
      }];
    })));
    setError("");
  };

  const clearAllItemDecisions = () => {
    setItemDecisions((current) => Object.fromEntries(decisionItems.map((item, index) => {
      const key = getItemKey(item, index);
      return [key, {
        ...(current[key] || createItemDecision(item, index)),
        decision: undefined,
      }];
    })));
    setError("");
  };

  const submitApproval = async () => {
    if (!approvedBy.trim()) {
      setError("กรุณาระบุชื่อผู้อนุมัติ");
      return;
    }
    if (hasItems && pendingItemCount > 0) {
      setError("กรุณาเลือกอนุมัติหรือไม่อนุมัติให้ครบทุกรายการ");
      return;
    }
    if (hasRejectedItemsWithoutGeneralNote) {
      setError("กรุณาระบุหมายเหตุรวมเมื่อมีรายการที่ไม่อนุมัติ");
      return;
    }
    if (!accepted) {
      setError("กรุณาติ๊กยืนยันว่าได้ตรวจสอบและส่งผลการพิจารณารายการงานเพิ่ม-ลดแล้ว");
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
          item_decisions: itemDecisionList.map((item) => ({ ...item, note: "" })),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "บันทึกผลการพิจารณา VO ไม่สำเร็จ");
      setData(json.data);
      setAccepted(true);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "บันทึกผลการพิจารณา VO ไม่สำเร็จ");
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

  const isApproved = vo?.status === "approved";
  const isRejected = vo?.status === "rejected";
  const voType = asVoType(vo?.vo_type);
  const visibleVoItems = (vo?.items || []).filter((item) => (
    asVoItemRowType(String(item.row_type || "")) === "group" || hasVisibleItemContent(item)
  ));
  const decisionsLocked = isApproved || isRejected;

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#eef2f6] px-2 py-3 sm:px-5 sm:py-8">
      <div className="mx-auto w-full min-w-0 max-w-[1840px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="h-1.5 bg-orange-600" />
        <header className="min-w-0 bg-white px-4 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Image src="/logo.png" alt="Pichayamongkol Construction" width={118} height={48} className="h-11 w-auto shrink-0 object-contain" />
              <div className="h-10 w-px shrink-0 bg-slate-200" />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase text-orange-600">Digital Variation Order</div>
                <h1 className="wrap-break-word text-xl font-black text-slate-950 sm:text-2xl">เอกสารพิจารณางานเพิ่ม-ลด</h1>
              </div>
            </div>
            <div className="min-w-0 border-l-2 border-slate-950 py-1 pl-5 sm:min-w-[320px] sm:text-right">
              <div className="text-xs font-black uppercase leading-5 text-slate-500">Variation Order No.</div>
              <div className="wrap-break-word mt-1 text-base font-black leading-6 text-slate-950 sm:text-lg">{vo?.vo_id}</div>
              <div className="mt-1 text-sm font-bold leading-5 text-slate-500">กำหนดตอบกลับ {formatThaiDate(vo?.approval_deadline)}</div>
            </div>
          </div>
        </header>

        <section className="min-w-0 border-y border-slate-200 bg-slate-50 px-4 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2.5 text-sm font-black leading-6 text-orange-700 sm:text-base">
                <ShieldCheck size={18} strokeWidth={2.25} /> {VO_TYPE_LABELS[voType]}
              </div>
              <h2 className="mt-2 wrap-break-word text-2xl font-black text-slate-950 sm:text-3xl">{vo?.title}</h2>
              <p className="mt-2 wrap-break-word text-sm font-semibold text-slate-600">โครงการ {data?.project.name} <span className="mx-2 text-slate-300">|</span> ลูกค้า {vo?.client_name || data?.project.client || "-"}</p>
            </div>
            <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${isApproved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : isRejected ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <span className={`h-2 w-2 rounded-full ${isApproved ? "bg-emerald-500" : isRejected ? "bg-red-500" : "bg-amber-500"}`} />
              {isApproved ? "อนุมัติแล้ว" : isRejected ? "ส่งผลแล้ว • มีรายการต้องแก้ไข" : "รอการพิจารณา"}
            </div>
          </div>
        </section>

        <section className="grid min-w-0 grid-cols-2 border-b border-slate-200 sm:grid-cols-5">
          <DocumentMetric label="รวมงานเพิ่ม" value={`+${formatMoney(vo?.increase_total)} บาท`} emphasis />
          <DocumentMetric label="รวมงานลด" value={`−${formatMoney(vo?.decrease_total)} บาท`} />
          <DocumentMetric label="ส่วนต่างสุทธิ" value={`${numberValue(vo?.net_change) > 0 ? "+" : numberValue(vo?.net_change) < 0 ? "−" : ""}${formatMoney(Math.abs(numberValue(vo?.net_change)))} บาท`} />
          <DocumentMetric label="ระยะเวลาเพิ่ม" value={`${formatMoney(vo?.extension_days)} วัน`} />
          <DocumentMetric label="รายการที่ต้องพิจารณา" value={`${decisionItems.length} รายการ`} />
        </section>

        <section className="grid min-w-0 gap-6 px-3 py-5 sm:px-5 sm:py-7 lg:px-6">
          <div className="min-w-0 space-y-5">
            <div className="min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white">
              <div className="flex min-h-20 flex-col justify-center gap-3 bg-slate-950 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                <div>
                  <div className="text-base font-black leading-6 sm:text-lg">ตารางรายการงานและผลการพิจารณา</div>
                  <div className="mt-1 text-sm font-semibold leading-5 text-slate-300">ตรวจราคาและเลือกอนุมัติหรือไม่อนุมัติแยกทุกรายการ</div>
                  <div className="mt-1.5 text-sm font-semibold leading-5 text-orange-300 sm:hidden">เลื่อนตารางไปทางขวาเพื่อดูราคาและเลือกผลพิจารณา</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-black text-slate-200">{decisionItems.length} รายการ</div>
                  {!decisionsLocked && hasItems ? (
                    <>
                      <button type="button" onClick={approveAllItems} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-500">
                        <CheckCircle2 size={15} /> อนุมัติทั้งหมด
                      </button>
                      {pendingItemCount < decisionItems.length ? (
                        <button type="button" onClick={clearAllItemDecisions} className="min-h-10 rounded-md border border-slate-600 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-800">
                          ล้างการเลือก
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1240px] border-collapse text-sm leading-5">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th rowSpan={2} className="w-16 border border-slate-600 px-2 py-2.5 text-center">ลำดับ</th>
                      <th rowSpan={2} className="min-w-72 border border-slate-600 px-3 py-2.5 text-left">รายการงาน</th>
                      <th rowSpan={2} className="w-20 border border-slate-600 px-2 py-2.5 text-right">ปริมาณ</th>
                      <th rowSpan={2} className="w-16 border border-slate-600 px-2 py-2.5 text-left">หน่วย</th>
                      <th colSpan={2} className="border border-slate-600 px-2 py-2.5 text-center">ค่าวัสดุ</th>
                      <th colSpan={2} className="border border-slate-600 px-2 py-2.5 text-center">ค่าแรง</th>
                      <th rowSpan={2} className="w-28 border border-slate-600 px-2 py-2.5 text-right">รวมเป็นเงิน</th>
                      <th rowSpan={2} className="w-64 border border-orange-200 bg-[#fff7ed] px-3 py-2.5 text-left text-orange-950 md:sticky md:right-0 md:z-20 md:shadow-[-8px_0_18px_rgba(15,23,42,0.08)]">ผลพิจารณา</th>
                    </tr>
                    <tr>
                      <th className="w-20 border border-slate-600 px-2 py-2 text-right text-slate-300">หน่วยละ</th>
                      <th className="w-24 border border-slate-600 px-2 py-2 text-right text-slate-300">รวม</th>
                      <th className="w-20 border border-slate-600 px-2 py-2 text-right text-slate-300">หน่วยละ</th>
                      <th className="w-24 border border-slate-600 px-2 py-2 text-right text-slate-300">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleVoItems.map((item, index) => {
                      const rowType = asVoItemRowType(String(item.row_type || ""));
                      const isGroup = rowType === "group";
                      const isNote = rowType === "note";
                      const isDeduct = item.change_type === "deduct";
                      const decisionIndex = decisionItems.indexOf(item);
                      const isDecisionItem = decisionIndex >= 0;
                      const groupDecisionCount = isGroup ? decisionItems.filter((candidate) => (
                        asVoItemRowType(String(candidate.row_type || "")) === "detail" &&
                        String(candidate.parent_item_no || "") === String(item.item_no || "")
                      )).length : 0;
                      const key = isDecisionItem ? getItemKey(item, decisionIndex) : "";
                      const decision = isDecisionItem ? itemDecisions[key] || createItemDecision(item, decisionIndex) : undefined;
                      const precedingRows = visibleVoItems.slice(0, index + 1);
                      const groupNo = precedingRows.filter((row) => asVoItemRowType(String(row.row_type || "")) === "group").length;
                      const lastGroupIndex = precedingRows.map((row) => asVoItemRowType(String(row.row_type || ""))).lastIndexOf("group");
                      const detailNo = precedingRows.slice(lastGroupIndex + 1).filter((row) => asVoItemRowType(String(row.row_type || "")) === "detail").length;
                      const displayItemNo = isNote ? "•" : isGroup ? groupNo : groupNo > 0 ? `${groupNo}.${detailNo}` : item.item_no || index + 1;
                      const itemMaterialUnit = numberValue(item.material_unit_price);
                      const itemLaborUnit = item.material_unit_price === undefined && item.labor_unit_price === undefined
                        ? numberValue(item.unit_price)
                        : numberValue(item.labor_unit_price);
                      const itemMaterialAmount = item.material_amount === undefined ? numberValue(item.quantity) * itemMaterialUnit : numberValue(item.material_amount);
                      const itemLaborAmount = item.labor_amount === undefined ? numberValue(item.quantity) * itemLaborUnit : numberValue(item.labor_amount);

                      return (
                        <tr key={`${item.sort_order || index}-${item.description || ""}`} className={isGroup ? `border-t-2 border-slate-400 align-top ${isDeduct ? "bg-red-50" : "bg-[#eaf2ff]"}` : isNote ? "bg-amber-50 text-amber-950" : "bg-white text-slate-700 hover:bg-slate-50"}>
                          <td className={`border border-slate-300 px-2 py-2.5 text-center ${isGroup ? "font-black text-slate-950" : "font-semibold text-slate-500"}`}>{displayItemNo}</td>
                          {isGroup ? (
                            <>
                              <td colSpan={7} className="border border-slate-300 px-3 py-3">
                                <div className="flex items-start gap-2.5">
                                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isDeduct ? "bg-red-600" : "bg-blue-600"}`} />
                                    <div className="min-w-0">
                                      <div className="font-black text-slate-950">{item.description || "-"}</div>
                                      <div className={`mt-0.5 text-xs font-black uppercase ${isDeduct ? "text-red-700" : "text-blue-700"}`}>{isDeduct ? "งานลด (−)" : "งานเพิ่ม (+)"}</div>
                                    </div>
                                  </div>
                                </td>
                              <td className={`border border-slate-300 px-2 py-3 text-right font-black tabular-nums ${isDeduct ? "bg-red-100/70 text-red-800" : "bg-blue-100/70 text-slate-950"}`}>{isDeduct ? "−" : "+"}{formatMoney(item.amount)}</td>
                            </>
                          ) : isNote ? (
                            <>
                              <td className="border border-slate-300 px-3 py-2.5 italic text-amber-900">หมายเหตุ: {item.description || "-"}</td>
                              <td colSpan={7} className="border border-slate-300 px-3 py-2.5 text-sm font-semibold text-amber-700">ข้อมูลประกอบหมวดงานนี้</td>
                            </>
                          ) : (
                            <>
                              <td className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-950">{item.description || "-"}</td>
                              <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(item.quantity)}</td>
                              <td className="border border-slate-300 px-2 py-2.5">{item.unit || "-"}</td>
                              <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(itemMaterialUnit)}</td>
                              <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(itemMaterialAmount)}</td>
                              <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(itemLaborUnit)}</td>
                              <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(itemLaborAmount)}</td>
                              <td className={`border border-slate-300 px-2 py-2.5 text-right font-black tabular-nums ${isDeduct ? "text-red-700" : "text-slate-950"}`}>{isDeduct ? "−" : "+"}{formatMoney(item.amount)}</td>
                            </>
                          )}
                          <td className="border border-orange-200 bg-[#fffaf5] p-3 align-top md:sticky md:right-0 md:z-10 md:shadow-[-8px_0_18px_rgba(15,23,42,0.06)]">
                            {isDecisionItem && decision ? (
                              <ItemDecisionEditor
                                decision={decision}
                                locked={decisionsLocked}
                                onChange={(patch) => updateItemDecision(key, patch)}
                              />
                            ) : (
                              <div className="px-2 py-3 text-center text-xs font-bold text-slate-400">
                                {isGroup && groupDecisionCount > 0 ? `อนุมัติแยก ${groupDecisionCount} รายการย่อย` : "ไม่มีรายการให้พิจารณา"}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleVoItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-sm font-semibold text-slate-400">ไม่มีรายการงานใน VO นี้</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="grid min-w-0 overflow-hidden rounded-lg border border-slate-300 lg:grid-cols-[0.78fr_1.22fr] lg:items-stretch">
            <div className="min-w-0 bg-slate-950 p-5 text-white sm:p-6">
              <div className="text-xs font-black uppercase text-orange-400">สรุปผลการพิจารณา</div>
              <div className="mt-4 space-y-3 text-sm font-bold">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="wrap-break-word">ส่วนต่างสุทธิของ VO</span><span className="text-right">{numberValue(vo?.net_change) > 0 ? "+" : numberValue(vo?.net_change) < 0 ? "−" : ""}{formatMoney(Math.abs(numberValue(vo?.net_change)))} บาท</span></div>
                {hasItems ? <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-orange-300"><span className="wrap-break-word">สุทธิรายการที่อนุมัติ</span><span className="text-right text-lg">{approvedItemTotal > 0 ? "+" : approvedItemTotal < 0 ? "−" : ""}{formatMoney(Math.abs(approvedItemTotal))} บาท</span></div> : null}
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-slate-700 pt-3"><span className="wrap-break-word text-slate-300">ระยะเวลาที่ขอเพิ่ม</span><span className="text-right">{formatMoney(vo?.extension_days)} วัน</span></div>
                {hasItems ? <div className="grid min-w-0 grid-cols-3 divide-x divide-slate-700 border-y border-slate-700 py-3 text-center text-xs">
                  <div className="px-2 text-emerald-400"><strong className="text-lg">{approvedItemCount}</strong><br />อนุมัติ</div>
                  <div className="px-2 text-red-400"><strong className="text-lg">{rejectedItemCount}</strong><br />ไม่อนุมัติ</div>
                  <div className="px-2 text-slate-300"><strong className="text-lg text-white">{pendingItemCount}</strong><br />ยังไม่เลือก</div>
                </div> : null}
                <p className="text-xs font-semibold leading-5 text-slate-400">หากมีรายการไม่อนุมัติ ระบบจะส่งกลับให้ทีมงานปรับ VO เป็นฉบับแก้ไขก่อนวางบิล</p>
              </div>
            </div>

            <div className="min-w-0 bg-slate-50 p-5 sm:p-6">
              <div className="mb-4">
                <div className="text-xs font-black uppercase text-orange-600">Customer Confirmation</div>
                <h3 className="mt-1 text-lg font-black text-slate-950">ยืนยันผลการพิจารณา</h3>
              </div>
              {isApproved ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-lg font-black text-emerald-800">
                    <CheckCircle2 size={22} /> อนุมัติเรียบร้อย
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-emerald-800">
                    ผู้อนุมัติ: {vo?.customer_approved_by || "-"}<br />
                    เวลา: {formatBangkokDateTime(vo?.customer_approved_at)}
                  </p>
                  <div className="mt-4 border-t border-emerald-200 pt-4">
                    <div className="text-sm font-black text-slate-950">ขั้นตอนถัดไป</div>
                    <ProcessStep number="1" text="ระบบบันทึกผลและหลักฐานการอนุมัติแล้ว" tone="success" />
                    <ProcessStep number="2" text="ทีมงานจะเพิ่มรายการที่อนุมัติเข้าแผนงานและดำเนินงานต่อ" tone="success" />
                    <ProcessStep number="3" text="ทีมบัญชีดำเนินการวางบิลตามเงื่อนไขของโครงการ" tone="success" />
                  </div>
                  <div className="mt-4 border border-emerald-200 bg-white px-3 py-2.5 text-sm font-bold leading-6 text-emerald-800">
                    ลูกค้าไม่ต้องดำเนินการเพิ่มเติม สามารถเก็บลิงก์นี้ไว้ตรวจสอบหลักฐานได้
                  </div>
                </div>
              ) : isRejected ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-lg font-black text-slate-950">
                    <CheckCircle2 size={22} className="text-emerald-600" /> ส่งผลการพิจารณาแล้ว
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                    อนุมัติ <strong className="text-emerald-700">{approvedItemCount} รายการ</strong> และไม่อนุมัติ <strong className="text-red-700">{rejectedItemCount} รายการ</strong>
                  </p>
                  <div className="mt-4 border-t border-amber-300 pt-4">
                    <div className="text-sm font-black text-slate-950">หลังจากนี้จะเป็นอย่างไร</div>
                    <ProcessStep number="1" text="ทีมงานตรวจหมายเหตุและรายการที่ไม่อนุมัติ" />
                    <ProcessStep number="2" text="OE จัดทำ VO ฉบับแก้ไข โดยคงรายการที่อนุมัติและปรับรายการที่มีข้อสังเกต" />
                    <ProcessStep number="3" text="ระบบจะส่งลิงก์ LINE ฉบับใหม่ให้ลูกค้าตรวจอีกครั้ง" />
                  </div>
                  <div className="mt-4 border border-amber-300 bg-white px-3 py-2.5 text-sm font-bold leading-6 text-amber-900">
                    ลูกค้าส่งผลเสร็จแล้ว ยังไม่ต้องดำเนินการต่อ กรุณารอ VO ฉบับแก้ไขจากทีมงาน
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                    หมายเหตุที่ส่ง: {vo?.customer_approval_note || vo?.rejection_reason || vo?.description || "-"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-black text-slate-700">ชื่อผู้อนุมัติ</span>
                    <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-slate-700">หมายเหตุรวม</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      placeholder={rejectedItemCount > 0 ? "ระบุเหตุผลหรือเงื่อนไขของรายการที่ไม่อนุมัติ" : "ระบุหมายเหตุหรือเงื่อนไขเพิ่มเติม (ถ้ามี)"}
                      className="mt-1 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                  <label className="flex min-w-0 items-start gap-3 rounded-md border border-slate-300 bg-white p-3 text-sm font-bold leading-6 text-slate-700">
                    <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600" />
                    <span className="min-w-0 wrap-break-word">ข้าพเจ้าได้ตรวจสอบรายการ ราคา ระยะเวลา และเอกสารแนบแล้ว ขอส่งผลการพิจารณารายการงานเพิ่ม-ลดตามที่เลือกไว้</span>
                  </label>
                  <button onClick={submitApproval} disabled={saving} className={`inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-md px-5 py-2 text-center text-sm font-black whitespace-normal text-white shadow-sm disabled:opacity-60 ${rejectedItemCount > 0 ? "bg-slate-950 hover:bg-black" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                    {saving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                    {rejectedItemCount > 0 ? "ส่งผลการพิจารณา" : "อนุมัติ VO"}
                  </button>
                </div>
              )}
              {error ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-300 bg-white p-4 sm:flex-row lg:col-span-2">
              {vo?.pdf_url ? (
                <a href={vo.pdf_url} target="_blank" rel="noreferrer" className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-center text-sm font-black whitespace-normal text-white hover:bg-black">
                  <FileText size={16} /> เปิด PDF VO
                </a>
              ) : null}
              {vo?.approval_pdf_url ? (
                <a href={vo.approval_pdf_url} target="_blank" rel="noreferrer" className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-black whitespace-normal text-slate-700 hover:bg-slate-50">
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

function ProcessStep({
  number,
  text,
  tone = "warning",
}: {
  number: string;
  text: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="mt-3 flex items-start gap-3 text-sm font-semibold leading-6 text-slate-700">
      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${tone === "success" ? "bg-emerald-600" : "bg-orange-600"}`}>
        {number}
      </span>
      <span className="min-w-0 wrap-break-word">{text}</span>
    </div>
  );
}

function ItemDecisionEditor({
  decision,
  locked,
  onChange,
}: {
  decision: ItemDecision;
  locked: boolean;
  onChange: (patch: Partial<ItemDecision>) => void;
}) {
  if (locked) {
    return <DecisionBadge decision={decision.decision} />;
  }

  return (
    <div className="min-w-56">
      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-300 bg-white">
        <button
          type="button"
          onClick={() => onChange({ decision: "approved" })}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 px-2 text-sm font-black ${decision.decision === "approved" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"}`}
        >
          <CheckCircle2 size={15} /> อนุมัติ
        </button>
        <button
          type="button"
          onClick={() => onChange({ decision: "rejected" })}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 border-l border-slate-300 px-2 text-sm font-black ${decision.decision === "rejected" ? "bg-red-600 text-white" : "text-slate-600 hover:bg-red-50 hover:text-red-700"}`}
        >
          <XCircle size={15} /> ไม่อนุมัติ
        </button>
      </div>
    </div>
  );
}

function DocumentMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 border-r border-t border-slate-200 px-4 py-5 first:border-t-0 sm:border-t-0 sm:px-5 lg:px-6">
      <div className="text-xs font-black leading-5 text-slate-600 sm:text-sm">{label}</div>
      <div className={`mt-1.5 wrap-break-word text-lg font-black leading-tight sm:text-xl ${emphasis ? "text-orange-700" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision?: ItemDecisionValue }) {
  if (decision === "approved") {
    return (
      <div className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-black text-emerald-700">
        <CheckCircle2 size={15} /> อนุมัติ
      </div>
    );
  }
  if (decision === "rejected") {
    return (
      <div className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-black text-red-700">
        <XCircle size={15} /> ไม่อนุมัติ
      </div>
    );
  }
  return (
    <div className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-500">
      ไม่พบผลพิจารณา
    </div>
  );
}
