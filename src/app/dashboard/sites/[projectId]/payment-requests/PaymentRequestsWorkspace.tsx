"use client";

import { useEffect, useId, useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Calculator,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  FileImage,
  FileText,
  History,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Paperclip,
  RefreshCw,
  Save,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import {
  buildPaymentEmail,
  calculatePaymentTotals,
  formatPaymentMoney,
  parsePaymentAttachments,
  parsePaymentItems,
  thaiBahtText,
  type PaymentAttachment,
  type PaymentItem,
  type PaymentRequestRecord,
  type PaymentRequestType,
} from "@/lib/paymentRequests";
import type { SitePageProject } from "../SiteShell";

type Tab = "overview" | "voucher" | "contractor_claim";
type PayeeSuggestion = {
  key: string;
  name: string;
  tax_id: string;
  address: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  contractor_id: string;
  attachments: PaymentAttachment[];
  usage_count: number;
  last_used_at: string;
};
type ApiResponse = {
  success: boolean;
  project: SitePageProject;
  data: PaymentRequestRecord[];
  payees: PayeeSuggestion[];
  contractors: Array<Record<string, string | number | undefined>>;
  labor_rates: Array<Record<string, string | number | undefined>>;
};
type FormState = {
  request_id: string;
  request_type: PaymentRequestType;
  title: string;
  request_date: string;
  status: string;
  payee_name: string;
  payee_tax_id: string;
  payee_address: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  contractor_id: string;
  work_package: string;
  claim_period: string;
  contract_amount: string;
  vat_rate: string;
  wht_rate: string;
  retention_rate: string;
  advance_deduction: string;
  other_deduction: string;
  notes: string;
  prepared_by_phone: string;
};
type PendingAttachment = {
  id: string;
  file: File;
  category: PaymentAttachment["category"];
  caption: string;
  previewUrl: string;
};

const inputClass = "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-50";
const textareaClass = `${inputClass} h-auto min-h-24 py-3`;
const sheetInputClass = "h-11 w-full border-0 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition placeholder:font-semibold placeholder:text-gray-300 focus:bg-orange-50/50 focus:ring-2 focus:ring-inset focus:ring-orange-400";

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function blankItem(): PaymentItem {
  const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    boq_key: id,
    description: "",
    quantity: 0,
    unit: "",
    unit_price: 0,
    amount: 0,
    material_unit_price: 0,
    material_amount: 0,
    labor_unit_price: 0,
    labor_amount: 0,
    contract_total: 0,
    claim_percent: 0,
  };
}

function padPaymentItems(source: PaymentItem[], minimum = 12) {
  return [...source, ...Array.from({ length: Math.max(0, minimum - source.length) }, () => blankItem())];
}

function blankForm(type: PaymentRequestType): FormState {
  return {
    request_id: "", request_type: type, title: "", request_date: todayBangkok(), status: "draft",
    payee_name: "", payee_tax_id: "", payee_address: "", bank_name: "", bank_account_no: "", bank_account_name: "",
    contractor_id: "", work_package: "", claim_period: "", contract_amount: "", vat_rate: "0", wht_rate: type === "contractor_claim" ? "3" : "0",
    retention_rate: type === "contractor_claim" ? "5" : "0", advance_deduction: "0", other_deduction: "0", notes: "", prepared_by_phone: "",
  };
}

function num(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function attachmentPreviewUrl(attachment: PaymentAttachment) {
  if (!attachment.file_id || !attachment.mime_type?.startsWith("image/")) return "";
  return `/api/drive/files/${encodeURIComponent(attachment.file_id)}`;
}

function statusText(status: string) {
  return ({ draft: "แบบร่าง", pdf_created: "สร้าง PDF แล้ว", emailed: "ส่งอีเมลแล้ว", paid: "จ่ายแล้ว", closed: "ปิดรายการ", cancelled: "ยกเลิก" } as Record<string, string>)[status] || status;
}

function statusTone(status: string) {
  if (["paid", "closed"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "pdf_created" || status === "emailed") return "bg-blue-50 text-blue-700 ring-blue-100";
  if (status === "cancelled") return "bg-red-50 text-red-700 ring-red-100";
  return "bg-amber-50 text-amber-700 ring-amber-100";
}

function nextClaimPeriod(value: string) {
  const fraction = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction) {
    const current = Number(fraction[1]);
    const total = Number(fraction[2]);
    return current < total ? `${current + 1}/${total}` : null;
  }
  const current = Number(value.match(/\d+/)?.[0] || 0);
  return current > 0 ? String(current + 1) : "";
}

type ContractorLedgerRow = {
  key: string;
  contractorName: string;
  workPackage: string;
  contractAmount: number;
  claimedAmount: number;
  remainingAmount: number;
  claims: PaymentRequestRecord[];
};

function claimPeriodOrder(record: PaymentRequestRecord, fallback: number) {
  const period = String(record.claim_period || "");
  const fraction = period.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction) return Number(fraction[1]);
  const number = period.match(/\d+/)?.[0];
  return number ? Number(number) : fallback + 1;
}

function buildContractorLedger(requests: PaymentRequestRecord[]) {
  const groups = new Map<string, PaymentRequestRecord[]>();
  requests
    .filter((record) => record.request_type === "contractor_claim" && record.status !== "cancelled")
    .forEach((record) => {
      const contractor = String(record.contractor_id || record.payee_name || "ไม่ระบุผู้รับเหมา").trim().toLowerCase();
      const workPackage = String(record.work_package || record.title || "ไม่ระบุหมวดงาน").trim().toLowerCase();
      const key = `${contractor}::${workPackage}`;
      groups.set(key, [...(groups.get(key) || []), record]);
    });

  return Array.from(groups.entries()).map(([key, records]) => {
    const claims = [...records].sort((a, b) => {
      const orderDiff = claimPeriodOrder(a, 0) - claimPeriodOrder(b, 0);
      return orderDiff || `${a.request_date}-${a.created_at}`.localeCompare(`${b.request_date}-${b.created_at}`);
    });
    const contractAmount = Math.max(...claims.map((record) => num(record.contract_amount)), 0);
    const claimedAmount = claims.reduce((sum, record) => sum + num(record.subtotal), 0);
    return {
      key,
      contractorName: claims[0]?.payee_name || "ไม่ระบุผู้รับเหมา",
      workPackage: claims[0]?.work_package || claims[0]?.title || "ไม่ระบุหมวดงาน",
      contractAmount,
      claimedAmount,
      remainingAmount: Math.max(0, contractAmount - claimedAmount),
      claims,
    } satisfies ContractorLedgerRow;
  }).sort((a, b) => `${a.contractorName}-${a.workPackage}`.localeCompare(`${b.contractorName}-${b.workPackage}`, "th"));
}

export default function PaymentRequestsWorkspace({ project, preparedBy }: { project: SitePageProject; preparedBy: string }) {
  const endpoint = `/api/sites/${encodeURIComponent(project.project_id)}/payment-requests`;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(endpoint, fetcher);
  const requests = useMemo(() => data?.data || [], [data?.data]);
  const [tab, setTab] = useState<Tab>("overview");
  const [forms, setForms] = useState<Record<PaymentRequestType, FormState>>({ voucher: blankForm("voucher"), contractor_claim: blankForm("contractor_claim") });
  const [items, setItems] = useState<Record<PaymentRequestType, PaymentItem[]>>({ voucher: padPaymentItems([]), contractor_claim: padPaymentItems([]) });
  const [existingAttachments, setExistingAttachments] = useState<Record<PaymentRequestType, PaymentAttachment[]>>({ voucher: [], contractor_claim: [] });
  const [pendingAttachments, setPendingAttachments] = useState<Record<PaymentRequestType, PendingAttachment[]>>({ voucher: [], contractor_claim: [] });
  const [busy, setBusy] = useState<string>("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const stats = useMemo(() => ({
    all: requests.length,
    pdf: requests.filter((row) => row.status === "pdf_created" || row.status === "emailed").length,
    paid: requests.filter((row) => row.status === "paid" || row.status === "closed").length,
    amount: requests.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + num(row.net_amount), 0),
  }), [requests]);

  function showMessage(tone: "success" | "error", text: string) {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 5000);
  }

  function switchToForm(type: PaymentRequestType) {
    setTab(type);
    setMessage(null);
  }

  function setField(type: PaymentRequestType, field: keyof FormState, value: string) {
    setForms((current) => ({ ...current, [type]: { ...current[type], [field]: value } }));
  }

  function applyPayee(type: PaymentRequestType, payee: PayeeSuggestion) {
    setForms((current) => ({
      ...current,
      [type]: {
        ...current[type],
        payee_name: payee.name,
        payee_tax_id: payee.tax_id,
        payee_address: payee.address,
        bank_name: payee.bank_name,
        bank_account_no: payee.bank_account_no,
        bank_account_name: payee.bank_account_name,
        contractor_id: type === "contractor_claim" && payee.contractor_id
          ? payee.contractor_id
          : current[type].contractor_id,
      },
    }));

    const reusableAttachments = (payee.attachments || [])
      .filter((attachment) => attachment.file_id && ["id_card", "bank_book"].includes(attachment.category));
    setExistingAttachments((current) => {
      const otherAttachments = current[type]
        .filter((attachment) => !["id_card", "bank_book"].includes(attachment.category));
      const uniqueReusable = reusableAttachments.filter((attachment, index, source) => (
        source.findIndex((item) => item.category === attachment.category) === index
      ));
      return { ...current, [type]: [...otherAttachments, ...uniqueReusable] };
    });
    setPendingAttachments((current) => {
      const identityFiles = current[type]
        .filter((attachment) => ["id_card", "bank_book"].includes(attachment.category));
      identityFiles.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
      return {
        ...current,
        [type]: current[type].filter((attachment) => !["id_card", "bank_book"].includes(attachment.category)),
      };
    });

    const documentLabels = [
      reusableAttachments.some((attachment) => attachment.category === "id_card") ? "บัตรประชาชน" : "",
      reusableAttachments.some((attachment) => attachment.category === "bank_book") ? "หน้าบัญชี" : "",
    ].filter(Boolean);
    showMessage(
      "success",
      documentLabels.length
        ? `ใช้ข้อมูล ${payee.name} พร้อม ${documentLabels.join(" และ ")} แล้ว`
        : `ใช้ข้อมูล ${payee.name} แล้ว — ยังไม่พบเอกสารประจำตัวในประวัติ`,
    );
  }

  function updateItem(type: PaymentRequestType, id: string, field: keyof PaymentItem, value: string) {
    setItems((current) => {
      const nextItems = current[type].map((item) => {
        if (item.id !== id) return item;
        const numericFields: Array<keyof PaymentItem> = ["quantity", "unit_price", "amount", "material_unit_price", "labor_unit_price", "claim_percent"];
        const next = { ...item, [field]: numericFields.includes(field) ? num(value) : value } as PaymentItem;
        if (type === "contractor_claim") {
          const quantity = num(next.quantity);
          const materialUnitPrice = num(next.material_unit_price);
          const laborUnitPrice = num(next.labor_unit_price);
          next.material_amount = Math.round(quantity * materialUnitPrice * 100) / 100;
          next.labor_amount = Math.round(quantity * laborUnitPrice * 100) / 100;
          next.unit_price = Math.round((materialUnitPrice + laborUnitPrice) * 100) / 100;
          next.contract_total = Math.round((num(next.material_amount) + num(next.labor_amount)) * 100) / 100;
          if (field === "claim_percent") {
            next.amount = Math.round(num(next.contract_total) * num(next.claim_percent) / 100 * 100) / 100;
          } else if (field === "amount") {
            next.claim_percent = num(next.contract_total) > 0
              ? Math.round(num(next.amount) / num(next.contract_total) * 100 * 10000) / 10000
              : 0;
          } else if (num(next.claim_percent) > 0) {
            next.amount = Math.round(num(next.contract_total) * num(next.claim_percent) / 100 * 100) / 100;
          }
        } else {
          next.amount = Math.round(next.quantity * next.unit_price * 100) / 100;
        }
        return next;
      });
      return { ...current, [type]: nextItems };
    });
  }

  function addFiles(type: PaymentRequestType, category: PaymentAttachment["category"], files: FileList | null) {
    if (!files?.length) return;
    const replaceIdentityDocument = ["id_card", "bank_book"].includes(category);
    const selectedFiles = replaceIdentityDocument ? Array.from(files).slice(-1) : Array.from(files);
    const added = selectedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      category,
      caption: category === "id_card" ? "บัตรประจำตัวประชาชนผู้รับเงิน" : category === "bank_book" ? "ข้อมูลบัญชีสำหรับรับโอนเงิน" : category === "receipt" ? "ใบเสร็จ/เอกสารประกอบ" : "รูปหลักฐานการทำงาน",
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    }));
    if (replaceIdentityDocument) {
      setExistingAttachments((current) => ({
        ...current,
        [type]: current[type].filter((attachment) => attachment.category !== category),
      }));
    }
    setPendingAttachments((current) => {
      const replaced = replaceIdentityDocument
        ? current[type].filter((attachment) => {
          if (attachment.category !== category) return true;
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
          return false;
        })
        : current[type];
      return { ...current, [type]: [...replaced, ...added] };
    });
  }

  function removePending(type: PaymentRequestType, id: string) {
    setPendingAttachments((current) => {
      const target = current[type].find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return { ...current, [type]: current[type].filter((item) => item.id !== id) };
    });
  }

  function totalsFor(type: PaymentRequestType) {
    const form = forms[type];
    return calculatePaymentTotals({
      items: items[type], vatRate: num(form.vat_rate), whtRate: num(form.wht_rate), retentionRate: num(form.retention_rate),
      advanceDeduction: num(form.advance_deduction), otherDeduction: num(form.other_deduction),
      deductionSequence: type === "contractor_claim" ? "retention_then_wht" : "standard",
    });
  }

  function emailFor(type: PaymentRequestType) {
    const form = forms[type];
    return buildPaymentEmail({
      projectName: project.name, title: form.title, items: items[type], totals: totalsFor(type), vatRate: num(form.vat_rate),
      whtRate: num(form.wht_rate), retentionRate: num(form.retention_rate), bankName: form.bank_name,
      bankAccountNo: form.bank_account_no, bankAccountName: form.bank_account_name, preparedBy, preparedByPhone: form.prepared_by_phone,
    });
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      showMessage("success", success);
    } catch {
      showMessage("error", "คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง");
    }
  }

  async function save(type: PaymentRequestType, generatePdf = false) {
    const form = forms[type];
    setBusy(generatePdf ? `pdf-${type}` : `save-${type}`);
    setMessage(null);
    try {
      const savedItems = items[type].filter((item) => item.description.trim() || item.unit.trim() || item.unit_price > 0 || item.amount > 0);
      const calculatedContractAmount = savedItems.reduce((sum, item) => sum + num(item.contract_total), 0);
      const payload = {
        ...form,
        contract_amount: type === "contractor_claim" && calculatedContractAmount > 0 ? calculatedContractAmount : form.contract_amount,
        items: savedItems,
        attachments: existingAttachments[type],
      };
      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      pendingAttachments[type].forEach((attachment) => {
        formData.append("attachment_files", attachment.file);
        formData.append("attachment_categories", attachment.category);
        formData.append("attachment_captions", attachment.caption);
      });
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "บันทึกรายการไม่สำเร็จ");
      const saved = result.data as PaymentRequestRecord & { attachments?: PaymentAttachment[]; items?: PaymentItem[] };
      setForms((current) => ({ ...current, [type]: { ...current[type], request_id: saved.request_id, status: saved.status || "draft" } }));
      setExistingAttachments((current) => ({ ...current, [type]: saved.attachments || parsePaymentAttachments(saved.attachments_json) }));
      pendingAttachments[type].forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      setPendingAttachments((current) => ({ ...current, [type]: [] }));
      await mutate();
      if (generatePdf) await downloadPdf(saved.request_id, saved.pdf_file_name || "payment-request.pdf", type);
      else showMessage("success", "บันทึกแบบร่างเรียบร้อยแล้ว");
    } catch (saveError) {
      showMessage("error", saveError instanceof Error ? saveError.message : "บันทึกรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function downloadPdf(requestId: string, fileName: string, type?: PaymentRequestType) {
    const ownBusy = !type;
    if (ownBusy) setBusy(`download-${requestId}`);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_pdf", request_id: requestId }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "สร้าง PDF ไม่สำเร็จ");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const encodedFileName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const responseFileName = encodedFileName ? decodeURIComponent(encodedFileName) : fileName;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = responseFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      await mutate();
      showMessage("success", "สร้างและดาวน์โหลด PDF เรียบร้อยแล้ว");
    } catch (pdfError) {
      showMessage("error", pdfError instanceof Error ? pdfError.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      if (ownBusy) setBusy("");
    }
  }

  async function setRequestStatus(requestId: string, status: string, paidAmount?: number) {
    setBusy(`status-${requestId}`);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_status", request_id: requestId, status, paid_amount: paidAmount }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "อัปเดตสถานะไม่สำเร็จ");
      await mutate();
      showMessage("success", status === "closed" ? "ปิดรายการเรียบร้อยแล้ว" : "อัปเดตสถานะเรียบร้อยแล้ว");
    } catch (statusError) {
      showMessage("error", statusError instanceof Error ? statusError.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  function loadRecord(record: PaymentRequestRecord, duplicate = false) {
    const type = record.request_type;
    setForms((current) => ({ ...current, [type]: {
      request_id: duplicate ? "" : record.request_id, request_type: type, title: record.title, request_date: duplicate ? todayBangkok() : record.request_date,
      status: duplicate ? "draft" : record.status, payee_name: record.payee_name, payee_tax_id: record.payee_tax_id, payee_address: record.payee_address,
      bank_name: record.bank_name, bank_account_no: record.bank_account_no, bank_account_name: record.bank_account_name, contractor_id: record.contractor_id,
      work_package: record.work_package, claim_period: duplicate ? "" : record.claim_period, contract_amount: String(record.contract_amount || ""),
      vat_rate: String(record.vat_rate || 0), wht_rate: String(record.wht_rate || 0), retention_rate: String(record.retention_rate || 0),
      advance_deduction: String(record.advance_deduction || 0), other_deduction: String(record.other_deduction || 0), notes: record.notes || "", prepared_by_phone: "",
    } }));
    setItems((current) => ({ ...current, [type]: padPaymentItems(parsePaymentItems(record.items_json).map((item) => ({ ...item, id: `${item.id}-${Date.now()}` }))) }));
    setExistingAttachments((current) => ({ ...current, [type]: parsePaymentAttachments(record.attachments_json) }));
    setPendingAttachments((current) => ({ ...current, [type]: [] }));
    switchToForm(type);
  }

  function startNextClaim(record: PaymentRequestRecord, allowExtend = false) {
    let nextPeriod = nextClaimPeriod(record.claim_period || "");
    if (nextPeriod === null && allowExtend) {
      const current = Number(String(record.claim_period || "").match(/\d+/)?.[0] || 0);
      nextPeriod = current > 0 ? String(current + 1) : "";
    }
    if (nextPeriod === null) {
      showMessage("error", `งวด ${record.claim_period} เป็นงวดสุดท้ายแล้ว`);
      return;
    }
    const type: PaymentRequestType = "contractor_claim";
    const copiedItems = parsePaymentItems(record.items_json).map((item, index) => ({
      ...item,
      id: `next-${Date.now()}-${index}`,
      boq_key: item.boq_key || item.id || `boq-${index + 1}`,
      amount: 0,
      claim_percent: 0,
    }));
    const reusableAttachments = parsePaymentAttachments(record.attachments_json).filter((attachment) => ["id_card", "bank_book"].includes(attachment.category));
    setForms((current) => ({ ...current, [type]: {
      request_id: "", request_type: type, title: record.title, request_date: todayBangkok(), status: "draft",
      payee_name: record.payee_name, payee_tax_id: record.payee_tax_id, payee_address: record.payee_address,
      bank_name: record.bank_name, bank_account_no: record.bank_account_no, bank_account_name: record.bank_account_name,
      contractor_id: record.contractor_id, work_package: record.work_package, claim_period: nextPeriod,
      contract_amount: String(record.contract_amount || ""), vat_rate: String(record.vat_rate || 0), wht_rate: String(record.wht_rate || 0),
      retention_rate: String(record.retention_rate || 0), advance_deduction: "0", other_deduction: "0", notes: "", prepared_by_phone: "",
    } }));
    setItems((current) => ({ ...current, [type]: padPaymentItems(copiedItems) }));
    setExistingAttachments((current) => ({ ...current, [type]: reusableAttachments }));
    setPendingAttachments((current) => ({ ...current, [type]: [] }));
    setTab(type);
    showMessage("success", nextPeriod ? `เตรียมงวด ${nextPeriod} แล้ว กรอกเฉพาะปริมาณงานงวดนี้ได้เลย` : "เตรียมงวดถัดไปแล้ว กรอกเลขงวดและปริมาณงานงวดนี้ได้เลย");
  }

  function reset(type: PaymentRequestType) {
    pendingAttachments[type].forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setForms((current) => ({ ...current, [type]: blankForm(type) }));
    setItems((current) => ({ ...current, [type]: padPaymentItems([]) }));
    setExistingAttachments((current) => ({ ...current, [type]: [] }));
    setPendingAttachments((current) => ({ ...current, [type]: [] }));
  }

  const contractorForm = forms.contractor_claim;
  const contractorIdentity = String(contractorForm.contractor_id || contractorForm.payee_name).trim().toLowerCase();
  const workPackage = contractorForm.work_package.trim().toLowerCase();
  const currentClaimHistory = contractorIdentity && workPackage
    ? requests.filter((row) => (
      row.request_type === "contractor_claim" &&
      row.request_id !== contractorForm.request_id &&
      row.status !== "cancelled" &&
      String(row.contractor_id || row.payee_name).trim().toLowerCase() === contractorIdentity &&
      String(row.work_package).trim().toLowerCase() === workPackage
    )).sort((a, b) => `${a.request_date}-${a.created_at}`.localeCompare(`${b.request_date}-${b.created_at}`))
    : [];

  return (
    <div className="space-y-5">
      {message && <div className={`fixed right-4 top-20 z-[70] max-w-md rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <TabButton active={tab === "overview"} icon={<History size={17} />} label="ภาพรวม" onClick={() => setTab("overview")} />
        <TabButton active={tab === "voucher"} icon={<WalletCards size={17} />} label="สร้างใบสำคัญจ่าย" onClick={() => switchToForm("voucher")} />
        <TabButton active={tab === "contractor_claim"} icon={<BriefcaseBusiness size={17} />} label="สร้างใบเบิกงวดงานผู้รับเหมา" onClick={() => switchToForm("contractor_claim")} />
      </div>

      {tab === "overview" ? (
        <Overview requests={requests} stats={stats} loading={isLoading} error={error} busy={busy} onNew={switchToForm} onEdit={(record) => loadRecord(record)} onDuplicate={(record) => loadRecord(record, true)} onNextClaim={startNextClaim} onDownload={downloadPdf} onCopy={copyText} onStatus={setRequestStatus} />
      ) : (
        <>
          {tab === "contractor_claim" && <ContractorClaimLedger
            requests={requests}
            loading={isLoading}
            error={error}
            onNew={() => {
              reset("contractor_claim");
              window.setTimeout(() => document.getElementById("contractor-claim-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
            onEdit={(record) => {
              loadRecord(record);
              window.setTimeout(() => document.getElementById("contractor-claim-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
            onNextClaim={(record) => {
              startNextClaim(record, true);
              window.setTimeout(() => document.getElementById("contractor-claim-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
          />}
          <div id={tab === "contractor_claim" ? "contractor-claim-form" : undefined} className="scroll-mt-24">
            <PaymentForm
              type={tab}
              projectName={project.name}
              preparedBy={preparedBy}
              form={forms[tab]}
              items={items[tab]}
              totals={totalsFor(tab)}
              claimHistory={tab === "contractor_claim" ? currentClaimHistory : []}
              payees={data?.payees || []}
              contractors={data?.contractors || []}
              laborRates={data?.labor_rates || []}
              existingAttachments={existingAttachments[tab]}
              pendingAttachments={pendingAttachments[tab]}
              busy={busy}
              email={emailFor(tab)}
              setField={(field, value) => setField(tab, field, value)}
              updateItem={(id, field, value) => updateItem(tab, id, field, value)}
              addItem={() => setItems((current) => ({ ...current, [tab]: [...current[tab], blankItem()] }))}
              removeItem={(id) => setItems((current) => ({ ...current, [tab]: current[tab].length > 1 ? current[tab].filter((item) => item.id !== id) : current[tab] }))}
              addFiles={(category, files) => addFiles(tab, category, files)}
              removePending={(id) => removePending(tab, id)}
              removeExisting={(fileId) => setExistingAttachments((current) => ({ ...current, [tab]: current[tab].filter((item) => item.file_id !== fileId) }))}
              onSelectPayee={(payee) => applyPayee(tab, payee)}
              onSave={() => save(tab, false)}
              onPdf={() => save(tab, true)}
              onCopy={(value, label) => copyText(value, label)}
              onReset={() => reset(tab)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${active ? "bg-orange-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}>{icon}{label}</button>;
}

function ContractorClaimLedger({ requests, loading, error, onNew, onEdit, onNextClaim }: {
  requests: PaymentRequestRecord[];
  loading: boolean;
  error: unknown;
  onNew: () => void;
  onEdit: (record: PaymentRequestRecord) => void;
  onNextClaim: (record: PaymentRequestRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => buildContractorLedger(requests), [requests]);
  const periodCount = Math.min(24, Math.max(3, ...rows.map((row) => {
    const declaredPeriods = row.claims.map((claim) => Number(String(claim.claim_period || "").match(/\/(\d+)/)?.[1] || 0));
    return Math.max(row.claims.length, ...declaredPeriods, 0);
  })));
  const periods = Array.from({ length: periodCount }, (_, index) => index);
  const totals = rows.reduce((summary, row) => ({
    contracts: summary.contracts + row.contractAmount,
    claimed: summary.claimed + row.claimedAmount,
    remaining: summary.remaining + row.remainingAmount,
  }), { contracts: 0, claimed: 0, remaining: 0 });

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  return <>{expanded && <button type="button" aria-label="ย่อสมุดคุมงวด" onClick={() => setExpanded(false)} className="fixed inset-0 z-[89] cursor-default bg-slate-950/60 backdrop-blur-sm" />}<section className={`${expanded ? "fixed inset-3 z-[90] flex flex-col shadow-2xl sm:inset-5" : "shadow-sm"} overflow-hidden rounded-3xl border border-slate-200 bg-white`}>
    <div className="flex flex-col gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-[#521015] px-5 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#c7251f] shadow-lg shadow-red-950/30"><Calculator size={21} /></span>
        <div><h2 className="text-lg font-black sm:text-xl">สมุดคุมงวดงานผู้รับเหมา</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-300 sm:text-sm">หนึ่งแถวต่อหนึ่งหมวดงาน • ยอดคงเหลือคำนวณจากยอดเบิกก่อนหักภาษีและประกันผลงาน</p></div>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setExpanded((current) => !current)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/20">{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}{expanded ? "ย่อหน้าจอ" : "ขยายเต็มจอ"}</button><button type="button" onClick={onNew} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-orange-400"><Plus size={17} />เริ่มหมวดงานใหม่</button></div>
    </div>

    <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 sm:grid-cols-4">
      <LedgerMetric label="หมวดงาน" value={String(rows.length)} suffix="รายการ" />
      <LedgerMetric label="มูลค่าสัญญารวม" value={formatPaymentMoney(totals.contracts)} suffix="บาท" />
      <LedgerMetric label="เบิกสะสมก่อนหัก" value={formatPaymentMoney(totals.claimed)} suffix="บาท" tone="blue" />
      <LedgerMetric label="คงเหลือที่เบิกได้" value={formatPaymentMoney(totals.remaining)} suffix="บาท" tone="green" />
    </div>

    {loading ? <PanelState icon={<Loader2 className="animate-spin" />} text="กำลังโหลดสมุดคุมงวดงาน..." /> : error ? <PanelState icon={<RefreshCw />} text="โหลดสมุดคุมงวดงานไม่สำเร็จ" tone="error" /> : rows.length === 0 ? <div className="flex min-h-44 flex-col items-center justify-center gap-3 p-8 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[#a9141d]"><BriefcaseBusiness size={22} /></span><div><p className="font-black text-slate-800">ยังไม่มีหมวดงานที่บันทึก</p><p className="mt-1 text-sm font-semibold text-slate-400">เริ่มกรอกใบเบิกงวดแรก แล้วระบบจะสร้างแถวติดตามให้อัตโนมัติ</p></div><button type="button" onClick={onNew} className="rounded-xl bg-[#a9141d] px-4 py-2.5 text-sm font-black text-white hover:bg-[#851018]">กรอกงวดแรก</button></div> : <>
      <div className={`${expanded ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto"}`}>
        <table className="min-w-max border-collapse text-sm">
          <thead className={expanded ? "sticky top-0 z-30" : ""}>
            <tr className="bg-slate-900 text-white">
              <th rowSpan={2} className="sticky left-0 z-20 min-w-[260px] border-r border-slate-700 bg-slate-900 px-4 py-3 text-left">ผู้รับเหมา / หมวดงาน</th>
              <th rowSpan={2} className="min-w-[145px] border-r border-slate-700 px-4 py-3 text-right">มูลค่าสัญญา</th>
              <th colSpan={periodCount} className="border-b border-r border-slate-700 px-4 py-2 text-center">รายการเบิกแต่ละงวด (ยอดก่อนหัก)</th>
              <th rowSpan={2} className="min-w-[135px] border-r border-slate-700 px-4 py-3 text-right">เบิกสะสม</th>
              <th rowSpan={2} className="min-w-[145px] border-r border-slate-700 bg-emerald-800 px-4 py-3 text-right">คงเหลือ</th>
              <th rowSpan={2} className="min-w-[155px] px-4 py-3 text-center">จัดการ</th>
            </tr>
            <tr className="bg-slate-800 text-xs text-slate-200">{periods.map((period) => <th key={period} className="min-w-[145px] border-r border-slate-700 px-3 py-2.5 text-center">งวดที่ {period + 1}</th>)}</tr>
          </thead>
          <tbody>{rows.map((row) => {
            const latest = row.claims[row.claims.length - 1];
            const progress = row.contractAmount > 0 ? Math.min(100, row.claimedAmount / row.contractAmount * 100) : 0;
            const complete = row.contractAmount > 0 && row.remainingAmount <= 0.005;
            return <tr key={row.key} className="group border-b border-slate-200 bg-white align-stretch hover:bg-orange-50/30">
              <td className="sticky left-0 z-10 min-w-[260px] border-r border-slate-200 bg-white px-4 py-3 group-hover:bg-orange-50">
                <div className="font-black text-slate-900">{row.workPackage}</div>
                <div className="mt-1 text-xs font-bold text-slate-500">{row.contractorName}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-[#c7251f]"}`} style={{ width: `${progress}%` }} /></div>
                <div className="mt-1 text-[11px] font-extrabold text-slate-400">ดำเนินการแล้ว {progress.toFixed(1)}%</div>
              </td>
              <td className="border-r border-slate-200 px-4 py-3 text-right text-base font-black text-slate-900">{formatPaymentMoney(row.contractAmount)}</td>
              {periods.map((period) => {
                const claim = row.claims[period];
                if (!claim) return <td key={period} className="border-r border-slate-200 bg-slate-50/60 px-3 py-3 text-center text-slate-300">—</td>;
                const percent = row.contractAmount > 0 ? num(claim.subtotal) / row.contractAmount * 100 : 0;
                return <td key={period} className="border-r border-slate-200 p-1.5">
                  <button type="button" onClick={() => onEdit(claim)} className="block w-full rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-right transition hover:border-blue-300 hover:bg-blue-100">
                    <span className="flex items-center justify-between gap-2 text-[11px] font-extrabold text-blue-500"><span>{claim.claim_period || `งวด ${period + 1}`}</span><span>{percent.toFixed(1)}%</span></span>
                    <strong className="mt-1 block text-base font-black text-blue-800">{formatPaymentMoney(claim.subtotal)}</strong>
                    <span className="mt-0.5 block text-[10px] font-semibold text-blue-500">{claim.request_date} • คลิกเปิด</span>
                  </button>
                </td>;
              })}
              <td className="border-r border-slate-200 bg-blue-50/40 px-4 py-3 text-right"><strong className="text-base font-black text-blue-800">{formatPaymentMoney(row.claimedAmount)}</strong><div className="mt-1 text-[11px] font-bold text-blue-500">ก่อนรายการหัก</div></td>
              <td className={`border-r border-slate-200 px-4 py-3 text-right ${complete ? "bg-emerald-100" : "bg-emerald-50"}`}><strong className="text-lg font-black text-emerald-800">{formatPaymentMoney(row.remainingAmount)}</strong><div className="mt-1 text-[11px] font-extrabold text-emerald-600">{complete ? "เบิกครบสัญญา" : "ยังเบิกได้"}</div></td>
              <td className="px-3 py-3 text-center">{complete ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700"><BadgeCheck size={15} />ครบแล้ว</span> : latest ? <button type="button" onClick={() => onNextClaim(latest)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#a9141d] px-3 py-2 text-xs font-black text-white hover:bg-[#851018]"><Plus size={15} />เพิ่มงวดถัดไป</button> : null}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-200 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-900 sm:flex-row sm:items-center sm:justify-between"><span>หลักการคำนวณ: คงเหลือ = มูลค่าสัญญา − ยอดเบิกสะสมก่อนหัก</span><span className="text-amber-700">ภาษี 3% / 7%, ประกันผลงาน และเงินล่วงหน้า ใช้คำนวณยอดโอนสุทธิของแต่ละงวดเท่านั้น</span></div>
    </>}
  </section></>;
}

function LedgerMetric({ label, value, suffix, tone = "default" }: { label: string; value: string; suffix: string; tone?: "default" | "blue" | "green" }) {
  const valueTone = tone === "green" ? "text-emerald-700" : tone === "blue" ? "text-blue-700" : "text-slate-950";
  return <div className="border-b border-r border-slate-200 px-4 py-3 sm:px-5"><div className="text-[11px] font-black text-slate-500 sm:text-xs">{label}</div><div className={`mt-1 text-lg font-black tracking-tight sm:text-xl ${valueTone}`}>{value} <span className="text-xs font-bold text-slate-400">{suffix}</span></div></div>;
}

function Overview({ requests, stats, loading, error, busy, onNew, onEdit, onDuplicate, onNextClaim, onDownload, onCopy, onStatus }: {
  requests: PaymentRequestRecord[]; stats: { all: number; pdf: number; paid: number; amount: number }; loading: boolean; error: unknown; busy: string;
  onNew: (type: PaymentRequestType) => void; onEdit: (record: PaymentRequestRecord) => void; onDuplicate: (record: PaymentRequestRecord) => void; onNextClaim: (record: PaymentRequestRecord) => void;
  onDownload: (id: string, fileName: string) => void; onCopy: (value: string, label: string) => void; onStatus: (id: string, status: string, paid?: number) => void;
}) {
  const [selected, setSelected] = useState<PaymentRequestRecord | null>(null);
  return <><div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<FileText size={23} />} label="เอกสารทั้งหมด" value={String(stats.all)} detail="ภายในโครงการนี้" tone="gray" />
      <Metric icon={<Download size={23} />} label="สร้าง PDF แล้ว" value={String(stats.pdf)} detail="พร้อมนำไปส่งอีเมล" tone="blue" />
      <Metric icon={<BadgeCheck size={23} />} label="จ่าย/ปิดแล้ว" value={String(stats.paid)} detail="ติ๊กติดตามภายใน" tone="green" />
      <Metric icon={<Banknote size={23} />} label="ยอดสุทธิสะสม" value={formatPaymentMoney(stats.amount)} detail="บาท" tone="orange" />
    </div>
    <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div><div className="text-lg font-black">สร้างชุดเอกสารใหม่</div><p className="mt-1 text-sm font-semibold text-slate-300">กรอกครั้งเดียว ได้ PDF พร้อมเอกสารแนบและข้อความอีเมล</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onNew("voucher")} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-extrabold hover:bg-orange-400">ใบสำคัญจ่าย</button><button type="button" onClick={() => onNew("contractor_claim")} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-extrabold ring-1 ring-white/20 hover:bg-white/20">ใบเบิกงวดผู้รับเหมา</button></div>
    </div>
    <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4"><h3 className="font-black text-gray-950">ประวัติเอกสารของโครงการ</h3><p className="text-xs font-semibold text-gray-400">ดาวน์โหลดซ้ำ คัดลอกข้อความ หรือสร้างรายการใหม่จากข้อมูลเดิมได้</p></div>
      {loading ? <PanelState icon={<Loader2 className="animate-spin" />} text="กำลังโหลดประวัติเอกสาร..." /> : error ? <PanelState icon={<RefreshCw />} text="โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่" tone="error" /> : requests.length === 0 ? <PanelState icon={<FileText />} text="ยังไม่มีเอกสารเบิกเงินในโครงการนี้" /> : <div className="overflow-x-auto"><table className="min-w-[1050px] w-full"><thead className="bg-gray-50 text-left text-[11px] font-extrabold uppercase tracking-wide text-gray-400"><tr><th className="px-5 py-3">เลขที่/วันที่</th><th className="px-4 py-3">รายการ</th><th className="px-4 py-3">ผู้รับเงิน</th><th className="px-4 py-3 text-right">ยอดสุทธิ</th><th className="px-4 py-3">สถานะ</th><th className="px-5 py-3 text-right">จัดการ</th></tr></thead><tbody className="divide-y divide-gray-100">{requests.map((record) => <tr key={record.request_id} tabIndex={0} onClick={() => setSelected(record)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(record); } }} className="cursor-pointer outline-none transition hover:bg-orange-50/60 focus:bg-orange-50 focus:ring-2 focus:ring-inset focus:ring-orange-300"><td className="px-5 py-4"><div className="font-extrabold text-gray-900">{record.document_no || "แบบร่าง"}</div><div className="text-xs text-gray-400">{record.request_date}</div></td><td className="px-4 py-4"><div className="font-bold text-gray-900">{record.title}</div><div className="text-xs text-gray-400">{record.request_type === "contractor_claim" ? `เบิกงวดผู้รับเหมา ${record.claim_period || ""}` : "ใบสำคัญจ่าย"}</div></td><td className="px-4 py-4"><div className="font-semibold text-gray-700">{record.payee_name}</div><div className="text-xs text-gray-400">{record.bank_name || "-"}</div></td><td className="px-4 py-4 text-right font-black text-orange-700">{formatPaymentMoney(record.net_amount)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${statusTone(record.status)}`}>{statusText(record.status)}</span></td><td className="px-5 py-4" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><div className="flex justify-end gap-1.5"><IconAction label="แก้ไข" icon={<FileText size={15} />} onClick={() => onEdit(record)} />{record.request_type === "contractor_claim" && nextClaimPeriod(record.claim_period || "") !== null && <IconAction label="สร้างงวดถัดไป" icon={<ArrowRight size={15} />} onClick={() => onNextClaim(record)} />}<IconAction label="ทำสำเนา" icon={<Copy size={15} />} onClick={() => onDuplicate(record)} /><IconAction label="คัดลอกอีเมล" icon={<ClipboardCopy size={15} />} onClick={() => onCopy(`หัวข้อ: ${record.email_subject}\n\n${record.email_body}`, "คัดลอกข้อความอีเมลแล้ว")} /><IconAction label="ดาวน์โหลด PDF" loading={busy === `download-${record.request_id}`} icon={<Download size={15} />} onClick={() => onDownload(record.request_id, record.pdf_file_name || `${record.document_no}.pdf`)} />{!["paid", "closed"].includes(record.status) && <IconAction label="จ่ายครบ/ปิด" icon={<Check size={15} />} onClick={() => onStatus(record.request_id, "closed", num(record.net_amount))} />}</div></td></tr>)}</tbody></table></div>}
    </section>
  </div>{selected && <PaymentRequestDetailModal record={selected} busy={busy} onClose={() => setSelected(null)} onEdit={() => { setSelected(null); onEdit(selected); }} onNextClaim={selected.request_type === "contractor_claim" && nextClaimPeriod(selected.claim_period || "") !== null ? () => { setSelected(null); onNextClaim(selected); } : undefined} onDownload={() => onDownload(selected.request_id, selected.pdf_file_name || `${selected.document_no}.pdf`)} onCopy={() => onCopy(`หัวข้อ: ${selected.email_subject}\n\n${selected.email_body}`, "คัดลอกข้อความอีเมลแล้ว")} onCloseRequest={() => onStatus(selected.request_id, "closed", num(selected.net_amount))} />}</>;
}

function PaymentRequestDetailModal({ record, busy, onClose, onEdit, onNextClaim, onDownload, onCopy, onCloseRequest }: {
  record: PaymentRequestRecord;
  busy: string;
  onClose: () => void;
  onEdit: () => void;
  onNextClaim?: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onCloseRequest: () => void;
}) {
  const detailItems = parsePaymentItems(record.items_json);
  const attachments = parsePaymentAttachments(record.attachments_json);
  const contractorClaim = record.request_type === "contractor_claim";
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="payment-request-detail-title">
    <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-label="ปิดรายละเอียดรายการ" />
    <div className="relative my-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-5 text-white sm:px-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-300"><span>{record.document_no || "แบบร่าง"}</span><span>•</span><span>{record.request_date}</span><span className={`rounded-full px-2.5 py-1 ring-1 ${statusTone(record.status)}`}>{statusText(record.status)}</span></div>
          <h2 id="payment-request-detail-title" className="mt-2 text-xl font-black leading-tight sm:text-2xl">{record.title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-300">{contractorClaim ? "ใบเบิกงวดงานผู้รับเหมา" : "ใบสำคัญจ่าย"}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="ปิด Popup"><X size={20} /></button>
      </header>

      <div className="max-h-[72vh] space-y-5 overflow-y-auto p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard label="ผู้รับเงิน" value={record.payee_name || "-"} />
          <DetailCard label="ธนาคาร" value={record.bank_name || "-"} detail={record.bank_account_no || "-"} />
          <DetailCard label="ชื่อบัญชี" value={record.bank_account_name || "-"} />
          <DetailCard label="ยอดโอนสุทธิ" value={`${formatPaymentMoney(record.net_amount)} บาท`} tone="orange" />
        </div>

        {contractorClaim && <section className="grid gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><DetailLine label="แพ็กเกจงาน" value={record.work_package || "-"} /><DetailLine label="งวดที่" value={record.claim_period || "-"} /><DetailLine label="มูลค่าสัญญา" value={formatPaymentMoney(record.contract_amount)} /><DetailLine label="เบิกก่อนหน้า" value={formatPaymentMoney(record.previous_claim_amount)} /></section>}

        <section className="overflow-hidden rounded-2xl border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3"><h3 className="font-black text-gray-900">รายการเบิกเงิน</h3></div>
          <div className="overflow-x-auto"><table className="min-w-[650px] w-full"><thead className="bg-white text-left text-[11px] font-extrabold text-gray-400"><tr><th className="w-12 px-4 py-3 text-center">#</th><th className="px-4 py-3">รายการ</th><th className="px-4 py-3 text-right">จำนวน</th><th className="px-4 py-3">หน่วย</th><th className="px-4 py-3 text-right">ราคาต่อหน่วย</th><th className="px-4 py-3 text-right">จำนวนเงิน</th></tr></thead><tbody className="divide-y divide-gray-100">{detailItems.map((item, index) => <tr key={item.id}><td className="px-4 py-3 text-center text-xs font-bold text-gray-400">{index + 1}</td><td className="px-4 py-3 text-sm font-bold text-gray-800">{item.description}</td><td className="px-4 py-3 text-right text-sm text-gray-600">{formatPaymentMoney(item.quantity)}</td><td className="px-4 py-3 text-sm text-gray-600">{item.unit || "-"}</td><td className="px-4 py-3 text-right text-sm text-gray-600">{formatPaymentMoney(item.unit_price)}</td><td className="px-4 py-3 text-right text-sm font-black text-gray-950">{formatPaymentMoney(item.amount)}</td></tr>)}</tbody></table></div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
          <section className="space-y-3 rounded-2xl border border-gray-200 p-4"><h3 className="font-black text-gray-900">ข้อมูลเพิ่มเติม</h3><DetailLine label="เลขประจำตัวผู้เสียภาษี" value={record.payee_tax_id || "-"} /><DetailLine label="ที่อยู่" value={record.payee_address || "-"} />{record.notes && <DetailLine label="หมายเหตุ" value={record.notes} />}</section>
          <section className="space-y-2 rounded-2xl border border-orange-100 bg-orange-50 p-4"><h3 className="mb-3 font-black text-orange-900">สรุปยอด</h3><SummaryRow label="มูลค่างาน" value={num(record.subtotal)} /><SummaryRow label={`VAT ${num(record.vat_rate)}%`} value={num(record.vat_amount)} positive /><SummaryRow label={`หัก ณ ที่จ่าย ${num(record.wht_rate)}%`} value={num(record.wht_amount)} deduct /><SummaryRow label={`ประกันผลงาน ${num(record.retention_rate)}%`} value={num(record.retention_amount)} deduct /><SummaryRow label="หักเงินล่วงหน้า" value={num(record.advance_deduction)} deduct /><SummaryRow label="หักอื่น ๆ" value={num(record.other_deduction)} deduct /><div className="border-t border-orange-200 pt-2"><SummaryRow label="ยอดโอนสุทธิ" value={num(record.net_amount)} strong /></div></section>
        </div>

        {attachments.length > 0 && <section><div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Paperclip size={17} className="text-violet-600" /><h3 className="font-black text-gray-900">เอกสารแนบ ({attachments.length})</h3></div><span className="text-[11px] font-bold text-gray-400">คลิกรูปเพื่อดูขนาดเต็ม</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{attachments.map((attachment) => { const preview = attachmentPreviewUrl(attachment); const href = preview || attachment.file_url; return <a key={attachment.file_id || attachment.file_name} href={href} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md">{preview ? <div className="overflow-hidden bg-slate-100"><Image unoptimized src={preview} alt={attachment.caption || attachment.file_name} width={640} height={360} className="h-36 w-full object-cover transition duration-200 group-hover:scale-[1.02]" /></div> : <div className="grid h-36 place-items-center bg-violet-50 text-violet-600"><FileText size={34} /><span className="sr-only">ไฟล์เอกสาร</span></div>}<span className="block min-w-0 border-t border-gray-100 p-3"><span className="block truncate text-xs font-extrabold text-gray-800">{attachment.caption || attachment.file_name}</span><span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-400">{attachment.file_name}</span></span></a>; })}</div></section>}
      </div>

      <footer className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 hover:border-orange-200 hover:text-orange-700">แก้ไขรายการ</button>
          {onNextClaim && <button type="button" onClick={onNextClaim} className="inline-flex items-center gap-2 rounded-xl bg-[#a9141d] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#851018]"><ArrowRight size={16} />สร้างงวดถัดไป</button>}
        </div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onCopy} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-100"><ClipboardCopy size={16} />คัดลอกอีเมล</button><button type="button" disabled={busy === `download-${record.request_id}`} onClick={onDownload} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-orange-700 disabled:opacity-60">{busy === `download-${record.request_id}` ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}ดาวน์โหลด PDF</button>{!["paid", "closed"].includes(record.status) && <button type="button" onClick={onCloseRequest} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700"><Check size={16} />จ่ายครบ/ปิด</button>}</div>
      </footer>
    </div>
  </div>;
}

function DetailCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: "default" | "orange" }) {
  return <div className={`rounded-2xl border p-4 ${tone === "orange" ? "border-orange-100 bg-orange-50" : "border-gray-200 bg-white"}`}><div className={`text-[11px] font-extrabold ${tone === "orange" ? "text-orange-500" : "text-gray-400"}`}>{label}</div><div className={`mt-1 break-words text-base font-black ${tone === "orange" ? "text-orange-700" : "text-gray-900"}`}>{value}</div>{detail && <div className="mt-1 text-xs font-semibold text-gray-400">{detail}</div>}</div>;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] font-extrabold text-gray-400">{label}</div><div className="mt-0.5 whitespace-pre-wrap text-sm font-bold text-gray-800">{value}</div></div>;
}

function PaymentForm({ type, projectName, preparedBy, form, items, totals, claimHistory, payees, contractors, laborRates, existingAttachments, pendingAttachments, busy, email, setField, updateItem, addItem, removeItem, addFiles, removePending, removeExisting, onSelectPayee, onSave, onPdf, onCopy, onReset }: {
  type: PaymentRequestType; projectName: string; preparedBy: string; form: FormState; items: PaymentItem[]; totals: ReturnType<typeof calculatePaymentTotals>; claimHistory: PaymentRequestRecord[];
  payees: PayeeSuggestion[]; contractors: Array<Record<string, string | number | undefined>>; laborRates: Array<Record<string, string | number | undefined>>; existingAttachments: PaymentAttachment[]; pendingAttachments: PendingAttachment[]; busy: string; email: { subject: string; body: string };
  setField: (field: keyof FormState, value: string) => void; updateItem: (id: string, field: keyof PaymentItem, value: string) => void; addItem: () => void; removeItem: (id: string) => void;
  addFiles: (category: PaymentAttachment["category"], files: FileList | null) => void; removePending: (id: string) => void; removeExisting: (fileId: string) => void;
  onSelectPayee: (payee: PayeeSuggestion) => void;
  onSave: () => void; onPdf: () => void; onCopy: (value: string, label: string) => void; onReset: () => void;
}) {
  const contractorClaim = type === "contractor_claim";
  const previousClaim = claimHistory.reduce((sum, record) => sum + num(record.subtotal), 0);
  const boqContractAmount = items.reduce((sum, item) => sum + num(item.contract_total), 0);
  const effectiveContractAmount = boqContractAmount || num(form.contract_amount);
  const contractRemaining = Math.max(0, effectiveContractAmount - previousClaim - totals.subtotal);
  const previousByItem = useMemo(() => {
    const amounts = new Map<string, number>();
    claimHistory.forEach((record) => {
      parsePaymentItems(record.items_json).forEach((item) => {
        const key = item.boq_key || item.description.trim().toLowerCase();
        if (key) amounts.set(key, (amounts.get(key) || 0) + num(item.amount));
      });
    });
    return amounts;
  }, [claimHistory]);
  const allAttachments = existingAttachments.length + pendingAttachments.length;
  return <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
    <div className="space-y-5">
      {contractorClaim ? <ContractorClaimSheetEditor
        projectName={projectName}
        form={form}
        items={items}
        totals={totals}
        claimHistory={claimHistory}
        previousByItem={previousByItem}
        previousClaim={previousClaim}
        contractAmount={effectiveContractAmount}
        contractRemaining={contractRemaining}
        payees={payees}
        contractors={contractors}
        laborRates={laborRates}
        onSelectPayee={onSelectPayee}
        setField={setField}
        updateItem={updateItem}
        addItem={addItem}
        removeItem={removeItem}
      /> : <VoucherSheetEditor projectName={projectName} preparedBy={preparedBy} form={form} items={items} totals={totals} payees={payees} onSelectPayee={onSelectPayee} setField={setField} updateItem={updateItem} addItem={addItem} />}

      {!contractorClaim && <FormSection icon={<Banknote size={18} />} title="ภาษีและรายการหัก" description="VAT และภาษีหัก ณ ที่จ่ายแยกจากกัน เพื่อลดความคลาดเคลื่อน">
        <div className="grid grid-cols-1 border-l border-t border-slate-300 sm:grid-cols-2 lg:grid-cols-5">
          <SheetCell label="VAT (%)"><select className={sheetInputClass} value={form.vat_rate} onChange={(event) => setField("vat_rate", event.target.value)}>{["0", "7"].map((value) => <option key={value} value={value}>{value}%</option>)}</select></SheetCell>
          <SheetCell label="หัก ณ ที่จ่าย (%)"><select className={sheetInputClass} value={form.wht_rate} onChange={(event) => setField("wht_rate", event.target.value)}>{["0", "1", "2", "3", "5"].map((value) => <option key={value} value={value}>{value}%</option>)}</select></SheetCell>
          <SheetCell label="ประกันผลงาน (%)"><select className={sheetInputClass} value={form.retention_rate} onChange={(event) => setField("retention_rate", event.target.value)}>{["0", "5"].map((value) => <option key={value} value={value}>{value}%</option>)}</select></SheetCell>
          <SheetCell label="หักเงินล่วงหน้า"><input type="number" min="0" step="0.01" className={`${sheetInputClass} text-right`} value={form.advance_deduction} onChange={(event) => setField("advance_deduction", event.target.value)} /></SheetCell>
          <SheetCell label="หักอื่น ๆ"><input type="number" min="0" step="0.01" className={`${sheetInputClass} text-right`} value={form.other_deduction} onChange={(event) => setField("other_deduction", event.target.value)} /></SheetCell>
        </div>
      </FormSection>}

      <FormSection icon={<ImagePlus size={18} />} title={`เอกสารแนบ (${allAttachments})`} description="แสดงตัวอย่างรูปทันที · คลิกรูปเพื่อเปิดขนาดเต็ม · ระบบจะจัดเป็นหน้าต่อท้าย PDF">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AttachmentPicker icon={<WalletCards size={19} />} label="บัตรประชาชน" category="id_card" onFiles={addFiles} /><AttachmentPicker icon={<Banknote size={19} />} label="หน้าบัญชี" category="bank_book" onFiles={addFiles} /><AttachmentPicker icon={<FileImage size={19} />} label="รูปหลักฐาน" category="evidence" multiple onFiles={addFiles} /><AttachmentPicker icon={<FileText size={19} />} label="ใบเสร็จ/เอกสาร" category="receipt" multiple onFiles={addFiles} /></div>
        {(existingAttachments.length > 0 || pendingAttachments.length > 0) && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{existingAttachments.map((attachment) => { const preview = attachmentPreviewUrl(attachment); const reusableIdentity = ["id_card", "bank_book"].includes(attachment.category); return <AttachmentCard key={attachment.file_id} name={attachment.caption || attachment.file_name} detail={reusableIdentity ? "เอกสารประจำผู้รับเงิน · พร้อมแนบใน PDF" : "บันทึกในโครงการแล้ว"} href={preview || attachment.file_url} preview={preview} onRemove={() => removeExisting(attachment.file_id)} />; })}{pendingAttachments.map((attachment) => <AttachmentCard key={attachment.id} name={attachment.caption} detail={attachment.file.name} preview={attachment.previewUrl} onRemove={() => removePending(attachment.id)} />)}</div>}
        <Field label="หมายเหตุ"><textarea className={textareaClass} rows={3} value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="เงื่อนไขหรือรายละเอียดเพิ่มเติมในเอกสาร" /></Field>
      </FormSection>
    </div>

    <aside className="space-y-4 2xl:sticky 2xl:top-5 2xl:self-start">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg"><div className="bg-gradient-to-br from-[#a9141d] via-[#851018] to-[#3f0a0d] p-5 text-white"><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-red-100"><Calculator size={15} />สรุปยอด</div><div className="mt-3 text-3xl font-black">{formatPaymentMoney(totals.netAmount)}</div><div className="text-sm font-bold text-red-100">ยอดโอนสุทธิ (บาท)</div></div><div className="space-y-2 p-5"><SummaryRow label="มูลค่างาน" value={totals.subtotal} /><SummaryRow label={`VAT ${form.vat_rate}%`} value={totals.vatAmount} positive />{contractorClaim ? <><SummaryRow label={`ประกันผลงาน ${form.retention_rate}%`} value={totals.retentionAmount} deduct /><SummaryRow label={`หัก ณ ที่จ่าย ${form.wht_rate}% (หลังหักประกัน)`} value={totals.whtAmount} deduct /></> : <><SummaryRow label={`หัก ณ ที่จ่าย ${form.wht_rate}%`} value={totals.whtAmount} deduct /><SummaryRow label={`ประกันผลงาน ${form.retention_rate}%`} value={totals.retentionAmount} deduct /></>}<SummaryRow label="หักเงินล่วงหน้า" value={totals.advanceDeduction} deduct /><SummaryRow label="หักอื่น ๆ" value={totals.otherDeduction} deduct /><div className="mt-3 border-t border-gray-200 pt-3"><SummaryRow label="ยอดสุทธิ" value={totals.netAmount} strong /></div></div></section>
      <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-black text-gray-950">ข้อความอีเมล</h3><p className="text-xs font-semibold text-gray-400">สร้างจากข้อมูลด้านซ้ายอัตโนมัติ</p></div><ClipboardCopy size={20} className="text-orange-600" /></div><div className="rounded-xl bg-gray-50 p-3 text-xs font-bold text-gray-700">หัวข้อ: {email.subject}</div><textarea readOnly className="mt-3 h-64 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-600 outline-none" value={email.body} /><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onCopy(email.subject, "คัดลอกหัวข้ออีเมลแล้ว")} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-50">คัดลอกหัวข้อ</button><button type="button" onClick={() => onCopy(email.body, "คัดลอกข้อความอีเมลแล้ว")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-extrabold text-white hover:bg-slate-800">คัดลอกข้อความ</button></div></section>
      <section className="space-y-2 rounded-3xl border border-orange-200 bg-orange-50 p-4"><button type="button" disabled={Boolean(busy)} onClick={onPdf} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-orange-700 disabled:opacity-60">{busy.startsWith("pdf-") ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}บันทึกและดาวน์โหลด PDF</button><button type="button" disabled={Boolean(busy)} onClick={onSave} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-extrabold text-orange-700 hover:bg-orange-100 disabled:opacity-60">{busy.startsWith("save-") ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}บันทึกแบบร่าง</button><button type="button" disabled={Boolean(busy)} onClick={onReset} className="w-full rounded-xl px-4 py-2 text-xs font-bold text-orange-700/70 hover:bg-orange-100">ล้างฟอร์มเพื่อสร้างรายการใหม่</button><p className="pt-1 text-center text-[11px] font-semibold leading-4 text-orange-800/60">ชื่อไฟล์ PDF: หัวข้อการเบิกเงิน + หน่วยงานโครงการ</p></section>
    </aside>
  </div>;
}

function ContractorClaimSheetEditor({
  projectName,
  form,
  items,
  totals,
  claimHistory,
  previousByItem,
  previousClaim,
  contractAmount,
  contractRemaining,
  payees,
  contractors,
  laborRates,
  onSelectPayee,
  setField,
  updateItem,
  addItem,
  removeItem,
}: {
  projectName: string;
  form: FormState;
  items: PaymentItem[];
  totals: ReturnType<typeof calculatePaymentTotals>;
  claimHistory: PaymentRequestRecord[];
  previousByItem: Map<string, number>;
  previousClaim: number;
  contractAmount: number;
  contractRemaining: number;
  payees: PayeeSuggestion[];
  contractors: Array<Record<string, string | number | undefined>>;
  laborRates: Array<Record<string, string | number | undefined>>;
  onSelectPayee: (payee: PayeeSuggestion) => void;
  setField: (field: keyof FormState, value: string) => void;
  updateItem: (id: string, field: keyof PaymentItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const afterRetention = Math.max(0, totals.subtotal - totals.retentionAmount);
  const afterWht = Math.max(0, afterRetention - totals.whtAmount);
  const cumulativeClaim = previousClaim + totals.subtotal;

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  return <>{expanded && <button type="button" aria-label="ย่อตารางจ่ายงวดงานผู้รับเหมา" onClick={() => setExpanded(false)} className="fixed inset-0 z-[89] cursor-default bg-slate-950/60 backdrop-blur-sm" />}<SpreadsheetSection title="ตารางจ่ายงวดงานผู้รับเหมา" description="ช่องสีขาวกรอกได้ · ช่องสีเทาคำนวณอัตโนมัติ · ใช้ Tab เหมือน Excel" expanded={expanded} onToggleExpanded={() => setExpanded((current) => !current)}>
    <div className="grid grid-cols-1 md:grid-cols-12">
      <SheetBand>ข้อมูลเอกสารและสัญญา</SheetBand>
      <SheetCell label="หัวข้อการเบิกเงิน *" className="md:col-span-7"><input className={sheetInputClass} value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="เช่น เบิกงวดงานโครงสร้าง ชั้น 1+2" /></SheetCell>
      <SheetCell label="หน่วยงาน" className="md:col-span-3"><div className="flex h-11 items-center bg-slate-50 px-3 text-sm font-black text-blue-700">{projectName}</div></SheetCell>
      <SheetCell label="วันที่เอกสาร" className="md:col-span-2"><input type="date" className={sheetInputClass} value={form.request_date} onChange={(event) => setField("request_date", event.target.value)} /></SheetCell>

      <SheetBand tone="brand">ข้อมูลผู้รับเหมาและงวดงาน</SheetBand>
      <SheetCell label="เลือกผู้รับเหมา" className="md:col-span-4"><select className={sheetInputClass} value={form.contractor_id} onChange={(event) => {
        const contractorId = event.target.value;
        const selected = contractors.find((row) => String(row.contractor_id) === contractorId);
        const selectedName = String(selected?.name || "").trim();
        const rememberedPayee = payees.find((payee) => (
          payee.contractor_id === contractorId || payee.name.trim().toLocaleLowerCase("th-TH") === selectedName.toLocaleLowerCase("th-TH")
        ));
        setField("contractor_id", contractorId);
        if (rememberedPayee) onSelectPayee(rememberedPayee);
        else if (selected) setField("payee_name", selectedName);
      }}><option value="">เลือกจากฐานข้อมูล</option>{contractors.map((row) => <option key={String(row.contractor_id)} value={String(row.contractor_id)}>{String(row.name || row.nickname || row.contractor_id)}</option>)}</select></SheetCell>
      <SheetCell label="ชื่อผู้รับเหมา/ผู้รับเงิน *" className="relative z-40 md:col-span-4"><PayeeAutocomplete value={form.payee_name} suggestions={payees} onChange={(value) => setField("payee_name", value)} onSelect={onSelectPayee} className={sheetInputClass} placeholder="พิมพ์ชื่อเพื่อค้นหาประวัติ หรือกรอกชื่อใหม่" /></SheetCell>
      <SheetCell label="แพ็กเกจ/หมวดงาน *" className="md:col-span-3"><input className={sheetInputClass} value={form.work_package} onChange={(event) => setField("work_package", event.target.value)} placeholder="งานโครงสร้าง ชั้น 1+2" /></SheetCell>
      <SheetCell label="งวดที่" className="md:col-span-1"><input className={`${sheetInputClass} text-center`} value={form.claim_period} onChange={(event) => setField("claim_period", event.target.value)} placeholder="2/3" /></SheetCell>

      <SheetCell label="เลขประจำตัวผู้เสียภาษี" className="md:col-span-4"><input className={sheetInputClass} value={form.payee_tax_id} onChange={(event) => setField("payee_tax_id", event.target.value)} /></SheetCell>
      <SheetCell label="ที่อยู่" className="md:col-span-8"><input className={sheetInputClass} value={form.payee_address} onChange={(event) => setField("payee_address", event.target.value)} /></SheetCell>
      <SheetCell label="ธนาคาร" className="md:col-span-3"><input className={sheetInputClass} value={form.bank_name} onChange={(event) => setField("bank_name", event.target.value)} /></SheetCell>
      <SheetCell label="เลขที่บัญชี" className="md:col-span-3"><input type="text" inputMode="numeric" autoComplete="off" className={sheetInputClass} value={form.bank_account_no} onChange={(event) => setField("bank_account_no", event.target.value)} /></SheetCell>
      <SheetCell label="ชื่อบัญชี" className="md:col-span-3"><input className={sheetInputClass} value={form.bank_account_name} onChange={(event) => setField("bank_account_name", event.target.value)} /></SheetCell>
      <SheetCell label="เบอร์โทรผู้จัดทำ" className="md:col-span-3"><input className={sheetInputClass} value={form.prepared_by_phone} onChange={(event) => setField("prepared_by_phone", event.target.value)} placeholder="ใช้ในท้ายอีเมล" /></SheetCell>
    </div>

    <div className="grid grid-cols-2 border-b border-slate-300 bg-white sm:grid-cols-4">
      <SheetMetric label="มูลค่าสัญญาจากตาราง" value={contractAmount} tone="slate" />
      <SheetMetric label="เบิกก่อนหน้า" value={previousClaim} tone="previous" />
      <SheetMetric label="เบิกงวดนี้" value={totals.subtotal} tone="brand" />
      <SheetMetric label="คงเหลือสัญญา" value={contractRemaining} tone="green" />
    </div>

    {claimHistory.length > 0 && <details className="border-b border-slate-300 bg-red-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-black text-[#6f1117]"><span>ประวัติการเบิกแพ็กเกจนี้ — {claimHistory.length} งวดก่อนหน้า</span><span className="text-xs font-bold text-red-500">กดเพื่อดูรายละเอียด</span></summary>
      <div className="overflow-x-auto border-t border-red-200"><table className="min-w-[680px] w-full text-xs"><thead className="bg-red-100 text-left font-black text-[#79131a]"><tr><th className="border-r border-red-200 px-4 py-2">งวด</th><th className="border-r border-red-200 px-4 py-2">เลขที่ / วันที่</th><th className="border-r border-red-200 px-4 py-2 text-right">มูลค่างวด</th><th className="border-r border-red-200 px-4 py-2 text-right">ยอดสุทธิ</th><th className="px-4 py-2">สถานะ</th></tr></thead><tbody>{claimHistory.map((record) => <tr key={record.request_id} className="border-t border-red-100 bg-white"><td className="border-r border-red-100 px-4 py-2 font-black text-[#79131a]">{record.claim_period || "-"}</td><td className="border-r border-red-100 px-4 py-2"><strong>{record.document_no || "แบบร่าง"}</strong><span className="ml-2 text-slate-400">{record.request_date}</span></td><td className="border-r border-red-100 px-4 py-2 text-right font-bold">{formatPaymentMoney(record.subtotal)}</td><td className="border-r border-red-100 px-4 py-2 text-right font-black">{formatPaymentMoney(record.net_amount)}</td><td className="px-4 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ring-1 ${statusTone(record.status)}`}>{statusText(record.status)}</span></td></tr>)}</tbody></table></div>
    </details>}

    <datalist id="contractor-labor-rates">{laborRates.map((row) => <option key={String(row.rate_id)} value={String(row.work_name)}>{String(row.unit)} · {formatPaymentMoney(num(row.standard_rate))}</option>)}</datalist>
    <div className={`relative border-b border-slate-300 ${expanded ? "overflow-visible" : "overflow-x-auto"}`}>
      <table className="min-w-[1640px] w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20 text-white">
          <tr className="bg-slate-950">
            <th rowSpan={2} className="sticky left-0 z-30 w-12 border-r border-slate-700 bg-slate-950 px-2 py-2 text-center">ลำดับ</th>
            <th rowSpan={2} className="sticky left-12 z-30 min-w-64 border-r border-slate-700 bg-slate-950 px-3 py-2 text-left">รายการ</th>
            <th rowSpan={2} className="w-24 border-r border-slate-700 px-2 py-2 text-right">ปริมาณ</th>
            <th rowSpan={2} className="w-20 border-r border-slate-700 px-2 py-2">หน่วย</th>
            <th colSpan={2} className="border-r border-slate-700 px-2 py-2 text-center">ค่าวัสดุ</th>
            <th colSpan={2} className="border-r border-slate-700 px-2 py-2 text-center">ค่าแรง</th>
            <th rowSpan={2} className="w-32 border-r border-slate-700 px-2 py-2 text-right">มูลค่าสัญญา</th>
            <th rowSpan={2} className="w-32 border-r border-red-900 bg-[#6f1117] px-2 py-2 text-right">เบิกก่อนหน้า</th>
            <th colSpan={2} className="border-r border-red-700 bg-[#a9141d] px-2 py-2 text-center">งวดนี้</th>
            <th rowSpan={2} className="w-32 border-r border-emerald-800 bg-emerald-700 px-2 py-2 text-right">คงเหลือ</th>
            <th rowSpan={2} className="w-11 bg-slate-950" />
          </tr>
          <tr className="bg-slate-800 text-[11px]">
            <th className="w-28 border-r border-slate-600 px-2 py-1.5 text-right">ราคา/หน่วย</th><th className="w-32 border-r border-slate-600 px-2 py-1.5 text-right">จำนวนเงิน</th>
            <th className="w-28 border-r border-slate-600 px-2 py-1.5 text-right">ราคา/หน่วย</th><th className="w-32 border-r border-slate-600 px-2 py-1.5 text-right">จำนวนเงิน</th>
            <th className="w-24 border-r border-red-700 bg-[#c01b26] px-2 py-1.5 text-right">%</th><th className="w-32 border-r border-red-700 bg-[#c01b26] px-2 py-1.5 text-right">ยอดเบิก</th>
          </tr>
        </thead>
        <tbody>{items.map((item, index) => {
          const historyKey = item.boq_key || item.description.trim().toLowerCase();
          const previousAmount = previousByItem.get(historyKey) || 0;
          const materialAmount = num(item.material_amount) || num(item.quantity) * num(item.material_unit_price);
          const laborAmount = num(item.labor_amount) || num(item.quantity) * num(item.labor_unit_price);
          const rowContractTotal = num(item.contract_total) || materialAmount + laborAmount || num(item.quantity) * num(item.unit_price);
          const remaining = rowContractTotal - previousAmount - num(item.amount);
          const overClaim = remaining < -0.009;
          return <tr key={item.id} className="group h-11 border-t border-slate-300">
            <td className="sticky left-0 z-10 border-r border-slate-300 bg-slate-100 px-2 text-center font-black text-slate-500 group-hover:bg-emerald-50">{index + 1}</td>
            <td className="sticky left-12 z-10 border-r border-slate-300 bg-white p-0 group-hover:bg-emerald-50"><input list="contractor-labor-rates" className={`${sheetInputClass} h-11 min-w-64`} value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} placeholder="รายละเอียดงาน" aria-label={`รายการงาน ${index + 1}`} /></td>
            <GridNumberInput value={item.quantity} onChange={(value) => updateItem(item.id, "quantity", value)} label={`ปริมาณ ${index + 1}`} />
            <td className="border-r border-slate-300 p-0"><input className={`${sheetInputClass} h-11 text-center`} value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} aria-label={`หน่วย ${index + 1}`} /></td>
            <GridNumberInput value={item.material_unit_price} onChange={(value) => updateItem(item.id, "material_unit_price", value)} label={`ค่าวัสดุต่อหน่วย ${index + 1}`} />
            <GridComputedMoney value={materialAmount} />
            <GridNumberInput value={item.labor_unit_price} onChange={(value) => updateItem(item.id, "labor_unit_price", value)} label={`ค่าแรงต่อหน่วย ${index + 1}`} />
            <GridComputedMoney value={laborAmount} />
            <GridComputedMoney value={rowContractTotal} strong />
            <GridComputedMoney value={previousAmount} tone="previous" />
            <GridNumberInput value={item.claim_percent} onChange={(value) => updateItem(item.id, "claim_percent", value)} label={`เปอร์เซ็นต์งวดนี้ ${index + 1}`} suffix="%" />
            <GridNumberInput value={item.amount} onChange={(value) => updateItem(item.id, "amount", value)} label={`ยอดเบิกงวดนี้ ${index + 1}`} tone="blue" />
            <GridComputedMoney value={remaining} tone={overClaim ? "red" : "green"} />
            <td className="border-r border-slate-300 bg-white text-center"><button type="button" onClick={() => removeItem(item.id)} className="mx-auto grid h-8 w-8 place-items-center rounded text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label={`ลบรายการ ${index + 1}`}><Trash2 size={14} /></button></td>
          </tr>;
        })}</tbody>
        <tfoot className="font-black">
          <tr className="border-t-2 border-[#851018] bg-slate-100"><td colSpan={8} className="sticky left-0 border-r border-slate-300 px-4 py-2 text-right text-slate-700">รวมตามสัญญา / ยอดเบิก</td><td className="border-r border-slate-300 px-3 py-2 text-right">{formatPaymentMoney(contractAmount)}</td><td className="border-r border-slate-300 bg-red-50 px-3 py-2 text-right text-[#79131a]">{formatPaymentMoney(previousClaim)}</td><td className="border-r border-slate-300 bg-red-50" /><td className="border-r border-slate-300 bg-red-50 px-3 py-2 text-right text-[#a9141d]">{formatPaymentMoney(totals.subtotal)}</td><td className="border-r border-slate-300 bg-emerald-50 px-3 py-2 text-right text-emerald-800">{formatPaymentMoney(contractRemaining)}</td><td /></tr>
        </tfoot>
      </table>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3"><button type="button" onClick={addItem} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-black text-[#8e1119] hover:bg-red-50"><Plus size={16} />เพิ่มแถวรายการ</button><div className="flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded bg-white px-2 py-1 text-slate-500 ring-1 ring-slate-200">กรอกเปอร์เซ็นต์ หรือกรอกยอดเบิกเองได้</span><span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-200">คงเหลือคำนวณรายบรรทัด</span></div></div>

    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid grid-cols-2 content-start border-r border-slate-300 sm:grid-cols-5">
        <SheetCell label="VAT (%)"><select className={sheetInputClass} value={form.vat_rate} onChange={(event) => setField("vat_rate", event.target.value)}>{["0", "7"].map((value) => <option key={value} value={value}>{value}%</option>)}</select></SheetCell>
        <SheetCell label="ประกันผลงาน (%)"><select className={sheetInputClass} value={form.retention_rate} onChange={(event) => setField("retention_rate", event.target.value)}>{["0", "5"].map((value) => <option key={value} value={value}>{value}%</option>)}</select></SheetCell>
        <SheetCell label="หัก ณ ที่จ่าย (%)"><select className={sheetInputClass} value={form.wht_rate} onChange={(event) => setField("wht_rate", event.target.value)}>{["0", "1", "2", "3", "5"].map((value) => <option key={value} value={value}>{value}%</option>)}</select></SheetCell>
        <SheetCell label="หักเงินล่วงหน้า"><input type="number" min="0" step="0.01" className={`${sheetInputClass} text-right`} value={form.advance_deduction} onChange={(event) => setField("advance_deduction", event.target.value)} /></SheetCell>
        <SheetCell label="หักอื่น ๆ"><input type="number" min="0" step="0.01" className={`${sheetInputClass} text-right`} value={form.other_deduction} onChange={(event) => setField("other_deduction", event.target.value)} /></SheetCell>
        <div className="col-span-2 border-b border-slate-300 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800 sm:col-span-5">ลำดับสูตรตาม Excel: ยอดงวดนี้ → หักประกันผลงาน → นำยอดหลังหักประกันไปคำนวณหัก ณ ที่จ่าย</div>
      </div>
      <div className="bg-white p-4 text-sm">
        <ClaimSummaryRow label="ยอดเบิกงวดนี้" value={totals.subtotal} />
        <ClaimSummaryRow label={`หักประกันผลงาน ${form.retention_rate}%`} value={totals.retentionAmount} deduct />
        <ClaimSummaryRow label="ยอดหลังหักประกัน" value={afterRetention} />
        <ClaimSummaryRow label={`หัก ณ ที่จ่าย ${form.wht_rate}%`} value={totals.whtAmount} deduct />
        <ClaimSummaryRow label="ยอดหลังหัก ณ ที่จ่าย" value={afterWht} />
        {totals.advanceDeduction > 0 && <ClaimSummaryRow label="หักเงินล่วงหน้า" value={totals.advanceDeduction} deduct />}
        {totals.otherDeduction > 0 && <ClaimSummaryRow label="หักอื่น ๆ" value={totals.otherDeduction} deduct />}
        <div className="mt-2 border-t-2 border-[#851018] pt-2"><ClaimSummaryRow label="ยอดโอนสุทธิ" value={totals.netAmount} strong /></div>
        <div className="mt-2 flex justify-between rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-[#79131a]"><span>เบิกสะสมรวมงวดนี้</span><span>{formatPaymentMoney(cumulativeClaim)}</span></div>
      </div>
    </div>
  </SpreadsheetSection></>;
}

function GridNumberInput({ value, onChange, label, suffix, tone = "default" }: { value: number | undefined; onChange: (value: string) => void; label: string; suffix?: string; tone?: "default" | "blue" }) {
  return <td className={`border-r border-slate-300 p-0 ${tone === "blue" ? "bg-blue-50" : "bg-white"}`}><div className="relative"><input type="number" min="0" step="0.01" value={value || ""} onChange={(event) => onChange(event.target.value)} className={`h-11 w-full border-0 bg-transparent px-3 text-right text-xs font-black outline-none focus:bg-orange-50 focus:ring-2 focus:ring-inset focus:ring-orange-400 ${tone === "blue" ? "text-blue-800" : "text-blue-600"} ${suffix ? "pr-7" : ""}`} aria-label={label} />{suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">{suffix}</span>}</div></td>;
}

function GridComputedMoney({ value, strong, tone = "slate" }: { value: number; strong?: boolean; tone?: "slate" | "previous" | "green" | "red" }) {
  const tones = { slate: "bg-slate-50 text-slate-800", previous: "bg-red-50 text-[#79131a]", green: "bg-emerald-50 text-emerald-800", red: "bg-red-50 text-red-700" };
  return <td className={`border-r border-slate-300 px-3 text-right tabular-nums ${strong ? "font-black" : "font-bold"} ${tones[tone]}`}>{formatPaymentMoney(value)}</td>;
}

function SheetMetric({ label, value, tone }: { label: string; value: number; tone: "slate" | "previous" | "brand" | "green" }) {
  const tones = { slate: "text-slate-900", previous: "text-[#79131a]", brand: "text-[#a9141d]", green: "text-emerald-800" };
  return <div className="border-r border-slate-200 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-1 text-lg font-black tabular-nums ${tones[tone]}`}>{formatPaymentMoney(value)}</div></div>;
}

function ClaimSummaryRow({ label, value, deduct, strong }: { label: string; value: number; deduct?: boolean; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 py-1.5 ${strong ? "text-base font-black text-[#851018]" : "font-bold text-slate-600"}`}><span>{label}</span><span className={`tabular-nums ${deduct && value ? "text-red-600" : strong ? "text-[#851018]" : "text-slate-950"}`}>{deduct && value ? "-" : ""}{formatPaymentMoney(value)}</span></div>;
}

function VoucherSheetEditor({ projectName, preparedBy, form, items, totals, payees, onSelectPayee, setField, updateItem, addItem }: {
  projectName: string;
  preparedBy: string;
  form: FormState;
  items: PaymentItem[];
  totals: ReturnType<typeof calculatePaymentTotals>;
  payees: PayeeSuggestion[];
  onSelectPayee: (payee: PayeeSuggestion) => void;
  setField: (field: keyof FormState, value: string) => void;
  updateItem: (id: string, field: keyof PaymentItem, value: string) => void;
  addItem: () => void;
}) {
  const deductionTotal = totals.whtAmount + totals.retentionAmount + totals.advanceDeduction + totals.otherDeduction;
  return <section className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white px-4 py-3"><div><h3 className="font-black text-slate-900">กรอกลงบนใบสำคัญจ่าย</h3><p className="text-xs font-bold text-slate-400">หน้าตาเอกสารจริง · ช่องสีน้ำเงินกรอกได้ · รายการแรกใช้เป็นหัวข้อ PDF</p></div><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700 ring-1 ring-red-100">Modern document layout</span></div>
    <div className="overflow-x-auto p-3 sm:p-5">
      <div className="mx-auto min-h-[900px] min-w-[960px] max-w-[1120px] bg-white px-8 py-7 text-[13px] text-slate-900 shadow-lg">
        <header className="grid grid-cols-[1fr_330px] gap-8 border-b-4 border-red-800 pb-5">
          <div><Image src="/logo.png" alt="Pichayamongkol Construction" width={360} height={92} className="h-[92px] w-[360px] object-contain object-left-center" /><p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Pichayamongkol Construction Co., Ltd.</p></div>
          <div className="text-right"><h2 className="text-[30px] font-black tracking-tight text-slate-950">ใบสำคัญจ่าย</h2><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-red-700">Payment Voucher</p><div className="mt-4 overflow-hidden rounded-xl border border-red-100 bg-red-50 text-left text-[12px]"><div className="grid grid-cols-[88px_1fr] border-b border-red-100"><span className="px-3 py-2 font-bold text-red-800">หน่วยงาน</span><span className="bg-white px-3 py-2 font-black text-blue-600">{projectName}</span></div><div className="grid grid-cols-[88px_1fr]"><span className="px-3 py-2 font-bold text-red-800">วันที่เอกสาร</span><input type="date" value={form.request_date} onChange={(event) => setField("request_date", event.target.value)} className="border-0 bg-white px-3 py-2 font-black text-blue-600 outline-none focus:bg-orange-50" /></div></div></div>
        </header>

        <section className="relative z-40 mt-5 overflow-visible rounded-xl border border-slate-200"><div className="rounded-t-xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">ข้อมูลผู้รับเงิน</div><div className="grid grid-cols-2"><label className="relative border-b border-r border-slate-200 p-3"><span className="block text-[10px] font-black text-slate-400">ชื่อผู้รับเงิน / ผู้เบิกเงิน</span><PayeeAutocomplete value={form.payee_name} suggestions={payees} onChange={(value) => setField("payee_name", value)} onSelect={onSelectPayee} className="mt-1 h-7 w-full border-0 bg-transparent text-sm font-black text-blue-600 outline-none focus:bg-orange-50" placeholder="พิมพ์ชื่อเพื่อค้นหาประวัติ หรือกรอกชื่อใหม่" /></label><label className="border-b border-slate-200 p-3"><span className="block text-[10px] font-black text-slate-400">เลขประจำตัวผู้เสียภาษี</span><input value={form.payee_tax_id} onChange={(event) => setField("payee_tax_id", event.target.value)} className="mt-1 h-7 w-full border-0 bg-transparent text-sm font-black text-blue-600 outline-none focus:bg-orange-50" placeholder="กรอกเลขประจำตัวผู้เสียภาษี" /></label><label className="col-span-2 rounded-b-xl bg-white p-3"><span className="block text-[10px] font-black text-slate-400">ที่อยู่</span><input value={form.payee_address} onChange={(event) => setField("payee_address", event.target.value)} className="mt-1 h-7 w-full border-0 bg-transparent text-sm font-bold text-blue-600 outline-none focus:bg-orange-50" placeholder="กรอกที่อยู่ผู้รับเงิน" /></label></div></section>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-[11px]"><span className="font-bold text-slate-500">ผู้จ่ายเงิน / ผู้อนุมัติ</span><strong className="text-slate-800">บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด</strong></div>

        <table className="mt-4 w-full table-fixed border-collapse text-[12px]">
          <colgroup><col className="w-[6%]" /><col className="w-[50%]" /><col className="w-[12%]" /><col className="w-[20%]" /><col className="w-[12%]" /></colgroup>
          <thead><tr className="bg-red-800 text-white"><th className="border-r border-red-700 px-2 py-2.5 font-bold">#</th><th className="border-r border-red-700 px-3 py-2.5 text-left font-bold">รายละเอียดรายการ</th><th className="border-r border-red-700 px-3 py-2.5 text-right font-bold">มูลค่า</th><th className="border-r border-red-700 px-3 py-2.5 text-right font-bold">รายการหัก</th><th className="px-3 py-2.5 text-right font-bold">สุทธิ</th></tr></thead>
          <tbody>{items.map((item, index) => <tr key={item.id} className="h-8 odd:bg-white even:bg-slate-50/70"><td className="border-b border-r border-slate-200 text-center font-bold text-slate-400">{index + 1}</td><td className="border-b border-r border-slate-200 p-0"><input value={item.description} onChange={(event) => { const nextValue = event.target.value; if (index === 0 && (!form.title || form.title === item.description)) setField("title", nextValue); updateItem(item.id, "description", nextValue); }} className="h-8 w-full border-0 bg-transparent px-3 font-bold text-blue-600 outline-none focus:bg-orange-50" aria-label={`รายการที่ ${index + 1}`} /></td><td className="border-b border-r border-slate-200 p-0"><input type="number" min="0" step="0.01" value={item.amount || ""} onChange={(event) => { updateItem(item.id, "quantity", event.target.value ? "1" : "0"); updateItem(item.id, "unit_price", event.target.value); }} className="h-8 w-full border-0 bg-transparent px-3 text-right font-bold text-blue-600 outline-none focus:bg-orange-50" aria-label={`ราคาที่ ${index + 1}`} /></td><td className="border-b border-r border-slate-200 px-3 text-right font-bold text-red-600">{index === 0 && deductionTotal > 0 ? formatPaymentMoney(deductionTotal) : ""}</td><td className="border-b border-slate-200 px-3 text-right font-bold text-slate-800">{item.amount ? formatPaymentMoney(item.amount) : ""}</td></tr>)}</tbody>
        </table>
        <div className="mt-2 flex items-center justify-between"><button type="button" onClick={addItem} className="text-xs font-black text-red-700 hover:underline">+ เพิ่มแถวรายการ</button><span className="text-[10px] font-bold text-slate-400">กรอกยอดรวมของแต่ละรายการในช่องมูลค่า</span></div>

        <div className="mt-5 grid grid-cols-[1fr_330px] gap-6"><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">จำนวนเงินตัวอักษร</div><div className="mt-2 text-sm font-black text-slate-700">{thaiBahtText(totals.netAmount)}</div><label className="mt-4 block"><span className="text-[10px] font-black text-slate-400">หมายเหตุ</span><input value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="รายละเอียดหรือเงื่อนไขเพิ่มเติม" className="mt-1 h-8 w-full border-0 border-b border-slate-300 bg-transparent text-xs font-bold text-blue-600 outline-none focus:border-red-500" /></label></div><div className="overflow-hidden rounded-xl border border-slate-200"><div className="flex justify-between px-4 py-2 text-xs font-bold text-slate-500"><span>มูลค่างาน</span><span>{formatPaymentMoney(totals.subtotal)}</span></div>{deductionTotal > 0 && <div className="flex justify-between border-t border-slate-100 px-4 py-2 text-xs font-bold text-red-600"><span>รวมรายการหัก</span><span>-{formatPaymentMoney(deductionTotal)}</span></div>}<div className="flex items-end justify-between bg-red-800 px-4 py-3 text-white"><span className="text-xs font-bold">ยอดโอนสุทธิ</span><span className="text-xl font-black">{formatPaymentMoney(totals.netAmount)}</span></div></div></div>

        <section className="mt-5 rounded-xl border border-red-100 bg-red-50/60 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-red-800">ข้อมูลสำหรับการโอนเงิน</h3><span className="text-[10px] font-bold text-red-500">Bank transfer details</span></div><div className="mt-3 grid grid-cols-3 gap-3"><label><span className="block text-[10px] font-black text-slate-400">ธนาคาร</span><input value={form.bank_name} onChange={(event) => setField("bank_name", event.target.value)} placeholder="ชื่อธนาคาร" className="mt-1 h-8 w-full rounded-lg border border-red-100 bg-white px-3 text-xs font-black text-blue-600 outline-none focus:border-red-400" /></label><label><span className="block text-[10px] font-black text-slate-400">เลขที่บัญชี</span><input type="text" inputMode="numeric" autoComplete="off" value={form.bank_account_no} onChange={(event) => setField("bank_account_no", event.target.value)} placeholder="เลขที่บัญชี" className="mt-1 h-8 w-full rounded-lg border border-red-100 bg-white px-3 text-xs font-black text-blue-600 outline-none focus:border-red-400" /></label><label><span className="block text-[10px] font-black text-slate-400">ชื่อบัญชี</span><input value={form.bank_account_name} onChange={(event) => setField("bank_account_name", event.target.value)} placeholder="ชื่อบัญชี" className="mt-1 h-8 w-full rounded-lg border border-red-100 bg-white px-3 text-xs font-black text-blue-600 outline-none focus:border-red-400" /></label></div></section>

        <div className="mt-7 grid grid-cols-2 gap-16 text-[11px]"><div><div className="grid grid-cols-[58px_1fr] items-end gap-2"><span className="text-right font-bold text-slate-500">ข้าพเจ้า</span><span className="border-b border-slate-400 px-2 pb-1 font-black text-blue-600">{preparedBy || "-"}</span></div><p className="mt-3 text-slate-600">ขอรับรองว่า รายจ่ายข้างต้นได้จ่ายไปในงานของทางบริษัทฯ จริง</p><p className="mt-2 font-black text-emerald-700">บจ.พิชยมงคล คอนสตรัคชั่น จำกัด โดยแท้</p></div><div className="grid grid-cols-[75px_1fr_55px_55px] items-end gap-2 self-start"><span className="text-right font-bold text-slate-500">(ผู้เบิกจ่าย)</span><span className="h-7 border-b border-slate-400" /><span className="text-right font-bold text-slate-500">ตำแหน่ง</span><span className="border-b border-slate-400 pb-1 text-center font-black text-blue-600">SE</span></div></div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px]"><span className="font-bold text-slate-400">บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด</span><label className="flex items-center gap-2 text-slate-400"><span>โทรผู้จัดทำ</span><input value={form.prepared_by_phone} onChange={(event) => setField("prepared_by_phone", event.target.value)} className="h-6 w-36 border-0 border-b border-slate-300 bg-transparent px-2 font-bold text-blue-600 outline-none focus:border-red-500" /></label></div>
      </div>
    </div>
  </section>;
}

function PayeeAutocomplete({ value, suggestions, onChange, onSelect, className, placeholder }: { value: string; suggestions: PayeeSuggestion[]; onChange: (value: string) => void; onSelect: (payee: PayeeSuggestion) => void; className: string; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const query = value.trim().toLocaleLowerCase("th-TH");
  const matches = useMemo(() => {
    if (!query) return [];
    return suggestions.filter((payee) => [payee.name, payee.tax_id, payee.bank_name, payee.bank_account_no, payee.bank_account_name]
      .some((field) => String(field || "").toLocaleLowerCase("th-TH").includes(query))).slice(0, 8);
  }, [query, suggestions]);

  function choose(payee: PayeeSuggestion) {
    onSelect(payee);
    setOpen(false);
    setActiveIndex(0);
  }

  return <div className="relative">
    <input
      value={value}
      autoComplete="off"
      onFocus={() => setOpen(Boolean(query))}
      onChange={(event) => { onChange(event.target.value); setOpen(Boolean(event.target.value.trim())); setActiveIndex(0); }}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      onKeyDown={(event) => {
        if (!open || matches.length === 0) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(matches.length - 1, current + 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(0, current - 1)); }
        if (event.key === "Enter") { event.preventDefault(); choose(matches[activeIndex] || matches[0]); }
        if (event.key === "Escape") setOpen(false);
      }}
      className={className}
      placeholder={placeholder}
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      aria-controls={listId}
    />
    {open && <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-2xl">
      {matches.length > 0 ? matches.map((payee, index) => {
        const accountDigits = payee.bank_account_no.replace(/\D/g, "");
        const accountLabel = accountDigits ? `••••${accountDigits.slice(-4)}` : "ไม่ระบุบัญชี";
        const hasIdCard = (payee.attachments || []).some((attachment) => attachment.category === "id_card");
        const hasBankBook = (payee.attachments || []).some((attachment) => attachment.category === "bank_book");
        return <button key={payee.key} type="button" role="option" aria-selected={index === activeIndex} onMouseDown={(event) => { event.preventDefault(); choose(payee); }} className={`block w-full rounded-lg px-3 py-2.5 text-left transition ${index === activeIndex ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-slate-50"}`}>
          <span className="block text-sm font-black text-slate-900">{payee.name}</span>
          <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{payee.bank_name || "ไม่ระบุธนาคาร"} • {accountLabel} • เคยใช้ {payee.usage_count} ครั้ง</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${hasIdCard ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}><BadgeCheck size={11} />{hasIdCard ? "มีบัตรประชาชน" : "ยังไม่มีบัตรประชาชน"}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${hasBankBook ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400"}`}><BadgeCheck size={11} />{hasBankBook ? "มีหน้าบัญชี" : "ยังไม่มีหน้าบัญชี"}</span>
          </span>
        </button>;
      }) : <div className="px-3 py-3"><div className="text-xs font-black text-slate-600">ไม่พบข้อมูลเดิม</div><div className="mt-0.5 text-[11px] font-semibold text-slate-400">กรอกชื่อใหม่ได้เลย ระบบจะจำหลังจากบันทึกรายการ</div></div>}
    </div>}
  </div>;
}

function SpreadsheetSection({ title, description, children, expanded = false, onToggleExpanded }: { title: string; description: string; children: React.ReactNode; expanded?: boolean; onToggleExpanded?: () => void }) { return <section className={`${expanded ? "fixed inset-3 z-[90] flex flex-col shadow-2xl sm:inset-5" : "shadow-sm"} overflow-hidden rounded-2xl border border-slate-300 bg-white`}><div className="flex shrink-0 flex-col gap-3 border-b-4 border-[#d33a22] bg-gradient-to-r from-slate-950 via-slate-900 to-[#521015] px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#c7251f]"><FileText size={17} /></span><h3 className="font-black">{title}</h3></div><div className="flex flex-wrap items-center gap-3"><p className="text-xs font-bold text-red-100">{description}</p>{onToggleExpanded && <button type="button" onClick={onToggleExpanded} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/20">{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{expanded ? "ย่อหน้าจอ" : "ขยายเต็มจอ"}</button>}</div></div><div className={expanded ? "min-h-0 flex-1 overflow-auto" : ""}>{children}</div></section>; }
function SheetBand({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "brand" }) { return <div className={`border-b border-r border-slate-300 px-3 py-2 text-xs font-black md:col-span-12 ${tone === "brand" ? "bg-red-50 text-[#79131a]" : "bg-slate-100 text-slate-700"}`}>{children}</div>; }
function SheetCell({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`min-w-0 border-b border-r border-slate-300 bg-white ${className}`}><span className="block border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold text-slate-500">{label}</span>{children}</label>; }
function FormSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) { return <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">{icon}</span><div><h3 className="font-black text-gray-950">{title}</h3><p className="text-xs font-semibold text-gray-400">{description}</p></div></div><div className="space-y-4">{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-extrabold text-gray-600">{label}</span>{children}</label>; }
function SummaryRow({ label, value, deduct, positive, strong }: { label: string; value: number; deduct?: boolean; positive?: boolean; strong?: boolean }) { return <div className={`flex items-center justify-between gap-3 ${strong ? "text-base font-black text-[#851018]" : "text-sm font-bold text-gray-600"}`}><span>{label}</span><span className={deduct && value ? "text-red-600" : positive && value ? "text-emerald-600" : strong ? "text-[#851018]" : "text-gray-950"}>{deduct && value ? "-" : positive && value ? "+" : ""}{formatPaymentMoney(value)}</span></div>; }
function AttachmentPicker({ icon, label, category, multiple, onFiles }: { icon: React.ReactNode; label: string; category: PaymentAttachment["category"]; multiple?: boolean; onFiles: (category: PaymentAttachment["category"], files: FileList | null) => void }) { return <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 px-3 py-5 text-center hover:border-orange-300 hover:bg-orange-50"><span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-white text-orange-600 shadow-sm">{icon}</span><span className="text-xs font-extrabold text-gray-700">{label}</span><span className="mt-1 text-[10px] font-semibold text-gray-400">รูปภาพหรือ PDF</span><input type="file" accept="image/*,.pdf" multiple={multiple} className="hidden" onChange={(event) => { onFiles(category, event.target.files); event.target.value = ""; }} /></label>; }
function AttachmentCard({ name, detail, href, preview, onRemove }: { name: string; detail: string; href?: string; preview?: string; onRemove: () => void }) { return <div className="group relative min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">{preview ? (href ? <a href={href} target="_blank" rel="noreferrer" className="block overflow-hidden bg-slate-100"><Image unoptimized src={preview} alt={name} width={640} height={360} className="h-32 w-full object-cover transition duration-200 group-hover:scale-[1.02]" /></a> : <Image unoptimized src={preview} alt={name} width={640} height={360} className="h-32 w-full bg-slate-100 object-cover" />) : <div className="grid h-32 place-items-center bg-red-50 text-[#a9141d]"><FileText size={32} /></div>}<button type="button" onClick={onRemove} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/90 text-gray-400 shadow-sm hover:bg-red-50 hover:text-red-500" aria-label="นำไฟล์ออก"><Trash2 size={14} /></button><div className="min-w-0 border-t border-gray-100 p-3">{href ? <a href={href} target="_blank" rel="noreferrer" className="block truncate text-xs font-extrabold text-blue-700 hover:underline">{name}</a> : <div className="truncate text-xs font-extrabold text-gray-800">{name}</div>}<div className="mt-0.5 truncate text-[10px] font-semibold text-gray-400">{detail}</div></div></div>; }
function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "gray" | "blue" | "green" | "orange" }) { const colors = { gray: "bg-gray-50 text-gray-700", blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", orange: "bg-orange-50 text-orange-700" }; return <div className="flex min-h-28 items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${colors[tone]}`}>{icon}</span><div className="min-w-0"><div className="text-sm font-black leading-5 text-gray-500">{label}</div><div className="mt-0.5 break-words text-2xl font-black leading-tight tracking-tight text-gray-950 xl:text-3xl">{value}</div><div className="mt-1 text-xs font-bold leading-4 text-gray-400">{detail}</div></div></div>; }
function IconAction({ label, icon, loading, onClick }: { label: string; icon: React.ReactNode; loading?: boolean; onClick: () => void }) { return <button type="button" title={label} aria-label={label} disabled={loading} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-orange-200 hover:text-orange-600 disabled:opacity-50">{loading ? <Loader2 size={15} className="animate-spin" /> : icon}</button>; }
function PanelState({ icon, text, tone = "default" }: { icon: React.ReactNode; text: string; tone?: "default" | "error" }) { return <div className={`flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center text-sm font-bold ${tone === "error" ? "text-red-600" : "text-gray-400"}`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-50">{icon}</span>{text}</div>; }
