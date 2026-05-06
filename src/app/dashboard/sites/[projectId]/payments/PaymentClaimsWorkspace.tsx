"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  FileUp,
  Filter,
  Loader2,
  Mail,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPE_STYLES,
  buildPaymentClaimPrintHtml,
  buildAccountingEmail,
  buildFollowupEmail,
  calculatePaymentTotals,
  createPaymentDocNo,
  formatMoney,
  formatThaiDate,
  getMissingAttachments,
  getMockPaymentClaims,
  getPendingReason,
  maskAccount,
  maskThaiId,
  numberToThaiBahtText,
  todayBangkok,
  type PaymentClaimItem,
  type PaymentClaim,
  type PaymentClaimStatus,
  type PaymentClaimType,
} from "@/lib/paymentClaims";
import { fetcher } from "@/lib/fetcher";
import { hasPermission } from "@/lib/permissions";

type Project = {
  project_id: string;
  name?: string;
  client?: string;
};

type AccountingAction = "submit" | "review" | "approve" | "needs_info" | "reject" | "transfer" | "close";

type PaymentsApiResponse = {
  success?: boolean;
  data?: PaymentClaim[];
  audit_logs?: PaymentAuditRecord[];
  error?: string;
};

type PaymentAuditRecord = {
  audit_id?: string;
  claim_id?: string;
  project_id?: string;
  action?: string;
  from_status?: string;
  to_status?: string;
  note?: string;
  actor_name?: string;
  actor_email?: string;
  actor_role?: string;
  created_at?: string;
};

type UploadAttachmentInput = {
  claim: PaymentClaim;
  attachmentName: string;
  file: File;
};

type GeneratedDocumentResult = {
  document_no?: string;
  pdf_url?: string;
};

type SendClaimEmailResult = {
  recipients?: string[];
  pdf_url?: string;
  evidence_attached_count?: number;
  evidence_skipped?: string[];
};

const typeFilters: Array<{ value: "ALL" | PaymentClaimType; label: string }> = [
  { value: "ALL", label: "ทุกประเภท" },
  { value: "PETTY_CASH", label: "ใบสำคัญจ่าย" },
  { value: "DC_WORKER", label: "ค่าแรง DC" },
  { value: "SUBCONTRACTOR", label: "รับเหมา" },
];

const statusFilters: Array<{ value: "ALL" | PaymentClaimStatus; label: string }> = [
  { value: "ALL", label: "ทุกสถานะ" },
  { value: "DRAFT", label: "ฉบับร่าง" },
  { value: "SUBMITTED_TO_ACCOUNTING", label: "ส่งบัญชีแล้ว" },
  { value: "UNDER_REVIEW", label: "กำลังตรวจ" },
  { value: "NEEDS_MORE_INFO", label: "ขอข้อมูลเพิ่ม" },
  { value: "APPROVED", label: "อนุมัติแล้ว" },
  { value: "TRANSFERRED", label: "โอนแล้ว" },
  { value: "CLOSED", label: "ปิดรายการ" },
  { value: "REJECTED", label: "ตีกลับ" },
];

type PettyCashFormState = {
  mode: "PETTY_CASH" | "ADVANCE_CASH";
  preparedBy: string;
  date: string;
  workDate: string;
  payeeName: string;
  paymentMethod: "cash" | "bank_transfer";
  bankName: string;
  accountNo: string;
  description: string;
  remarks: string;
  whtApplicable: boolean;
  whtRate: string;
  vatAmount: string;
  receiptAttached: boolean;
  payeeIdAttached: boolean;
  transferSlipAttached: boolean;
  items: Array<{ description: string; quantity: string; unit: string; unitPrice: string }>;
};

type DcWorkerFormState = {
  preparedBy: string;
  date: string;
  workerName: string;
  workerIdCard: string;
  workerType: string;
  bankName: string;
  accountNo: string;
  workType: "daily" | "piece";
  payPeriod: string;
  remarks: string;
  idCardAttached: boolean;
  measurementAttached: boolean;
  photoAttached: boolean;
  items: Array<{ description: string; quantity: string; unit: string; rate: string }>;
};

type DcBatchWorkerInput = {
  workerName: string;
  idCard: string;
  workerType: string;
  bankName: string;
  accountNo: string;
  items: Array<{ description: string; quantity: string; unit: string; rate: string }>;
};

type DcBatchFormState = {
  preparedBy: string;
  date: string;
  payPeriod: string;
  remarks: string;
  idCardsAttached: boolean;
  measurementsAttached: boolean;
  transferListAttached: boolean;
  workers: DcBatchWorkerInput[];
};

type SubcontractorFormState = {
  preparedBy: string;
  date: string;
  contractorName: string;
  contractorType: "บุคคลธรรมดา" | "นิติบุคคล";
  idOrTax: string;
  bankName: string;
  accountNo: string;
  contractRef: string;
  contractTotal: string;
  paidToDate: string;
  installmentNo: string;
  installmentDesc: string;
  advanceDeduct: string;
  otherDeduct: string;
  otherDeductDesc: string;
  remarks: string;
  contractAttached: boolean;
  measurementAttached: boolean;
  photosAttached: boolean;
  idOrCompanyDocAttached: boolean;
  items: Array<{ description: string; quantity: string; unit: string; rate: string; pctComplete: string }>;
};

const emptyPettyCashForm = (): PettyCashFormState => ({
  mode: "PETTY_CASH",
  preparedBy: "SE หน้างาน",
  date: todayBangkok(),
  workDate: todayBangkok(),
  payeeName: "",
  paymentMethod: "bank_transfer",
  bankName: "",
  accountNo: "",
  description: "",
  remarks: "",
  whtApplicable: false,
  whtRate: "0",
  vatAmount: "0",
  receiptAttached: true,
  payeeIdAttached: false,
  transferSlipAttached: false,
  items: [{ description: "", quantity: "1", unit: "LS", unitPrice: "" }],
});

const emptyDcWorkerForm = (): DcWorkerFormState => ({
  preparedBy: "SE หน้างาน",
  date: todayBangkok(),
  workerName: "",
  workerIdCard: "",
  workerType: "ช่างสี",
  bankName: "",
  accountNo: "",
  workType: "daily",
  payPeriod: "",
  remarks: "",
  idCardAttached: false,
  measurementAttached: false,
  photoAttached: false,
  items: [{ description: "", quantity: "1", unit: "วัน", rate: "" }],
});

const emptyBatchWorker = (): DcBatchWorkerInput => ({
  workerName: "",
  idCard: "",
  workerType: "ช่างสี",
  bankName: "",
  accountNo: "",
  items: [{ description: "", quantity: "1", unit: "วัน", rate: "" }],
});

const emptyDcBatchForm = (): DcBatchFormState => ({
  preparedBy: "SE หน้างาน",
  date: todayBangkok(),
  payPeriod: "",
  remarks: "",
  idCardsAttached: false,
  measurementsAttached: false,
  transferListAttached: false,
  workers: [emptyBatchWorker()],
});

const emptySubcontractorForm = (): SubcontractorFormState => ({
  preparedBy: "PM โครงการ",
  date: todayBangkok(),
  contractorName: "",
  contractorType: "บุคคลธรรมดา",
  idOrTax: "",
  bankName: "",
  accountNo: "",
  contractRef: "",
  contractTotal: "",
  paidToDate: "0",
  installmentNo: "",
  installmentDesc: "",
  advanceDeduct: "0",
  otherDeduct: "0",
  otherDeductDesc: "",
  remarks: "",
  contractAttached: false,
  measurementAttached: false,
  photosAttached: false,
  idOrCompanyDocAttached: false,
  items: [{ description: "", quantity: "1", unit: "LS", rate: "", pctComplete: "100" }],
});

export default function PaymentClaimsWorkspace({ project, userRole }: { project: Project; userRole: string }) {
  const endpoint = `/api/sites/${encodeURIComponent(project.project_id)}/payments`;
  const { data: paymentsData, mutate: mutatePayments } = useSWR<PaymentsApiResponse>(endpoint, fetcher);
  const [fallbackClaims, setFallbackClaims] = useState<PaymentClaim[]>(() => getMockPaymentClaims(project));
  const serverClaims = paymentsData?.success ? paymentsData.data : undefined;
  const claims = serverClaims ?? fallbackClaims;
  const persistEnabled = Boolean(paymentsData?.success);
  const [selectedType, setSelectedType] = useState<"ALL" | PaymentClaimType>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | PaymentClaimStatus>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(fallbackClaims[0]?.id || "");
  const [createMode, setCreateMode] = useState<"CLOSED" | "PETTY_CASH" | "DC_WORKER" | "DC_BATCH" | "SUBCONTRACTOR">("CLOSED");
  const [pettyCashForm, setPettyCashForm] = useState<PettyCashFormState>(() => emptyPettyCashForm());
  const [dcWorkerForm, setDcWorkerForm] = useState<DcWorkerFormState>(() => emptyDcWorkerForm());
  const [dcBatchForm, setDcBatchForm] = useState<DcBatchFormState>(() => emptyDcBatchForm());
  const [subcontractorForm, setSubcontractorForm] = useState<SubcontractorFormState>(() => emptySubcontractorForm());
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState("");
  const [printPreviewClaim, setPrintPreviewClaim] = useState<PaymentClaim | null>(null);
  const [emailModal, setEmailModal] = useState<{ claim: PaymentClaim; mode: "accounting" | "followup" } | null>(null);
  const canCreatePayment = hasPermission(userRole, "payment.create");
  const canUploadPaymentAttachment = hasPermission(userRole, "payment.uploadAttachment");
  const canGeneratePaymentDocument = hasPermission(userRole, "payment.generateDocument");

  const filteredClaims = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return claims.filter((claim) => {
      const typeMatches = selectedType === "ALL" || claim.type === selectedType;
      const statusMatches = selectedStatus === "ALL" || claim.status === selectedStatus;
      const queryMatches = !normalizedQuery || [
        claim.docNo,
        claim.payeeName,
        claim.description,
        claim.preparedBy,
        claim.bankName || "",
      ].some((value) => value.toLowerCase().includes(normalizedQuery));

      return typeMatches && statusMatches && queryMatches;
    });
  }, [claims, query, selectedStatus, selectedType]);

  const selectedClaim = claims.find((claim) => claim.id === selectedId) || filteredClaims[0] || claims[0];
  const selectedAuditLogs = useMemo(() => {
    const logs = paymentsData?.audit_logs || [];
    if (!selectedClaim?.id) return [];
    return logs
      .filter((log) => log.claim_id === selectedClaim.id)
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());
  }, [paymentsData?.audit_logs, selectedClaim]);
  const stats = useMemo(() => buildStats(claims), [claims]);
  const typeBreakdown = useMemo(() => buildTypeBreakdown(claims), [claims]);
  const topPayees = useMemo(() => buildTopPayees(claims), [claims]);
  const pendingActions = useMemo(() => {
    return claims
      .filter((claim) => ["DRAFT", "SUBMITTED_TO_ACCOUNTING", "UNDER_REVIEW", "NEEDS_MORE_INFO", "APPROVED", "TRANSFERRED", "REJECTED"].includes(claim.status))
      .slice(0, 5);
  }, [claims]);

  const addClaim = async (claim: PaymentClaim) => {
    if (!persistEnabled) {
      setFallbackClaims((current) => [claim, ...current]);
      return claim;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_claim", claim }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "บันทึก Payment Claim ไม่สำเร็จ");
      await mutatePayments();
      return (result.data || claim) as PaymentClaim;
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "บันทึก Payment Claim ไม่สำเร็จ");
      return null;
    }
  };

  const uploadClaimAttachment = async ({ claim, attachmentName, file }: UploadAttachmentInput) => {
    if (!persistEnabled) {
      const uploadedAt = new Date().toISOString();
      setFallbackClaims((current) => current.map((item) => {
        if (item.id !== claim.id) return item;
        return {
          ...item,
          attachments: item.attachments.map((attachment) => attachment.name === attachmentName
            ? { ...attachment, present: true, fileName: file.name, uploadedAt, uploadedBy: "Mock user" }
            : attachment),
        };
      }));
      setFormMessage(`แนบ ${attachmentName}: ${file.name} ใน mock แล้ว`);
      return;
    }

    const formData = new FormData();
    formData.append("claim_id", claim.id);
    formData.append("doc_no", claim.docNo);
    formData.append("attachment_name", attachmentName);
    formData.append("file", file);

    const response = await fetch(endpoint, { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "อัปโหลดไฟล์แนบไม่สำเร็จ");
    await mutatePayments();
    setFormMessage(`อัปโหลด ${attachmentName}: ${file.name} แล้ว`);
  };

  const generateClaimDocument = async (claim: PaymentClaim): Promise<GeneratedDocumentResult | null> => {
    if (!persistEnabled) {
      setFormMessage(`สร้าง PDF ${claim.docNo} ใน mock แล้ว`);
      return null;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_document", claim_id: claim.id, doc_no: claim.docNo }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "สร้าง PDF ไม่สำเร็จ");
    await mutatePayments();
    setFormMessage(`สร้าง PDF ${result.data?.document_no || claim.docNo} และบันทึกลง Drive แล้ว`);
    return result.data || null;
  };

  const sendClaimEmail = async (claim: PaymentClaim, recipients: string): Promise<SendClaimEmailResult | null> => {
    if (!persistEnabled) {
      setFallbackClaims((current) => current.map((item) => (
        item.id === claim.id ? { ...item, status: "SUBMITTED_TO_ACCOUNTING" } : item
      )));
      setSelectedId(claim.id);
      setFormMessage(`ส่งขอเบิกแล้ว (mock): ${claim.docNo}`);
      return { recipients: recipients.split(/[,\s;]+/g).filter(Boolean), evidence_attached_count: claim.attachments.filter((item) => item.present).length };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_claim_email",
        claim_id: claim.id,
        doc_no: claim.docNo,
        recipients,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "ส่งอีเมลขอเบิกไม่สำเร็จ");
    await mutatePayments();
    setSelectedId(claim.id);
    setFormMessage(`ส่งขอเบิกแล้ว: ${claim.docNo} ไปที่ ${(result.data?.recipients || []).join(", ")}`);
    return result.data || null;
  };

  const submitPettyCash = async () => {
    const claimType = pettyCashForm.mode;
    const normalizedItems = pettyCashForm.items
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        unit: item.unit.trim() || "LS",
        unitPrice: Number(item.unitPrice || 0),
      }))
      .filter((item) => item.description || item.quantity || item.unitPrice);

    const missing: string[] = [];
    if (!pettyCashForm.preparedBy.trim()) missing.push("ผู้เบิก/ผู้จัดทำ");
    if (!pettyCashForm.date) missing.push("วันที่เอกสาร");
    if (!pettyCashForm.payeeName.trim()) missing.push("ชื่อผู้รับเงิน");
    if (!pettyCashForm.description.trim()) missing.push(claimType === "ADVANCE_CASH" ? "วัตถุประสงค์การขอเบิก" : "รายละเอียดการเบิก");
    if (claimType === "ADVANCE_CASH" && !pettyCashForm.workDate) missing.push("วันที่จะออกไซต์/วันที่ใช้งาน");
    if (pettyCashForm.paymentMethod === "bank_transfer" && !pettyCashForm.bankName.trim()) missing.push("ธนาคาร");
    if (pettyCashForm.paymentMethod === "bank_transfer" && !pettyCashForm.accountNo.trim()) missing.push("เลขบัญชี");
    if (claimType === "PETTY_CASH" && !pettyCashForm.receiptAttached) missing.push("ใบเสร็จ/บิล");
    if (pettyCashForm.paymentMethod === "bank_transfer" && !pettyCashForm.payeeIdAttached) missing.push("บัตรประชาชนผู้รับเงิน");
    if (normalizedItems.length === 0) missing.push("รายการค่าใช้จ่ายอย่างน้อย 1 รายการ");
    if (normalizedItems.some((item) => !item.description || item.quantity <= 0 || item.unitPrice <= 0)) {
      missing.push("รายละเอียด จำนวน และราคาต่อหน่วยของทุกรายการ");
    }

    if (missing.length > 0) {
      setFormErrors(missing);
      setFormMessage("");
      return;
    }

    const docNo = createPaymentDocNo({
      type: claimType,
      date: pettyCashForm.date,
      siteClaims: claims,
    });
    const totals = calculatePaymentTotals({
      type: claimType,
      items: normalizedItems,
      vatAmount: Number(pettyCashForm.vatAmount || 0),
      whtRate: pettyCashForm.whtApplicable ? Number(pettyCashForm.whtRate || 3) : 0,
    });
    const newClaim: PaymentClaim = {
      id: `claim-local-${Date.now()}`,
      docNo,
      type: claimType,
      status: "DRAFT",
      siteId: project.project_id,
      siteName: project.name || project.project_id,
      projectName: project.client ? `${project.name || project.project_id} (${project.client})` : project.name || project.project_id,
      preparedBy: pettyCashForm.preparedBy.trim(),
      payeeName: pettyCashForm.payeeName.trim(),
      payeeKind: pettyCashForm.paymentMethod === "cash" ? "พนักงาน" : "ร้านค้า",
      bankName: pettyCashForm.paymentMethod === "bank_transfer" ? pettyCashForm.bankName.trim() : "เงินสด",
      accountNoMasked: pettyCashForm.paymentMethod === "bank_transfer" ? maskAccount(pettyCashForm.accountNo) : "รับเงินสด",
      createdDate: pettyCashForm.date,
      dueDate: pettyCashForm.date,
      payPeriod: claimType === "ADVANCE_CASH" ? `ใช้งานวันที่ ${formatThaiDate(pettyCashForm.workDate)}` : undefined,
      description: pettyCashForm.description.trim(),
      grossAmount: totals.grossAmount,
      vatAmount: totals.vatAmount,
      whtAmount: totals.whtAmount,
      retentionAmount: totals.retentionAmount,
      netPayable: totals.netPayable,
      remarks: pettyCashForm.remarks.trim() || (claimType === "ADVANCE_CASH"
        ? `ต้องส่งใบเสร็จและใบสำคัญจ่ายคืนภายใน 7 วัน ยอดสุทธิ ${numberToThaiBahtText(totals.netPayable)}`
        : `ยอดสุทธิ ${numberToThaiBahtText(totals.netPayable)}`),
      attachments: claimType === "ADVANCE_CASH"
        ? [
            { name: "รายละเอียดประมาณการ", required: true, present: normalizedItems.length > 0 },
            { name: "อนุมัติ PM", required: true, present: false },
            { name: "บัตรประชาชนผู้รับเงิน", required: pettyCashForm.paymentMethod === "bank_transfer", present: pettyCashForm.payeeIdAttached },
          ]
        : [
            { name: "ใบเสร็จ/บิล", required: true, present: pettyCashForm.receiptAttached },
            { name: "บัตรประชาชนผู้รับเงิน", required: pettyCashForm.paymentMethod === "bank_transfer", present: pettyCashForm.payeeIdAttached },
            { name: "สลิปโอนเงิน", required: false, present: pettyCashForm.transferSlipAttached },
          ],
      items: normalizedItems,
    };

    const savedClaim = await addClaim(newClaim);
    if (!savedClaim) return;
    setSelectedId(savedClaim.id);
    setSelectedType("ALL");
    setSelectedStatus("ALL");
    setCreateMode("CLOSED");
    setPettyCashForm(emptyPettyCashForm());
    setFormErrors([]);
    setFormMessage(`สร้าง ${docNo} เป็นฉบับร่างแล้ว ยอดสุทธิ ${formatMoney(totals.netPayable)} บาท (${numberToThaiBahtText(totals.netPayable)})`);
  };

  const submitDcWorker = async () => {
    const normalizedItems = dcWorkerForm.items
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        unit: item.unit.trim() || (dcWorkerForm.workType === "daily" ? "วัน" : "LS"),
        unitPrice: Number(item.rate || 0),
      }))
      .filter((item) => item.description || item.quantity || item.unitPrice);

    const missing: string[] = [];
    if (!dcWorkerForm.preparedBy.trim()) missing.push("ผู้จัดทำ");
    if (!dcWorkerForm.date) missing.push("วันที่เอกสาร");
    if (!dcWorkerForm.workerName.trim()) missing.push("ชื่อช่าง");
    if (!dcWorkerForm.workerIdCard.trim()) missing.push("เลขบัตรประชาชนช่าง");
    if (!dcWorkerForm.bankName.trim()) missing.push("ธนาคาร");
    if (!dcWorkerForm.accountNo.trim()) missing.push("เลขบัญชี");
    if (normalizedItems.length === 0) missing.push("รายการงานอย่างน้อย 1 รายการ");
    if (normalizedItems.some((item) => !item.description || item.quantity <= 0 || item.unitPrice <= 0)) {
      missing.push("รายละเอียด จำนวน และราคาของทุกรายการงาน");
    }
    if (!dcWorkerForm.idCardAttached) missing.push("บัตรประชาชนช่าง");
    if (!dcWorkerForm.measurementAttached) missing.push("รายการวัดงาน/วันทำงาน");
    if (!dcWorkerForm.photoAttached) missing.push("รูปถ่ายผลงาน");

    if (missing.length > 0) {
      setFormErrors(missing);
      setFormMessage("");
      return;
    }

    const docNo = createPaymentDocNo({
      type: "DC_WORKER",
      date: dcWorkerForm.date,
      siteClaims: claims,
    });
    const totals = calculatePaymentTotals({
      type: "DC_WORKER",
      items: normalizedItems,
      whtRate: 3,
    });
    const newClaim: PaymentClaim = {
      id: `claim-local-${Date.now()}`,
      docNo,
      type: "DC_WORKER",
      status: "DRAFT",
      siteId: project.project_id,
      siteName: project.name || project.project_id,
      projectName: project.client ? `${project.name || project.project_id} (${project.client})` : project.name || project.project_id,
      preparedBy: dcWorkerForm.preparedBy.trim(),
      payeeName: dcWorkerForm.workerName.trim(),
      payeeKind: "ช่าง DC",
      payeeIdMasked: maskThaiId(dcWorkerForm.workerIdCard),
      bankName: dcWorkerForm.bankName.trim(),
      accountNoMasked: maskAccount(dcWorkerForm.accountNo),
      createdDate: dcWorkerForm.date,
      dueDate: dcWorkerForm.date,
      payPeriod: dcWorkerForm.payPeriod.trim() || (dcWorkerForm.workType === "daily" ? "ค่าแรงรายวัน" : "ค่าแรงตามปริมาณงาน"),
      description: `ค่าแรง ${dcWorkerForm.workerType} - ${normalizedItems[0]?.description || "รายการงาน"}`,
      grossAmount: totals.grossAmount,
      vatAmount: totals.vatAmount,
      whtAmount: totals.whtAmount,
      retentionAmount: totals.retentionAmount,
      netPayable: totals.netPayable,
      remarks: dcWorkerForm.remarks.trim() || `หัก ณ ที่จ่าย 3% ยอดสุทธิ ${numberToThaiBahtText(totals.netPayable)}`,
      attachments: [
        { name: "บัตรประชาชนช่าง", required: true, present: dcWorkerForm.idCardAttached },
        { name: "รายการวัดงาน/วันทำงาน", required: true, present: dcWorkerForm.measurementAttached },
        { name: "รูปถ่ายผลงาน", required: true, present: dcWorkerForm.photoAttached },
      ],
      items: normalizedItems,
    };

    const savedClaim = await addClaim(newClaim);
    if (!savedClaim) return;
    setSelectedId(savedClaim.id);
    setSelectedType("ALL");
    setSelectedStatus("ALL");
    setCreateMode("CLOSED");
    setDcWorkerForm(emptyDcWorkerForm());
    setFormErrors([]);
    setFormMessage(`สร้าง ${docNo} เป็นฉบับร่างแล้ว หัก WHT 3% ยอดสุทธิ ${formatMoney(totals.netPayable)} บาท (${numberToThaiBahtText(totals.netPayable)})`);
  };

  const submitDcBatch = async () => {
    const normalizedWorkers = dcBatchForm.workers.map((worker) => {
      const items = worker.items
        .map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity || 0),
          unit: item.unit.trim() || "วัน",
          unitPrice: Number(item.rate || 0),
        }))
        .filter((item) => item.description || item.quantity || item.unitPrice);

      return {
        ...worker,
        workerName: worker.workerName.trim(),
        idCard: worker.idCard.trim(),
        bankName: worker.bankName.trim(),
        accountNo: worker.accountNo.trim(),
        items,
      };
    }).filter((worker) => worker.workerName || worker.items.length);

    const missing: string[] = [];
    if (!dcBatchForm.preparedBy.trim()) missing.push("ผู้จัดทำ");
    if (!dcBatchForm.date) missing.push("วันที่เอกสาร");
    if (!dcBatchForm.payPeriod.trim()) missing.push("ช่วงวันที่/งวดงาน");
    if (normalizedWorkers.length === 0) missing.push("ข้อมูลช่างอย่างน้อย 1 คน");
    normalizedWorkers.forEach((worker, index) => {
      const label = `ช่างคนที่ ${index + 1}`;
      if (!worker.workerName) missing.push(`${label}: ชื่อช่าง`);
      if (!worker.idCard) missing.push(`${label}: เลขบัตรประชาชน`);
      if (!worker.bankName) missing.push(`${label}: ธนาคาร`);
      if (!worker.accountNo) missing.push(`${label}: เลขบัญชี`);
      if (worker.items.length === 0) missing.push(`${label}: รายการงาน`);
      if (worker.items.some((item) => !item.description || item.quantity <= 0 || item.unitPrice <= 0)) {
        missing.push(`${label}: รายละเอียด จำนวน และราคาของทุกรายการ`);
      }
    });
    if (!dcBatchForm.idCardsAttached) missing.push("บัตรประชาชนช่างทุกคน");
    if (!dcBatchForm.measurementsAttached) missing.push("รายการวัดงาน/วันทำงาน");
    if (!dcBatchForm.transferListAttached) missing.push("Payment transfer list");

    if (missing.length > 0) {
      setFormErrors(missing);
      setFormMessage("");
      return;
    }

    const items: PaymentClaimItem[] = normalizedWorkers.flatMap((worker) => (
      worker.items.map((item) => ({
        ...item,
        description: `${worker.workerName} - ${item.description}`,
      }))
    ));
    const totals = calculatePaymentTotals({ type: "DC_BATCH", items, whtRate: 3 });
    const docNo = createPaymentDocNo({
      type: "DC_BATCH",
      date: dcBatchForm.date,
      siteClaims: claims,
    });
    const newClaim: PaymentClaim = {
      id: `claim-local-${Date.now()}`,
      docNo,
      type: "DC_BATCH",
      status: "DRAFT",
      siteId: project.project_id,
      siteName: project.name || project.project_id,
      projectName: project.client ? `${project.name || project.project_id} (${project.client})` : project.name || project.project_id,
      preparedBy: dcBatchForm.preparedBy.trim(),
      payeeName: `ชุดค่าแรงช่าง DC ${normalizedWorkers.length} คน`,
      payeeKind: "ช่าง DC",
      bankName: "หลายธนาคาร",
      accountNoMasked: `รายการโอน ${normalizedWorkers.length} บัญชี`,
      createdDate: dcBatchForm.date,
      dueDate: dcBatchForm.date,
      payPeriod: dcBatchForm.payPeriod.trim(),
      description: `ค่าแรงช่าง DC หลายคน ประจำงวด ${dcBatchForm.payPeriod.trim()}`,
      grossAmount: totals.grossAmount,
      vatAmount: totals.vatAmount,
      whtAmount: totals.whtAmount,
      retentionAmount: totals.retentionAmount,
      netPayable: totals.netPayable,
      remarks: dcBatchForm.remarks.trim() || `รวม ${normalizedWorkers.length} คน หัก ณ ที่จ่าย 3% ยอดสุทธิ ${numberToThaiBahtText(totals.netPayable)}`,
      attachments: [
        { name: "บัตรประชาชนช่างทุกคน", required: true, present: dcBatchForm.idCardsAttached },
        { name: "รายการวัดงาน/วันทำงาน", required: true, present: dcBatchForm.measurementsAttached },
        { name: "Payment transfer list", required: true, present: dcBatchForm.transferListAttached },
      ],
      items,
    };

    const savedClaim = await addClaim(newClaim);
    if (!savedClaim) return;
    setSelectedId(savedClaim.id);
    setSelectedType("ALL");
    setSelectedStatus("ALL");
    setCreateMode("CLOSED");
    setDcBatchForm(emptyDcBatchForm());
    setFormErrors([]);
    setFormMessage(`สร้าง ${docNo} เป็นฉบับร่างแล้ว รวม ${normalizedWorkers.length} คน ยอดสุทธิ ${formatMoney(totals.netPayable)} บาท (${numberToThaiBahtText(totals.netPayable)})`);
  };

  const submitSubcontractor = async () => {
    const normalizedItems = subcontractorForm.items
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        unit: item.unit.trim() || "LS",
        unitPrice: Number(item.rate || 0),
        pctComplete: Number(item.pctComplete || 100),
      }))
      .filter((item) => item.description || item.quantity || item.unitPrice);

    const missing: string[] = [];
    if (!subcontractorForm.preparedBy.trim()) missing.push("ผู้จัดทำ");
    if (!subcontractorForm.date) missing.push("วันที่เอกสาร");
    if (!subcontractorForm.contractorName.trim()) missing.push("ชื่อผู้รับเหมา");
    if (!subcontractorForm.idOrTax.trim()) missing.push("เลขบัตรประชาชน/เลขผู้เสียภาษี");
    if (!subcontractorForm.bankName.trim()) missing.push("ธนาคาร");
    if (!subcontractorForm.accountNo.trim()) missing.push("เลขบัญชี");
    if (!subcontractorForm.contractRef.trim()) missing.push("เลขสัญญา/วันที่สัญญา");
    if (Number(subcontractorForm.contractTotal || 0) <= 0) missing.push("มูลค่าสัญญารวม");
    if (!subcontractorForm.installmentNo.trim()) missing.push("งวดที่เบิก");
    if (!subcontractorForm.installmentDesc.trim()) missing.push("คำอธิบายงวด");
    if (normalizedItems.length === 0) missing.push("รายการงานอย่างน้อย 1 รายการ");
    if (normalizedItems.some((item) => !item.description || item.quantity <= 0 || item.unitPrice <= 0 || item.pctComplete <= 0)) {
      missing.push("รายละเอียด จำนวน ราคา และ % งานของทุกรายการ");
    }
    if (!subcontractorForm.contractAttached) missing.push("สัญญารับเหมา");
    if (!subcontractorForm.measurementAttached) missing.push("ใบวัดงาน");
    if (!subcontractorForm.photosAttached) missing.push("รูปถ่ายงาน");
    if (!subcontractorForm.idOrCompanyDocAttached) missing.push("บัตรประชาชน/หนังสือรับรองบริษัท");

    if (missing.length > 0) {
      setFormErrors(missing);
      setFormMessage("");
      return;
    }

    const paymentItems: PaymentClaimItem[] = normalizedItems.map((item) => ({
      description: `${item.description} (${item.pctComplete}% แล้วเสร็จ)`,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
    }));
    const baseTotals = calculatePaymentTotals({
      type: "SUBCONTRACTOR",
      items: paymentItems,
      whtRate: 3,
      retentionRate: 5,
    });
    const advanceDeduct = Number(subcontractorForm.advanceDeduct || 0);
    const otherDeduct = Number(subcontractorForm.otherDeduct || 0);
    const totals = {
      ...baseTotals,
      netPayable: baseTotals.netPayable - advanceDeduct - otherDeduct,
    };
    const docNo = createPaymentDocNo({
      type: "SUBCONTRACTOR",
      date: subcontractorForm.date,
      siteClaims: claims,
    });
    const contractBalance = Number(subcontractorForm.contractTotal || 0) - Number(subcontractorForm.paidToDate || 0) - totals.grossAmount;
    const newClaim: PaymentClaim = {
      id: `claim-local-${Date.now()}`,
      docNo,
      type: "SUBCONTRACTOR",
      status: "DRAFT",
      siteId: project.project_id,
      siteName: project.name || project.project_id,
      projectName: project.client ? `${project.name || project.project_id} (${project.client})` : project.name || project.project_id,
      preparedBy: subcontractorForm.preparedBy.trim(),
      payeeName: subcontractorForm.contractorName.trim(),
      payeeKind: "ผู้รับเหมา",
      payeeIdMasked: maskThaiId(subcontractorForm.idOrTax),
      bankName: subcontractorForm.bankName.trim(),
      accountNoMasked: maskAccount(subcontractorForm.accountNo),
      createdDate: subcontractorForm.date,
      dueDate: subcontractorForm.date,
      installment: subcontractorForm.installmentNo.trim(),
      description: `${subcontractorForm.installmentNo.trim()} - ${subcontractorForm.installmentDesc.trim()}`,
      grossAmount: totals.grossAmount,
      vatAmount: totals.vatAmount,
      whtAmount: totals.whtAmount,
      retentionAmount: totals.retentionAmount,
      netPayable: totals.netPayable,
      remarks: subcontractorForm.remarks.trim()
        || `สัญญา ${subcontractorForm.contractRef.trim()} คงเหลือหลังงวดนี้ ${formatMoney(contractBalance)} บาท ยอดสุทธิ ${numberToThaiBahtText(totals.netPayable)}`,
      attachments: [
        { name: "สัญญารับเหมา", required: true, present: subcontractorForm.contractAttached },
        { name: "ใบวัดงาน", required: true, present: subcontractorForm.measurementAttached },
        { name: "รูปถ่ายงาน", required: true, present: subcontractorForm.photosAttached },
        { name: "บัตรประชาชน/หนังสือรับรองบริษัท", required: true, present: subcontractorForm.idOrCompanyDocAttached },
      ],
      items: paymentItems,
    };

    const savedClaim = await addClaim(newClaim);
    if (!savedClaim) return;
    setSelectedId(savedClaim.id);
    setSelectedType("ALL");
    setSelectedStatus("ALL");
    setCreateMode("CLOSED");
    setSubcontractorForm(emptySubcontractorForm());
    setFormErrors([]);
    setFormMessage(`สร้าง ${docNo} เป็นฉบับร่างแล้ว หัก Retention 5% และ WHT 3% ยอดสุทธิ ${formatMoney(totals.netPayable)} บาท (${numberToThaiBahtText(totals.netPayable)})`);
  };

  const updateClaimStatus = (
    claim: PaymentClaim,
    status: PaymentClaimStatus,
    message: string,
    remarks?: string,
    workflowAction = "status_updated",
  ) => {
    const stampedRemark = remarks ? `${remarks} · ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "";
    const updateFallback = () => {
      setFallbackClaims((current) => current.map((item) => {
        if (item.id !== claim.id) return item;
        return {
          ...item,
          status,
          remarks: stampedRemark ? [item.remarks, stampedRemark].filter(Boolean).join(" | ") : item.remarks,
        };
      }));
      setSelectedId(claim.id);
      setFormMessage(message);
    };

    if (!persistEnabled) {
      updateFallback();
      return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_status",
        claim_id: claim.id,
        doc_no: claim.docNo,
        status,
        note: remarks || "",
        workflow_action: workflowAction,
      }),
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "อัปเดต workflow ไม่สำเร็จ");
        await mutatePayments();
        setSelectedId(claim.id);
        setFormMessage(message);
      })
      .catch((error) => {
        setFormMessage(error instanceof Error ? error.message : "อัปเดต workflow ไม่สำเร็จ");
      });
  };

  const handleAccountingAction = (
    claim: PaymentClaim,
    action: AccountingAction,
    note?: string,
  ) => {
    if (action === "submit") {
      updateClaimStatus(claim, "SUBMITTED_TO_ACCOUNTING", `ส่ง ${claim.docNo} เข้าบัญชีแล้ว`, note || "SE ส่งเอกสารเข้าบัญชี", action);
      return;
    }
    if (action === "review") {
      updateClaimStatus(claim, "UNDER_REVIEW", `บัญชีเริ่มตรวจ ${claim.docNo} แล้ว`, note || "Accounting รับเรื่องและเริ่มตรวจ", action);
      return;
    }
    if (action === "approve") {
      updateClaimStatus(claim, "APPROVED", `อนุมัติ ${claim.docNo} แล้ว รอบันทึกการโอน`, note || "Accounting approved", action);
      return;
    }
    if (action === "needs_info") {
      updateClaimStatus(claim, "NEEDS_MORE_INFO", `ขอข้อมูลเพิ่มสำหรับ ${claim.docNo} แล้ว`, note || "Needs more information", action);
      return;
    }
    if (action === "reject") {
      updateClaimStatus(claim, "REJECTED", `ปฏิเสธ ${claim.docNo} แล้ว`, note || "Rejected by accounting", action);
      return;
    }
    if (action === "transfer") {
      updateClaimStatus(claim, "TRANSFERRED", `บันทึกโอน ${claim.docNo} แล้ว`, note || `โอนแล้ว ${formatMoney(claim.netPayable)} บาท`, action);
      return;
    }
    updateClaimStatus(claim, "CLOSED", `ปิดรายการ ${claim.docNo} แล้ว`, note || "Accounting closed", action);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-extrabold text-orange-600">
              <WalletCards size={17} />
              Disbursement Dashboard
            </div>
            <h3 className="mt-1 text-2xl font-extrabold text-gray-950">ภาพรวมการเบิกจ่ายไซต์งาน</h3>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Frontend mock สำหรับฝั่ง SE / Engineering ก่อนเชื่อม backend และฐานข้อมูลใน phase ถัดไป
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectedClaim && setEmailModal({ claim: selectedClaim, mode: "accounting" })}
              disabled={!selectedClaim}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              <Mail size={16} />
              สร้างอีเมลบัญชี
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMode((mode) => mode === "PETTY_CASH" ? "CLOSED" : "PETTY_CASH");
                setFormErrors([]);
              }}
              disabled={!canCreatePayment}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus size={16} />
              สร้างใบสำคัญจ่าย
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMode((mode) => mode === "DC_WORKER" ? "CLOSED" : "DC_WORKER");
                setFormErrors([]);
              }}
              disabled={!canCreatePayment}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus size={16} />
              สร้างค่าแรง DC
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMode((mode) => mode === "DC_BATCH" ? "CLOSED" : "DC_BATCH");
                setFormErrors([]);
              }}
              disabled={!canCreatePayment}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus size={16} />
              DC Batch
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMode((mode) => mode === "SUBCONTRACTOR" ? "CLOSED" : "SUBCONTRACTOR");
                setFormErrors([]);
              }}
              disabled={!canCreatePayment}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus size={16} />
              รับเหมา
            </button>
          </div>
        </div>
      </section>

      {formMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {formMessage}
        </div>
      )}

      {createMode === "PETTY_CASH" && (
        <PettyCashCreatePanel
          form={pettyCashForm}
          setForm={setPettyCashForm}
          errors={formErrors}
          siteClaims={claims}
          onCancel={() => setCreateMode("CLOSED")}
          onSubmit={submitPettyCash}
        />
      )}

      {createMode === "DC_WORKER" && (
        <DcWorkerCreatePanel
          form={dcWorkerForm}
          setForm={setDcWorkerForm}
          errors={formErrors}
          siteClaims={claims}
          onCancel={() => setCreateMode("CLOSED")}
          onSubmit={submitDcWorker}
        />
      )}

      {createMode === "DC_BATCH" && (
        <DcBatchCreatePanel
          form={dcBatchForm}
          setForm={setDcBatchForm}
          errors={formErrors}
          siteClaims={claims}
          onCancel={() => setCreateMode("CLOSED")}
          onSubmit={submitDcBatch}
        />
      )}

      {createMode === "SUBCONTRACTOR" && (
        <SubcontractorCreatePanel
          form={subcontractorForm}
          setForm={setSubcontractorForm}
          errors={formErrors}
          siteClaims={claims}
          onCancel={() => setCreateMode("CLOSED")}
          onSubmit={submitSubcontractor}
        />
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Banknote}
          label="รายจ่ายเดือนนี้"
          value={`${formatMoney(stats.monthGross)} บาท`}
          helper={`ยอดโอนจริง ${formatMoney(stats.monthNet)} บาท`}
          tone="orange"
        />
        <MetricCard
          icon={Clock3}
          label="รอการอนุมัติ/บัญชี"
          value={`${stats.pendingCount} รายการ`}
          helper={`${formatMoney(stats.pendingNet)} บาท`}
          tone="blue"
        />
        <MetricCard
          icon={ReceiptText}
          label="ค่าแรง DC"
          value={`${stats.dcCount} รายการ`}
          helper={`${formatMoney(stats.dcNet)} บาท หลังหัก WHT`}
          tone="cyan"
        />
        <MetricCard
          icon={ShieldCheck}
          label="WHT สะสม"
          value={`${formatMoney(stats.whtTotal)} บาท`}
          helper={`Retention ${formatMoney(stats.retentionTotal)} บาท`}
          tone="green"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                <SegmentedFilter
                  icon={Filter}
                  items={typeFilters}
                  value={selectedType}
                  onChange={(value) => setSelectedType(value as "ALL" | PaymentClaimType)}
                />
                <SegmentedFilter
                  items={statusFilters}
                  value={selectedStatus}
                  onChange={(value) => setSelectedStatus(value as "ALL" | PaymentClaimStatus)}
                />
              </div>
              <label className="relative min-w-0 xl:w-[340px]">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาเลขที่เอกสาร ผู้รับเงิน หรือรายการ"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm font-semibold text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-orange-200 focus:bg-white focus:ring-4 focus:ring-orange-50"
                  type="search"
                />
              </label>
            </div>
          </section>

          <PipelineTable claims={filteredClaims} selectedId={selectedClaim?.id || ""} onSelect={setSelectedId} />
        </main>

        <aside className="space-y-5">
          <SelectedClaimPanel
            claim={selectedClaim}
            onPreview={setPrintPreviewClaim}
            onEmail={(claim) => setEmailModal({ claim, mode: "accounting" })}
            onReminder={(claim) => setEmailModal({ claim, mode: "followup" })}
            onUploadAttachment={uploadClaimAttachment}
            onGenerateDocument={generateClaimDocument}
            canUploadAttachment={canUploadPaymentAttachment}
            canGenerateDocument={canGeneratePaymentDocument}
          />
          <AccountingWorkflowPanel claim={selectedClaim} userRole={userRole} onAction={handleAccountingAction} />
          <PaymentAuditTimeline logs={selectedAuditLogs} claim={selectedClaim} />
          <TypeBreakdownPanel breakdown={typeBreakdown} />
          <TopPayeesPanel payees={topPayees} />
        </aside>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <PendingActionsPanel claims={pendingActions} onSelect={setSelectedId} />
        <AccountingReadinessPanel claims={claims} />
      </section>

      {printPreviewClaim && (
        <PrintPreviewModal
          claim={printPreviewClaim}
          onClose={() => setPrintPreviewClaim(null)}
        />
      )}

      {emailModal && (
        <EmailGeneratorModal
          claim={emailModal.claim}
          mode={emailModal.mode}
          onSend={sendClaimEmail}
          onClose={() => setEmailModal(null)}
        />
      )}
    </div>
  );
}

function PettyCashCreatePanel({
  form,
  setForm,
  errors,
  siteClaims,
  onCancel,
  onSubmit,
}: {
  form: PettyCashFormState;
  setForm: (next: PettyCashFormState) => void;
  errors: string[];
  siteClaims: PaymentClaim[];
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isAdvance = form.mode === "ADVANCE_CASH";
  const previewItems: PaymentClaimItem[] = form.items
    .map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity || 0),
      unit: item.unit.trim() || "LS",
      unitPrice: Number(item.unitPrice || 0),
    }))
    .filter((item) => item.description || item.quantity || item.unitPrice);
  const previewTotals = calculatePaymentTotals({
    type: form.mode,
    items: previewItems,
    vatAmount: Number(form.vatAmount || 0),
    whtRate: form.whtApplicable ? Number(form.whtRate || 3) : 0,
  });
  const previewDocNo = createPaymentDocNo({ type: form.mode, date: form.date, siteClaims });

  const updateItem = (index: number, key: keyof PettyCashFormState["items"][number], value: string) => {
    setForm({
      ...form,
      items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    });
  };

  const addItem = () => {
    setForm({
      ...form,
      items: [...form.items, { description: "", quantity: "1", unit: "LS", unitPrice: "" }],
    });
  };

  const removeItem = (index: number) => {
    const nextItems = form.items.filter((_item, itemIndex) => itemIndex !== index);
    setForm({
      ...form,
      items: nextItems.length ? nextItems : [{ description: "", quantity: "1", unit: "LS", unitPrice: "" }],
    });
  };

  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-orange-600">
            <ReceiptText size={17} />
            Create Petty Cash
          </div>
          <h3 className="mt-1 text-xl font-extrabold text-gray-950">
            {isAdvance ? "ขอเบิกเงินสดล่วงหน้า" : "สร้างใบสำคัญจ่าย"}
          </h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            {isAdvance
              ? "สำหรับขอเงินสดก่อนออกไซต์ โดยต้องส่งใบเสร็จและใบสำคัญจ่ายคืนภายใน 7 วัน"
              : "สำหรับค่าใช้จ่ายที่ SE/พนักงานออกเงินไปก่อน แล้วขอเบิกคืนจากบริษัท"}
          </p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-right">
          <div className="text-xs font-extrabold text-orange-600">เลขเอกสารตัวอย่าง</div>
          <div className="mt-1 text-lg font-extrabold text-gray-950">{previewDocNo}</div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <div className="font-extrabold">กรุณากรอกข้อมูล/แนบเอกสารให้ครบ</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {errors.map((error) => (
              <span key={error} className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-red-600">
                {error}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <FormBlock title="ประเภทคำขอ">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, mode: "PETTY_CASH", receiptAttached: true })}
                className={`rounded-xl border p-4 text-left transition ${
                  !isAdvance ? "border-orange-200 bg-orange-50 text-orange-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-extrabold">เบิกคืนเงินที่จ่ายไปแล้ว</div>
                <div className="mt-1 text-sm font-medium opacity-80">ใช้ใบเสร็จ/บิลเป็นเอกสารบังคับ</div>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, mode: "ADVANCE_CASH", receiptAttached: false, vatAmount: "0", whtApplicable: false, whtRate: "0" })}
                className={`rounded-xl border p-4 text-left transition ${
                  isAdvance ? "border-orange-200 bg-orange-50 text-orange-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-extrabold">ขอเงินสดล่วงหน้า</div>
                <div className="mt-1 text-sm font-medium opacity-80">ส่ง PM อนุมัติก่อน แล้วเคลียร์เอกสารภายใน 7 วัน</div>
              </button>
            </div>
          </FormBlock>

          <FormBlock title="ข้อมูลเอกสารและผู้รับเงิน">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="ผู้เบิก/ผู้จัดทำ">
                <input
                  value={form.preparedBy}
                  onChange={(event) => setForm({ ...form, preparedBy: event.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="วันที่เอกสาร">
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  className="form-input"
                />
              </Field>
              {isAdvance && (
                <Field label="วันที่จะออกไซต์/วันที่ใช้งาน">
                  <input
                    type="date"
                    value={form.workDate}
                    onChange={(event) => setForm({ ...form, workDate: event.target.value })}
                    className="form-input"
                  />
                </Field>
              )}
              <Field label="ชื่อผู้รับเงิน">
                <input
                  value={form.payeeName}
                  onChange={(event) => setForm({ ...form, payeeName: event.target.value })}
                  placeholder={isAdvance ? "เช่น ตัวเอง หรือชื่อผู้รับเงินสด" : "เช่น นาย ณัฐกิจ เหมจินดา หรือชื่อร้านค้า"}
                  className="form-input"
                />
              </Field>
              <Field label="วิธีรับเงิน">
                <select
                  value={form.paymentMethod}
                  onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PettyCashFormState["paymentMethod"] })}
                  className="form-input bg-white"
                >
                  <option value="bank_transfer">โอนธนาคาร</option>
                  <option value="cash">เงินสด</option>
                </select>
              </Field>
              {form.paymentMethod === "bank_transfer" && (
                <>
                  <Field label="ธนาคาร">
                    <input
                      value={form.bankName}
                      onChange={(event) => setForm({ ...form, bankName: event.target.value })}
                      placeholder="เช่น กสิกรไทย"
                      className="form-input"
                    />
                  </Field>
                  <Field label="เลขบัญชี">
                    <input
                      value={form.accountNo}
                      onChange={(event) => setForm({ ...form, accountNo: event.target.value })}
                      inputMode="numeric"
                      placeholder="ระบบจะแสดงแบบ mask บน dashboard"
                      className="form-input"
                    />
                  </Field>
                </>
              )}
            </div>
            <div className="mt-4 grid gap-4">
              <Field label="รายละเอียดการเบิก">
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={3}
                  placeholder={isAdvance ? "เช่น ขอเบิกเงินสดล่วงหน้าสำหรับซื้อวัสดุซ่อมแซมท่อน้ำประปา" : "เช่น ซื้อวัสดุซ่อมแซมท่อน้ำประปา"}
                  className="form-input resize-none"
                />
              </Field>
              <Field label="หมายเหตุ">
                <textarea
                  value={form.remarks}
                  onChange={(event) => setForm({ ...form, remarks: event.target.value })}
                  rows={2}
                  placeholder="ไม่บังคับ"
                  className="form-input resize-none"
                />
              </Field>
            </div>
          </FormBlock>

          <FormBlock title={isAdvance ? "รายการประมาณการ" : "รายการค่าใช้จ่าย"}>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-xs font-extrabold text-gray-500">
                  <tr>
                    <th className="w-14 px-3 py-3">#</th>
                    <th className="px-3 py-3">{isAdvance ? "รายการที่คาดว่าจะซื้อ" : "รายการ"}</th>
                    <th className="w-28 px-3 py-3">จำนวน</th>
                    <th className="w-28 px-3 py-3">หน่วย</th>
                    <th className="w-36 px-3 py-3">ราคา/หน่วย</th>
                    <th className="w-36 px-3 py-3 text-right">รวม</th>
                    <th className="w-16 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-3 font-bold text-gray-400">{index + 1}</td>
                      <td className="px-3 py-3">
                        <input
                          value={item.description}
                          onChange={(event) => updateItem(index, "description", event.target.value)}
                          className="form-input bg-white py-2"
                          placeholder="รายละเอียด"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={item.quantity}
                          onChange={(event) => updateItem(index, "quantity", event.target.value)}
                          inputMode="decimal"
                          className="form-input bg-white py-2"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={item.unit}
                          onChange={(event) => updateItem(index, "unit", event.target.value)}
                          className="form-input bg-white py-2"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={item.unitPrice}
                          onChange={(event) => updateItem(index, "unitPrice", event.target.value)}
                          inputMode="decimal"
                          className="form-input bg-white py-2"
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold text-gray-950">
                        {formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0))}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="rounded-lg px-2 py-1 text-xs font-extrabold text-red-500 transition hover:bg-red-50"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              <Plus size={15} />
              เพิ่มรายการ
            </button>
          </FormBlock>

          <FormBlock title={isAdvance ? "เงื่อนไขและเอกสารแนบ" : "ภาษีและเอกสารแนบ"}>
            {!isAdvance && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.whtApplicable}
                    onChange={(event) => setForm({ ...form, whtApplicable: event.target.checked, whtRate: event.target.checked ? "3" : "0" })}
                    className="h-4 w-4 accent-orange-600"
                  />
                  หัก ณ ที่จ่ายกรณีพิเศษ
                </label>
                <Field label="VAT / ภาษีซื้อที่ต้องแสดง">
                  <input
                    value={form.vatAmount}
                    onChange={(event) => setForm({ ...form, vatAmount: event.target.value })}
                    inputMode="decimal"
                    className="form-input"
                  />
                </Field>
              </div>
            )}
            {isAdvance && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
                เงินสดล่วงหน้าจะยังไม่หัก WHT/VAT ในคำขอครั้งแรก และต้องนำใบเสร็จ/ใบสำคัญจ่ายมาเคลียร์ภายใน 7 วันหลังใช้งาน
              </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {!isAdvance && (
                <AttachmentToggle
                  label="ใบเสร็จ/บิล"
                  checked={form.receiptAttached}
                  required
                  onChange={(checked) => setForm({ ...form, receiptAttached: checked })}
                />
              )}
              {isAdvance && (
                <AttachmentToggle
                  label="รายละเอียดประมาณการ"
                  checked={previewItems.length > 0}
                  required
                  onChange={() => undefined}
                />
              )}
              <AttachmentToggle
                label="บัตรประชาชนผู้รับเงิน"
                checked={form.payeeIdAttached}
                required={form.paymentMethod === "bank_transfer"}
                onChange={(checked) => setForm({ ...form, payeeIdAttached: checked })}
              />
              {isAdvance ? (
                <AttachmentToggle
                  label="อนุมัติ PM"
                  checked={false}
                  required
                  onChange={() => undefined}
                />
              ) : (
                <AttachmentToggle
                  label="สลิปโอนเงิน"
                  checked={form.transferSlipAttached}
                  onChange={(checked) => setForm({ ...form, transferSlipAttached: checked })}
                />
              )}
            </div>
          </FormBlock>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="font-extrabold text-gray-950">{isAdvance ? "สรุปยอดขอเบิก" : "สรุปยอดก่อนสร้าง"}</h4>
            <div className="mt-4 space-y-2 text-sm">
              <InfoRow label="ยอดรวม" value={`${formatMoney(previewTotals.grossAmount)} บาท`} />
              {!isAdvance && <InfoRow label="VAT" value={`${formatMoney(previewTotals.vatAmount)} บาท`} />}
              {!isAdvance && <InfoRow label="WHT" value={`${formatMoney(previewTotals.whtAmount)} บาท`} />}
              <InfoRow label="ยอดสุทธิ" value={`${formatMoney(previewTotals.netPayable)} บาท`} strong />
            </div>
            <div className="mt-4 rounded-xl border border-white bg-white p-3 text-sm font-bold leading-6 text-gray-700">
              {numberToThaiBahtText(previewTotals.netPayable)}
            </div>
          </section>
          <section className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm font-medium leading-6 text-gray-500">
            {isAdvance
              ? "เมื่อกดสร้าง ระบบจะเพิ่มคำขอเงินสดล่วงหน้าเป็นสถานะ “ฉบับร่าง” และยังต้องส่ง PM อนุมัติก่อนส่งบัญชีใน phase workflow ถัดไป"
              : "เมื่อกดสร้าง ระบบจะเพิ่มรายการเป็นสถานะ “ฉบับร่าง” ใน dashboard mock ทันที โดยยังไม่บันทึกลง backend/database"}
          </section>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="flex-1 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700"
            >
              สร้าง Draft
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function DcWorkerCreatePanel({
  form,
  setForm,
  errors,
  siteClaims,
  onCancel,
  onSubmit,
}: {
  form: DcWorkerFormState;
  setForm: (next: DcWorkerFormState) => void;
  errors: string[];
  siteClaims: PaymentClaim[];
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const previewItems: PaymentClaimItem[] = form.items
    .map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity || 0),
      unit: item.unit.trim() || (form.workType === "daily" ? "วัน" : "LS"),
      unitPrice: Number(item.rate || 0),
    }))
    .filter((item) => item.description || item.quantity || item.unitPrice);
  const previewTotals = calculatePaymentTotals({ type: "DC_WORKER", items: previewItems, whtRate: 3 });
  const previewDocNo = createPaymentDocNo({ type: "DC_WORKER", date: form.date, siteClaims });

  const updateItem = (index: number, key: keyof DcWorkerFormState["items"][number], value: string) => {
    setForm({
      ...form,
      items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    });
  };

  const addItem = () => {
    setForm({
      ...form,
      items: [...form.items, { description: "", quantity: "1", unit: form.workType === "daily" ? "วัน" : "ตร.ม.", rate: "" }],
    });
  };

  const removeItem = (index: number) => {
    const nextItems = form.items.filter((_item, itemIndex) => itemIndex !== index);
    setForm({
      ...form,
      items: nextItems.length ? nextItems : [{ description: "", quantity: "1", unit: form.workType === "daily" ? "วัน" : "ตร.ม.", rate: "" }],
    });
  };

  const changeWorkType = (workType: DcWorkerFormState["workType"]) => {
    setForm({
      ...form,
      workType,
      items: form.items.map((item) => ({ ...item, unit: workType === "daily" ? "วัน" : item.unit === "วัน" ? "ตร.ม." : item.unit })),
    });
  };

  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-sky-600">
            <ReceiptText size={17} />
            Create DC Worker Payment
          </div>
          <h3 className="mt-1 text-xl font-extrabold text-gray-950">สร้างใบเบิกค่าแรงช่าง DC รายคน</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            สำหรับช่างรายวันหรือรายชิ้นที่บริษัทจ้างโดยตรง ระบบหัก ณ ที่จ่าย 3% อัตโนมัติ
          </p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-right">
          <div className="text-xs font-extrabold text-sky-600">เลขเอกสารตัวอย่าง</div>
          <div className="mt-1 text-lg font-extrabold text-gray-950">{previewDocNo}</div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <div className="font-extrabold">กรุณากรอกข้อมูล/แนบเอกสารให้ครบ</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {errors.map((error) => (
              <span key={error} className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-red-600">
                {error}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <FormBlock title="ข้อมูลเอกสารและข้อมูลช่าง">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="ผู้จัดทำ">
                <input value={form.preparedBy} onChange={(event) => setForm({ ...form, preparedBy: event.target.value })} className="form-input" />
              </Field>
              <Field label="วันที่เอกสาร">
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="form-input" />
              </Field>
              <Field label="ชื่อ-นามสกุลช่าง">
                <input value={form.workerName} onChange={(event) => setForm({ ...form, workerName: event.target.value })} placeholder="เช่น นายสมชาย ช่างสี" className="form-input" />
              </Field>
              <Field label="เลขบัตรประชาชน">
                <input value={form.workerIdCard} onChange={(event) => setForm({ ...form, workerIdCard: event.target.value })} inputMode="numeric" className="form-input" />
              </Field>
              <Field label="ประเภทช่าง">
                <select value={form.workerType} onChange={(event) => setForm({ ...form, workerType: event.target.value })} className="form-input bg-white">
                  <option value="ช่างสี">ช่างสี</option>
                  <option value="ช่างก่อ">ช่างก่อ</option>
                  <option value="ช่างฉาบ">ช่างฉาบ</option>
                  <option value="ช่างไม้">ช่างไม้</option>
                  <option value="ช่างเหล็ก">ช่างเหล็ก</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </Field>
              <Field label="ช่วงวันที่/งวดงาน">
                <input value={form.payPeriod} onChange={(event) => setForm({ ...form, payPeriod: event.target.value })} placeholder="เช่น 1-15 พ.ค. 2569" className="form-input" />
              </Field>
              <Field label="ธนาคาร">
                <input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} placeholder="เช่น กสิกรไทย" className="form-input" />
              </Field>
              <Field label="เลขบัญชี">
                <input value={form.accountNo} onChange={(event) => setForm({ ...form, accountNo: event.target.value })} inputMode="numeric" className="form-input" />
              </Field>
            </div>
          </FormBlock>

          <FormBlock title="รูปแบบค่าแรง">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => changeWorkType("daily")}
                className={`rounded-xl border p-4 text-left transition ${
                  form.workType === "daily" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-extrabold">รายวัน</div>
                <div className="mt-1 text-sm font-medium opacity-80">จำนวนวัน x ค่าแรงต่อวัน</div>
              </button>
              <button
                type="button"
                onClick={() => changeWorkType("piece")}
                className={`rounded-xl border p-4 text-left transition ${
                  form.workType === "piece" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-extrabold">รายพื้นที่/ชิ้นงาน</div>
                <div className="mt-1 text-sm font-medium opacity-80">ปริมาณงาน x ราคาต่อหน่วย</div>
              </button>
            </div>
          </FormBlock>

          <FormBlock title="รายการงานที่ทำ">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-xs font-extrabold text-gray-500">
                  <tr>
                    <th className="w-14 px-3 py-3">#</th>
                    <th className="px-3 py-3">รายละเอียดงาน</th>
                    <th className="w-28 px-3 py-3">{form.workType === "daily" ? "วัน" : "จำนวน"}</th>
                    <th className="w-28 px-3 py-3">หน่วย</th>
                    <th className="w-36 px-3 py-3">ราคา/หน่วย</th>
                    <th className="w-36 px-3 py-3 text-right">รวม</th>
                    <th className="w-16 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-3 font-bold text-gray-400">{index + 1}</td>
                      <td className="px-3 py-3">
                        <input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} className="form-input bg-white py-2" placeholder="เช่น ทาสีภายใน ชั้น 1" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold text-gray-950">{formatMoney(Number(item.quantity || 0) * Number(item.rate || 0))}</td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => removeItem(index)} className="rounded-lg px-2 py-1 text-xs font-extrabold text-red-500 transition hover:bg-red-50">
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
              <Plus size={15} />
              เพิ่มรายการงาน
            </button>
          </FormBlock>

          <FormBlock title="เอกสารแนบและหมายเหตุ">
            <div className="grid gap-3 md:grid-cols-3">
              <AttachmentToggle label="บัตรประชาชนช่าง" checked={form.idCardAttached} required onChange={(checked) => setForm({ ...form, idCardAttached: checked })} />
              <AttachmentToggle label="รายการวัดงาน/วันทำงาน" checked={form.measurementAttached} required onChange={(checked) => setForm({ ...form, measurementAttached: checked })} />
              <AttachmentToggle label="รูปถ่ายผลงาน" checked={form.photoAttached} required onChange={(checked) => setForm({ ...form, photoAttached: checked })} />
            </div>
            <div className="mt-4">
              <Field label="หมายเหตุ">
                <textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} rows={3} placeholder="ไม่บังคับ" className="form-input resize-none" />
              </Field>
            </div>
          </FormBlock>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="font-extrabold text-gray-950">สรุปยอดค่าแรง DC</h4>
            <div className="mt-4 space-y-2 text-sm">
              <InfoRow label="ยอดรวมค่าแรง" value={`${formatMoney(previewTotals.grossAmount)} บาท`} />
              <InfoRow label="หัก WHT 3%" value={`${formatMoney(previewTotals.whtAmount)} บาท`} />
              <InfoRow label="ยอดสุทธิที่โอน" value={`${formatMoney(previewTotals.netPayable)} บาท`} strong />
            </div>
            <div className="mt-4 rounded-xl border border-white bg-white p-3 text-sm font-bold leading-6 text-gray-700">
              {numberToThaiBahtText(previewTotals.netPayable)}
            </div>
          </section>
          <section className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm font-medium leading-6 text-gray-500">
            ระบบจะสร้างเอกสารเป็นสถานะ “ฉบับร่าง” ก่อนส่งบัญชี และ dashboard จะแสดงเลขบัญชี/เลขบัตรแบบ mask ตามสิทธิ์
          </section>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="button" onClick={onSubmit} className="flex-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-black">
              สร้าง Draft
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function DcBatchCreatePanel({
  form,
  setForm,
  errors,
  siteClaims,
  onCancel,
  onSubmit,
}: {
  form: DcBatchFormState;
  setForm: (next: DcBatchFormState) => void;
  errors: string[];
  siteClaims: PaymentClaim[];
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const previewItems: PaymentClaimItem[] = form.workers.flatMap((worker) => (
    worker.items
      .map((item) => ({
        description: `${worker.workerName || "ช่าง"} - ${item.description}`.trim(),
        quantity: Number(item.quantity || 0),
        unit: item.unit.trim() || "วัน",
        unitPrice: Number(item.rate || 0),
      }))
      .filter((item) => item.description || item.quantity || item.unitPrice)
  ));
  const previewTotals = calculatePaymentTotals({ type: "DC_BATCH", items: previewItems, whtRate: 3 });
  const previewDocNo = createPaymentDocNo({ type: "DC_BATCH", date: form.date, siteClaims });

  const updateWorker = (workerIndex: number, key: keyof Omit<DcBatchWorkerInput, "items">, value: string) => {
    setForm({
      ...form,
      workers: form.workers.map((worker, index) => index === workerIndex ? { ...worker, [key]: value } : worker),
    });
  };

  const updateWorkerItem = (
    workerIndex: number,
    itemIndex: number,
    key: keyof DcBatchWorkerInput["items"][number],
    value: string,
  ) => {
    setForm({
      ...form,
      workers: form.workers.map((worker, index) => {
        if (index !== workerIndex) return worker;
        return {
          ...worker,
          items: worker.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, [key]: value } : item),
        };
      }),
    });
  };

  const addWorker = () => {
    setForm({ ...form, workers: [...form.workers, emptyBatchWorker()] });
  };

  const removeWorker = (workerIndex: number) => {
    const nextWorkers = form.workers.filter((_worker, index) => index !== workerIndex);
    setForm({ ...form, workers: nextWorkers.length ? nextWorkers : [emptyBatchWorker()] });
  };

  const addWorkerItem = (workerIndex: number) => {
    setForm({
      ...form,
      workers: form.workers.map((worker, index) => index === workerIndex
        ? { ...worker, items: [...worker.items, { description: "", quantity: "1", unit: "วัน", rate: "" }] }
        : worker),
    });
  };

  const removeWorkerItem = (workerIndex: number, itemIndex: number) => {
    setForm({
      ...form,
      workers: form.workers.map((worker, index) => {
        if (index !== workerIndex) return worker;
        const nextItems = worker.items.filter((_item, currentItemIndex) => currentItemIndex !== itemIndex);
        return { ...worker, items: nextItems.length ? nextItems : [{ description: "", quantity: "1", unit: "วัน", rate: "" }] };
      }),
    });
  };

  return (
    <section className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-cyan-600">
            <ReceiptText size={17} />
            Create DC Batch Payment
          </div>
          <h3 className="mt-1 text-xl font-extrabold text-gray-950">เบิกค่าแรงช่าง DC หลายคน</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            สร้างชุดค่าแรงพร้อม Payment transfer list สำหรับบัญชีโอนเงินหลายบัญชี
          </p>
        </div>
        <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-right">
          <div className="text-xs font-extrabold text-cyan-600">เลขเอกสารตัวอย่าง</div>
          <div className="mt-1 text-lg font-extrabold text-gray-950">{previewDocNo}</div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <div className="font-extrabold">กรุณากรอกข้อมูล/แนบเอกสารให้ครบ</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {errors.slice(0, 12).map((error) => (
              <span key={error} className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-red-600">
                {error}
              </span>
            ))}
            {errors.length > 12 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-red-600">+{errors.length - 12} รายการ</span>}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <FormBlock title="ข้อมูลชุดค่าแรง">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="ผู้จัดทำ">
                <input value={form.preparedBy} onChange={(event) => setForm({ ...form, preparedBy: event.target.value })} className="form-input" />
              </Field>
              <Field label="วันที่เอกสาร">
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="form-input" />
              </Field>
              <Field label="ช่วงวันที่/งวดงาน">
                <input value={form.payPeriod} onChange={(event) => setForm({ ...form, payPeriod: event.target.value })} placeholder="เช่น 1-15 พ.ค. 2569" className="form-input" />
              </Field>
            </div>
          </FormBlock>

          <div className="space-y-4">
            {form.workers.map((worker, workerIndex) => {
              const workerItems: PaymentClaimItem[] = worker.items.map((item) => ({
                description: item.description,
                quantity: Number(item.quantity || 0),
                unit: item.unit || "วัน",
                unitPrice: Number(item.rate || 0),
              }));
              const workerTotals = calculatePaymentTotals({ type: "DC_WORKER", items: workerItems, whtRate: 3 });

              return (
                <section key={workerIndex} className="rounded-2xl border border-gray-200 p-5">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h4 className="font-extrabold text-gray-950">ช่างคนที่ {workerIndex + 1}</h4>
                      <p className="text-sm font-semibold text-gray-400">ยอดสุทธิ {formatMoney(workerTotals.netPayable)} บาท หลังหัก WHT 3%</p>
                    </div>
                    <button type="button" onClick={() => removeWorker(workerIndex)} className="w-fit rounded-lg px-3 py-1.5 text-xs font-extrabold text-red-500 transition hover:bg-red-50">
                      ลบช่างคนนี้
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="ชื่อ-นามสกุลช่าง">
                      <input value={worker.workerName} onChange={(event) => updateWorker(workerIndex, "workerName", event.target.value)} className="form-input" />
                    </Field>
                    <Field label="เลขบัตรประชาชน">
                      <input value={worker.idCard} onChange={(event) => updateWorker(workerIndex, "idCard", event.target.value)} inputMode="numeric" className="form-input" />
                    </Field>
                    <Field label="ประเภทช่าง">
                      <select value={worker.workerType} onChange={(event) => updateWorker(workerIndex, "workerType", event.target.value)} className="form-input bg-white">
                        <option value="ช่างสี">ช่างสี</option>
                        <option value="ช่างก่อ">ช่างก่อ</option>
                        <option value="ช่างฉาบ">ช่างฉาบ</option>
                        <option value="ช่างไม้">ช่างไม้</option>
                        <option value="ช่างเหล็ก">ช่างเหล็ก</option>
                        <option value="อื่นๆ">อื่นๆ</option>
                      </select>
                    </Field>
                    <Field label="ธนาคาร">
                      <input value={worker.bankName} onChange={(event) => updateWorker(workerIndex, "bankName", event.target.value)} className="form-input" />
                    </Field>
                    <Field label="เลขบัญชี">
                      <input value={worker.accountNo} onChange={(event) => updateWorker(workerIndex, "accountNo", event.target.value)} inputMode="numeric" className="form-input" />
                    </Field>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-extrabold text-gray-500">
                        <tr>
                          <th className="w-14 px-3 py-3">#</th>
                          <th className="px-3 py-3">รายการงาน</th>
                          <th className="w-28 px-3 py-3">จำนวน</th>
                          <th className="w-28 px-3 py-3">หน่วย</th>
                          <th className="w-36 px-3 py-3">ราคา/หน่วย</th>
                          <th className="w-36 px-3 py-3 text-right">รวม</th>
                          <th className="w-16 px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {worker.items.map((item, itemIndex) => (
                          <tr key={itemIndex}>
                            <td className="px-3 py-3 font-bold text-gray-400">{itemIndex + 1}</td>
                            <td className="px-3 py-3">
                              <input value={item.description} onChange={(event) => updateWorkerItem(workerIndex, itemIndex, "description", event.target.value)} className="form-input bg-white py-2" />
                            </td>
                            <td className="px-3 py-3">
                              <input value={item.quantity} onChange={(event) => updateWorkerItem(workerIndex, itemIndex, "quantity", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                            </td>
                            <td className="px-3 py-3">
                              <input value={item.unit} onChange={(event) => updateWorkerItem(workerIndex, itemIndex, "unit", event.target.value)} className="form-input bg-white py-2" />
                            </td>
                            <td className="px-3 py-3">
                              <input value={item.rate} onChange={(event) => updateWorkerItem(workerIndex, itemIndex, "rate", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                            </td>
                            <td className="px-3 py-3 text-right font-extrabold text-gray-950">{formatMoney(Number(item.quantity || 0) * Number(item.rate || 0))}</td>
                            <td className="px-3 py-3 text-right">
                              <button type="button" onClick={() => removeWorkerItem(workerIndex, itemIndex)} className="rounded-lg px-2 py-1 text-xs font-extrabold text-red-500 transition hover:bg-red-50">
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => addWorkerItem(workerIndex)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
                    <Plus size={15} />
                    เพิ่มรายการงาน
                  </button>
                </section>
              );
            })}
          </div>

          <button type="button" onClick={addWorker} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-700">
            <Plus size={16} />
            เพิ่มช่างอีกคน
          </button>

          <FormBlock title="เอกสารแนบและหมายเหตุ">
            <div className="grid gap-3 md:grid-cols-3">
              <AttachmentToggle label="บัตรประชาชนช่างทุกคน" checked={form.idCardsAttached} required onChange={(checked) => setForm({ ...form, idCardsAttached: checked })} />
              <AttachmentToggle label="รายการวัดงาน/วันทำงาน" checked={form.measurementsAttached} required onChange={(checked) => setForm({ ...form, measurementsAttached: checked })} />
              <AttachmentToggle label="Payment transfer list" checked={form.transferListAttached} required onChange={(checked) => setForm({ ...form, transferListAttached: checked })} />
            </div>
            <div className="mt-4">
              <Field label="หมายเหตุ">
                <textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} rows={3} placeholder="ไม่บังคับ" className="form-input resize-none" />
              </Field>
            </div>
          </FormBlock>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="font-extrabold text-gray-950">สรุปชุดค่าแรง DC</h4>
            <div className="mt-4 space-y-2 text-sm">
              <InfoRow label="จำนวนช่าง" value={`${form.workers.length} คน`} />
              <InfoRow label="ยอดรวมค่าแรง" value={`${formatMoney(previewTotals.grossAmount)} บาท`} />
              <InfoRow label="หัก WHT 3%" value={`${formatMoney(previewTotals.whtAmount)} บาท`} />
              <InfoRow label="ยอดสุทธิที่โอน" value={`${formatMoney(previewTotals.netPayable)} บาท`} strong />
            </div>
            <div className="mt-4 rounded-xl border border-white bg-white p-3 text-sm font-bold leading-6 text-gray-700">
              {numberToThaiBahtText(previewTotals.netPayable)}
            </div>
          </section>
          <section className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm font-medium leading-6 text-gray-500">
            รายการนี้จะสร้างเป็นเอกสารชุดเดียวใน dashboard และใช้สำหรับทำ Payment transfer list ให้บัญชีใน phase ถัดไป
          </section>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="button" onClick={onSubmit} className="flex-1 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-700">
              สร้าง Draft
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SubcontractorCreatePanel({
  form,
  setForm,
  errors,
  siteClaims,
  onCancel,
  onSubmit,
}: {
  form: SubcontractorFormState;
  setForm: (next: SubcontractorFormState) => void;
  errors: string[];
  siteClaims: PaymentClaim[];
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const previewItems: PaymentClaimItem[] = form.items
    .map((item) => ({
      description: `${item.description} (${item.pctComplete || 100}% แล้วเสร็จ)`.trim(),
      quantity: Number(item.quantity || 0),
      unit: item.unit.trim() || "LS",
      unitPrice: Number(item.rate || 0),
    }))
    .filter((item) => item.description || item.quantity || item.unitPrice);
  const baseTotals = calculatePaymentTotals({ type: "SUBCONTRACTOR", items: previewItems, whtRate: 3, retentionRate: 5 });
  const advanceDeduct = Number(form.advanceDeduct || 0);
  const otherDeduct = Number(form.otherDeduct || 0);
  const netPayable = baseTotals.netPayable - advanceDeduct - otherDeduct;
  const previewDocNo = createPaymentDocNo({ type: "SUBCONTRACTOR", date: form.date, siteClaims });
  const contractBalance = Number(form.contractTotal || 0) - Number(form.paidToDate || 0) - baseTotals.grossAmount;

  const updateItem = (index: number, key: keyof SubcontractorFormState["items"][number], value: string) => {
    setForm({
      ...form,
      items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: "", quantity: "1", unit: "LS", rate: "", pctComplete: "100" }] });
  };

  const removeItem = (index: number) => {
    const nextItems = form.items.filter((_item, itemIndex) => itemIndex !== index);
    setForm({ ...form, items: nextItems.length ? nextItems : [{ description: "", quantity: "1", unit: "LS", rate: "", pctComplete: "100" }] });
  };

  return (
    <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-violet-600">
            <ReceiptText size={17} />
            Create Subcontractor Payment
          </div>
          <h3 className="mt-1 text-xl font-extrabold text-gray-950">สร้างใบเบิกค่างวดงานรับเหมา</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            สำหรับจ่ายตามงวดงาน อ้างอิงสัญญา พร้อมหักประกันผลงาน 5% และ WHT 3%
          </p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-right">
          <div className="text-xs font-extrabold text-violet-600">เลขเอกสารตัวอย่าง</div>
          <div className="mt-1 text-lg font-extrabold text-gray-950">{previewDocNo}</div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <div className="font-extrabold">กรุณากรอกข้อมูล/แนบเอกสารให้ครบ</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {errors.slice(0, 12).map((error) => (
              <span key={error} className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-red-600">
                {error}
              </span>
            ))}
            {errors.length > 12 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-red-600">+{errors.length - 12} รายการ</span>}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <FormBlock title="ข้อมูลผู้รับเหมาและสัญญา">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="ผู้จัดทำ">
                <input value={form.preparedBy} onChange={(event) => setForm({ ...form, preparedBy: event.target.value })} className="form-input" />
              </Field>
              <Field label="วันที่เอกสาร">
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="form-input" />
              </Field>
              <Field label="ประเภทผู้รับเหมา">
                <select value={form.contractorType} onChange={(event) => setForm({ ...form, contractorType: event.target.value as SubcontractorFormState["contractorType"] })} className="form-input bg-white">
                  <option value="บุคคลธรรมดา">บุคคลธรรมดา</option>
                  <option value="นิติบุคคล">นิติบุคคล</option>
                </select>
              </Field>
              <Field label="ชื่อผู้รับเหมา">
                <input value={form.contractorName} onChange={(event) => setForm({ ...form, contractorName: event.target.value })} className="form-input" />
              </Field>
              <Field label="เลขบัตร/เลขผู้เสียภาษี">
                <input value={form.idOrTax} onChange={(event) => setForm({ ...form, idOrTax: event.target.value })} inputMode="numeric" className="form-input" />
              </Field>
              <Field label="ธนาคาร">
                <input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} className="form-input" />
              </Field>
              <Field label="เลขบัญชี">
                <input value={form.accountNo} onChange={(event) => setForm({ ...form, accountNo: event.target.value })} inputMode="numeric" className="form-input" />
              </Field>
              <Field label="เลขสัญญา/วันที่สัญญา">
                <input value={form.contractRef} onChange={(event) => setForm({ ...form, contractRef: event.target.value })} placeholder="เช่น SUB-2569-001 หรือ 01/04/2569" className="form-input" />
              </Field>
              <Field label="มูลค่าสัญญารวม">
                <input value={form.contractTotal} onChange={(event) => setForm({ ...form, contractTotal: event.target.value })} inputMode="decimal" className="form-input" />
              </Field>
              <Field label="ยอดจ่ายไปแล้วก่อนงวดนี้">
                <input value={form.paidToDate} onChange={(event) => setForm({ ...form, paidToDate: event.target.value })} inputMode="decimal" className="form-input" />
              </Field>
            </div>
          </FormBlock>

          <FormBlock title="งวดงานที่เบิก">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <Field label="งวดที่">
                <input value={form.installmentNo} onChange={(event) => setForm({ ...form, installmentNo: event.target.value })} placeholder="เช่น งวดที่ 1" className="form-input" />
              </Field>
              <Field label="คำอธิบายงวด">
                <input value={form.installmentDesc} onChange={(event) => setForm({ ...form, installmentDesc: event.target.value })} placeholder="เช่น งานสกิมและสีภายใน ชั้น 1-2 แล้วเสร็จ 50%" className="form-input" />
              </Field>
            </div>
          </FormBlock>

          <FormBlock title="รายการงานที่เบิก">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-gray-50 text-xs font-extrabold text-gray-500">
                  <tr>
                    <th className="w-14 px-3 py-3">#</th>
                    <th className="px-3 py-3">รายการงาน</th>
                    <th className="w-28 px-3 py-3">จำนวน</th>
                    <th className="w-28 px-3 py-3">หน่วย</th>
                    <th className="w-36 px-3 py-3">ราคา/หน่วย</th>
                    <th className="w-28 px-3 py-3">% งาน</th>
                    <th className="w-36 px-3 py-3 text-right">รวม</th>
                    <th className="w-16 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-3 font-bold text-gray-400">{index + 1}</td>
                      <td className="px-3 py-3">
                        <input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} className="form-input bg-white py-2" placeholder="เช่น งานสีภายใน ชั้น 1" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3">
                        <input value={item.pctComplete} onChange={(event) => updateItem(index, "pctComplete", event.target.value)} inputMode="decimal" className="form-input bg-white py-2" />
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold text-gray-950">{formatMoney(Number(item.quantity || 0) * Number(item.rate || 0))}</td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => removeItem(index)} className="rounded-lg px-2 py-1 text-xs font-extrabold text-red-500 transition hover:bg-red-50">
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
              <Plus size={15} />
              เพิ่มรายการงาน
            </button>
          </FormBlock>

          <FormBlock title="รายการหักเพิ่มเติมและเอกสารแนบ">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="หักเงินล่วงหน้า">
                <input value={form.advanceDeduct} onChange={(event) => setForm({ ...form, advanceDeduct: event.target.value })} inputMode="decimal" className="form-input" />
              </Field>
              <Field label="หักอื่นๆ">
                <input value={form.otherDeduct} onChange={(event) => setForm({ ...form, otherDeduct: event.target.value })} inputMode="decimal" className="form-input" />
              </Field>
              <Field label="รายละเอียดหักอื่นๆ">
                <input value={form.otherDeductDesc} onChange={(event) => setForm({ ...form, otherDeductDesc: event.target.value })} className="form-input" />
              </Field>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <AttachmentToggle label="สัญญารับเหมา" checked={form.contractAttached} required onChange={(checked) => setForm({ ...form, contractAttached: checked })} />
              <AttachmentToggle label="ใบวัดงาน" checked={form.measurementAttached} required onChange={(checked) => setForm({ ...form, measurementAttached: checked })} />
              <AttachmentToggle label="รูปถ่ายงาน" checked={form.photosAttached} required onChange={(checked) => setForm({ ...form, photosAttached: checked })} />
              <AttachmentToggle label="บัตร/หนังสือรับรอง" checked={form.idOrCompanyDocAttached} required onChange={(checked) => setForm({ ...form, idOrCompanyDocAttached: checked })} />
            </div>
            <div className="mt-4">
              <Field label="หมายเหตุ">
                <textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} rows={3} placeholder="ไม่บังคับ" className="form-input resize-none" />
              </Field>
            </div>
          </FormBlock>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="font-extrabold text-gray-950">สรุปค่างวดรับเหมา</h4>
            <div className="mt-4 space-y-2 text-sm">
              <InfoRow label="รวมมูลค่างาน" value={`${formatMoney(baseTotals.grossAmount)} บาท`} />
              <InfoRow label="หัก Retention 5%" value={`${formatMoney(baseTotals.retentionAmount)} บาท`} />
              <InfoRow label="หัก WHT 3%" value={`${formatMoney(baseTotals.whtAmount)} บาท`} />
              <InfoRow label="หักล่วงหน้า/อื่นๆ" value={`${formatMoney(advanceDeduct + otherDeduct)} บาท`} />
              <InfoRow label="ยอดสุทธิที่โอน" value={`${formatMoney(netPayable)} บาท`} strong />
            </div>
            <div className="mt-4 rounded-xl border border-white bg-white p-3 text-sm font-bold leading-6 text-gray-700">
              {numberToThaiBahtText(netPayable)}
            </div>
          </section>
          <section className={`rounded-2xl border p-4 text-sm font-semibold leading-6 ${
            contractBalance < 0 ? "border-red-100 bg-red-50 text-red-700" : "border-violet-100 bg-violet-50 text-violet-800"
          }`}>
            <div className="font-extrabold">ยอดสัญญาคงเหลือหลังงวดนี้</div>
            <div className="mt-1 text-xl font-extrabold">{formatMoney(contractBalance)} บาท</div>
            {contractBalance < 0 && <div className="mt-2">Alert: ยอดเบิกเกินมูลค่าสัญญา ควรตรวจสอบก่อนส่งบัญชี</div>}
          </section>
          <section className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm font-medium leading-6 text-gray-500">
            รายการนี้จะสร้างเป็น Draft ก่อนส่ง PM/Director และบัญชีตรวจเอกสารใน phase workflow ถัดไป
          </section>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="button" onClick={onSubmit} className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700">
              สร้าง Draft
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function buildStats(claims: PaymentClaim[]) {
  const monthClaims = claims.filter((claim) => claim.createdDate.startsWith("2026-04") || claim.createdDate.startsWith("2026-05"));
  const paidClaims = monthClaims.filter((claim) => claim.status === "TRANSFERRED" || claim.status === "CLOSED");
  const pendingClaims = claims.filter((claim) => ["SUBMITTED_TO_ACCOUNTING", "UNDER_REVIEW", "NEEDS_MORE_INFO", "APPROVED", "TRANSFERRED"].includes(claim.status));
  const dcClaims = claims.filter((claim) => claim.type === "DC_WORKER" || claim.type === "DC_BATCH");

  return {
    monthGross: monthClaims.reduce((sum, claim) => sum + claim.grossAmount, 0),
    monthNet: paidClaims.reduce((sum, claim) => sum + claim.netPayable, 0),
    pendingCount: pendingClaims.length,
    pendingNet: pendingClaims.reduce((sum, claim) => sum + claim.netPayable, 0),
    dcCount: dcClaims.length,
    dcNet: dcClaims.reduce((sum, claim) => sum + claim.netPayable, 0),
    whtTotal: claims.reduce((sum, claim) => sum + claim.whtAmount, 0),
    retentionTotal: claims.reduce((sum, claim) => sum + claim.retentionAmount, 0),
  };
}

function buildTypeBreakdown(claims: PaymentClaim[]) {
  const groups = [
    { label: "ใบสำคัญจ่าย", amount: claims.filter((claim) => claim.type === "PETTY_CASH" || claim.type === "ADVANCE_CASH").reduce((sum, claim) => sum + claim.netPayable, 0), color: "#f97316" },
    { label: "ค่าแรง DC", amount: claims.filter((claim) => claim.type === "DC_WORKER" || claim.type === "DC_BATCH").reduce((sum, claim) => sum + claim.netPayable, 0), color: "#06b6d4" },
    { label: "รับเหมา", amount: claims.filter((claim) => claim.type === "SUBCONTRACTOR").reduce((sum, claim) => sum + claim.netPayable, 0), color: "#8b5cf6" },
  ];
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  let cursor = 0;
  const gradient = groups.map((group) => {
    const start = cursor;
    const end = total ? cursor + (group.amount / total) * 100 : cursor;
    cursor = end;
    return `${group.color} ${start}% ${end}%`;
  }).join(", ");

  return { groups, total, gradient };
}

function buildTopPayees(claims: PaymentClaim[]) {
  const map = new Map<string, { name: string; kind: string; amount: number }>();
  claims.forEach((claim) => {
    const current = map.get(claim.payeeName) || { name: claim.payeeName, kind: claim.payeeKind, amount: 0 };
    current.amount += claim.netPayable;
    map.set(claim.payeeName, current);
  });

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
}

function printClaimDocument(claim: PaymentClaim) {
  const html = buildPaymentClaimPrintHtml(claim);
  const win = window.open("", "_blank", "noopener,noreferrer,width=980,height=1200");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 400);
}

function PrintPreviewModal({ claim, onClose }: { claim: PaymentClaim; onClose: () => void }) {
  const html = buildPaymentClaimPrintHtml(claim);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wide text-orange-600">A4 Print Preview</div>
            <h3 className="mt-1 truncate text-lg font-extrabold text-gray-950">{claim.docNo} · {PAYMENT_TYPE_LABELS[claim.type]}</h3>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => printClaimDocument(claim)}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-orange-700"
            >
              <Printer size={16} />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
              aria-label="ปิด preview"
              title="ปิด preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-gray-100 p-4">
          <iframe
            title={`Preview ${claim.docNo}`}
            srcDoc={html}
            className="h-full w-full rounded-xl border border-gray-200 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

function EmailGeneratorModal({
  claim,
  mode,
  onSend,
  onClose,
}: {
  claim: PaymentClaim;
  mode: "accounting" | "followup";
  onSend: (claim: PaymentClaim, recipients: string) => Promise<SendClaimEmailResult | null>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState("");
  const [recipients, setRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<SendClaimEmailResult | null>(null);
  const generated = mode === "accounting"
    ? buildAccountingEmail(claim, { name: claim.preparedBy, position: "SE / Engineering", urgency: claim.status === "APPROVED" ? "เร่งด่วน" : "ปกติ" })
    : buildFollowupEmail(claim, { name: claim.preparedBy, reasonUrgent: claim.status === "APPROVED" ? "รายการอนุมัติแล้ว รอบัญชีโอนเงิน" : "ติดตามสถานะเอกสาร" });
  const emailText = `Subject: ${generated.subject}\n\n${generated.body}`;

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const sendEmail = async () => {
    setSendError("");
    setSendResult(null);
    if (!recipients.trim()) {
      setSendError("กรุณากรอกอีเมลผู้รับ");
      return;
    }

    setSending(true);
    try {
      const result = await onSend(claim, recipients);
      setSendResult(result);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "ส่งอีเมลขอเบิกไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <div className={`text-xs font-extrabold uppercase tracking-wide ${mode === "accounting" ? "text-blue-600" : "text-amber-600"}`}>
              {mode === "accounting" ? "Accounting Email" : "Follow-up Reminder"}
            </div>
            <h3 className="mt-1 truncate text-lg font-extrabold text-gray-950">{claim.docNo} · {claim.payeeName}</h3>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copyText("ทั้งหมด", emailText)}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-black"
            >
              <FileText size={16} />
              {copied === "ทั้งหมด" ? "Copied" : "Copy ทั้งหมด"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
              aria-label="ปิด email generator"
              title="ปิด email generator"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <main className="space-y-4">
              {mode === "accounting" && (
                <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <label className="text-sm font-extrabold text-blue-800">อีเมลผู้รับ</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={recipients}
                      onChange={(event) => setRecipients(event.target.value)}
                      type="text"
                      placeholder="accounting@example.com"
                      className="form-input bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => void sendEmail()}
                      disabled={sending}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                      ส่งขอเบิกแล้ว
                    </button>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-blue-700">
                    ระบบจะสร้าง PDF ใบเบิก แนบไฟล์หลักฐานที่อัปโหลดไว้ แล้วส่งผ่าน Gmail จาก backend
                  </p>
                  {sendError && (
                    <div className="mt-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-600">
                      {sendError}
                    </div>
                  )}
                  {sendResult && (
                    <div className="mt-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-bold text-emerald-700">
                      ส่งสำเร็จ แนบหลักฐาน {sendResult.evidence_attached_count || 0} ไฟล์
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-extrabold text-gray-700">Subject</label>
                  <button
                    type="button"
                    onClick={() => copyText("subject", generated.subject)}
                    className="rounded-lg px-2 py-1 text-xs font-extrabold text-orange-600 transition hover:bg-orange-50"
                  >
                    {copied === "subject" ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm font-bold text-gray-950">{generated.subject}</div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-extrabold text-gray-700">Email Body</label>
                  <button
                    type="button"
                    onClick={() => copyText("body", generated.body)}
                    className="rounded-lg px-2 py-1 text-xs font-extrabold text-orange-600 transition hover:bg-orange-50"
                  >
                    {copied === "body" ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-white p-4 text-sm font-medium leading-7 text-gray-800">
                  {generated.body}
                </pre>
              </section>
            </main>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h4 className="font-extrabold text-gray-950">ข้อมูลอ้างอิง</h4>
                <div className="mt-3 space-y-2 text-sm">
                  <InfoRow label="ประเภท" value={PAYMENT_TYPE_LABELS[claim.type]} />
                  <InfoRow label="สถานะ" value={PAYMENT_STATUS_LABELS[claim.status]} />
                  <InfoRow label="ยอดสุทธิ" value={`${formatMoney(claim.netPayable)} บาท`} strong />
                  <InfoRow label="ครบกำหนด" value={formatThaiDate(claim.dueDate)} />
                </div>
              </section>

              {mode === "accounting" && "checklist" in generated && (
                <section className="rounded-2xl border border-gray-200 bg-white p-4">
                  <h4 className="font-extrabold text-gray-950">Checklist ก่อนส่ง</h4>
                  <div className="mt-3 space-y-2">
                    {claim.attachments.map((attachment) => (
                      <div key={attachment.name} className={`rounded-xl px-3 py-2 text-sm font-bold ${
                        attachment.present ? "bg-emerald-50 text-emerald-700" : attachment.required ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-500"
                      }`}>
                        {attachment.present ? "ครบ" : "ยังไม่ครบ"} · {attachment.name}
                      </div>
                    ))}
                  </div>
                  {"missingRequired" in generated && generated.missingRequired.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
                      ยังมีเอกสารบังคับไม่ครบ ควรแนบให้ครบก่อนส่งจริง
                    </div>
                  )}
                </section>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  helper: string;
  tone: "orange" | "blue" | "cyan" | "green";
}) {
  const toneClass = {
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  }[tone];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl border ${toneClass}`}>
        <Icon size={21} />
      </div>
      <div className="text-sm font-bold text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-extrabold text-gray-950">{value}</div>
      <div className="mt-1 text-xs font-semibold text-gray-400">{helper}</div>
    </div>
  );
}

function SegmentedFilter({
  icon: Icon,
  items,
  value,
  onChange,
}: {
  icon?: React.ElementType;
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
      {Icon && <Icon size={15} className="ml-2 text-gray-400" />}
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
            value === item.value ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:bg-white/70 hover:text-gray-900"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function PipelineTable({
  claims,
  selectedId,
  onSelect,
}: {
  claims: PaymentClaim[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-gray-950">Pipeline รายการเบิกเงิน</h3>
          <p className="text-sm font-medium text-gray-500">ติดตามรายการตั้งแต่ร่าง ส่งบัญชี อนุมัติ โอนเงิน จนปิดรายการ</p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-extrabold text-gray-500">{claims.length} รายการ</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-gray-50 text-xs font-extrabold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">เลขที่</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">ผู้รับเงิน</th>
              <th className="px-4 py-3">รายการ</th>
              <th className="px-4 py-3 text-right">ยอดขอ</th>
              <th className="px-4 py-3 text-right">หักรวม</th>
              <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {claims.map((claim) => {
              const selected = selectedId === claim.id;
              return (
                <tr
                  key={claim.id}
                  onClick={() => onSelect(claim.id)}
                  className={`cursor-pointer transition hover:bg-orange-50/50 ${selected ? "bg-orange-50/60" : "bg-white"}`}
                >
                  <td className="px-4 py-3 font-extrabold text-gray-950">{claim.docNo}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${PAYMENT_TYPE_STYLES[claim.type]}`}>
                      {PAYMENT_TYPE_LABELS[claim.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{claim.payeeName}</div>
                    <div className="text-xs font-medium text-gray-400">{claim.bankName || "-"} · {claim.accountNoMasked || "-"}</div>
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    <div className="line-clamp-1 font-semibold text-gray-700">{claim.description}</div>
                    <div className="text-xs text-gray-400">{claim.payPeriod || claim.installment || claim.preparedBy}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{formatMoney(claim.grossAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatMoney(claim.whtAmount + claim.retentionAmount)}</td>
                  <td className="px-4 py-3 text-right font-extrabold text-gray-950">{formatMoney(claim.netPayable)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={claim.status} />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-500">{formatThaiDate(claim.createdDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(claim.id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-orange-600 transition hover:bg-orange-50"
                    >
                      ดูรายละเอียด
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {claims.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm font-semibold text-gray-500">ไม่พบรายการตาม filter ที่เลือก</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SelectedClaimPanel({
  claim,
  onPreview,
  onEmail,
  onReminder,
  onUploadAttachment,
  onGenerateDocument,
  canUploadAttachment,
  canGenerateDocument,
}: {
  claim?: PaymentClaim;
  onPreview: (claim: PaymentClaim) => void;
  onEmail: (claim: PaymentClaim) => void;
  onReminder: (claim: PaymentClaim) => void;
  onUploadAttachment: (input: UploadAttachmentInput) => Promise<void>;
  onGenerateDocument: (claim: PaymentClaim) => Promise<GeneratedDocumentResult | null>;
  canUploadAttachment: boolean;
  canGenerateDocument: boolean;
}) {
  const [uploadingAttachment, setUploadingAttachment] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentError, setDocumentError] = useState("");

  if (!claim) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <EmptyState text="ยังไม่มีรายการให้แสดง" />
      </section>
    );
  }

  const missing = getMissingAttachments(claim);
  const uploadAttachment = async (attachmentName: string, file?: File) => {
    if (!file) return;
    setUploadingAttachment(attachmentName);
    setUploadError("");
    try {
      await onUploadAttachment({ claim, attachmentName, file });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "อัปโหลดไฟล์แนบไม่สำเร็จ");
    } finally {
      setUploadingAttachment("");
    }
  };
  const generateDocument = async () => {
    setDocumentLoading(true);
    setDocumentError("");
    try {
      const result = await onGenerateDocument(claim);
      if (result?.pdf_url) setDocumentUrl(result.pdf_url);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setDocumentLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-orange-600">Selected Claim</div>
          <h3 className="mt-1 text-xl font-extrabold text-gray-950">{claim.docNo}</h3>
        </div>
        <StatusBadge status={claim.status} />
      </div>
      <p className="mt-3 text-sm font-medium leading-6 text-gray-500">{claim.description}</p>
      <div className="mt-4 space-y-2 text-sm">
        <InfoRow label="ผู้รับเงิน" value={claim.payeeName} />
        <InfoRow label="ประเภท" value={PAYMENT_TYPE_LABELS[claim.type]} />
        <InfoRow label="บัญชีรับเงิน" value={`${claim.bankName || "-"} · ${claim.accountNoMasked || "-"}`} />
        <InfoRow label="ยอดสุทธิ" value={`${formatMoney(claim.netPayable)} บาท`} strong />
        <InfoRow label="ครบกำหนด" value={formatThaiDate(claim.dueDate)} />
      </div>
      <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${missing.length ? "border-amber-100 bg-amber-50 text-amber-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>
        {missing.length ? getPendingReason(claim) : "เอกสารบังคับครบสำหรับการส่งบัญชี"}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPreview(claim)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-extrabold text-gray-700 transition hover:bg-gray-50"
        >
          <Eye size={16} />
          Preview A4
        </button>
        <button
          type="button"
          onClick={() => printClaimDocument(claim)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-2 text-sm font-extrabold text-white transition hover:bg-orange-700"
        >
          <Printer size={16} />
          Print
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onEmail(claim)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-extrabold text-blue-700 transition hover:bg-blue-100"
        >
          <Mail size={16} />
          Email บัญชี
        </button>
        <button
          type="button"
          onClick={() => onReminder(claim)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-extrabold text-amber-700 transition hover:bg-amber-100"
        >
          <Clock3 size={16} />
          Reminder
        </button>
      </div>
      <div className="mt-2">
        <button
          type="button"
          disabled={documentLoading || !canGenerateDocument}
          onClick={() => void generateDocument()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {documentLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          บันทึก PDF ลง Drive
        </button>
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center text-xs font-extrabold text-blue-700 hover:bg-blue-100"
          >
            เปิด PDF ล่าสุดใน Drive
          </a>
        )}
        {documentError && (
          <div className="mt-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {documentError}
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-sm font-extrabold text-gray-900">Checklist เอกสารแนบ</div>
        {uploadError && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {uploadError}
          </div>
        )}
        {claim.attachments.map((attachment) => (
          <div key={attachment.name} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-700">{attachment.name}</span>
              {attachment.fileName && (
                <a
                  href={attachment.fileUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-xs font-bold text-blue-600 hover:text-blue-700"
                  onClick={(event) => event.stopPropagation()}
                >
                  {attachment.fileName}
                </a>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${attachment.present ? "text-emerald-600" : attachment.required ? "text-red-600" : "text-gray-400"}`}>
                {attachment.present ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {attachment.present ? "ครบ" : attachment.required ? "ขาด" : "ยังไม่แนบ"}
              </span>
              <label
                className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-gray-600 transition hover:bg-gray-50 ${canUploadAttachment ? "cursor-pointer" : "cursor-not-allowed opacity-45"}`}
                onClick={(event) => event.stopPropagation()}
              >
                {uploadingAttachment === attachment.name ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                แนบ
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingAttachment === attachment.name || !canUploadAttachment}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void uploadAttachment(attachment.name, file);
                  }}
                />
              </label>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountingWorkflowPanel({
  claim,
  userRole,
  onAction,
}: {
  claim?: PaymentClaim;
  userRole: string;
  onAction: (claim: PaymentClaim, action: AccountingAction, note?: string) => void;
}) {
  const [reviewer, setReviewer] = useState("Accounting");
  const [transferDate, setTransferDate] = useState(todayBangkok());
  const [transferRef, setTransferRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [checks, setChecks] = useState({
    docTypeCorrect: true,
    amountMatches: true,
    taxCorrect: true,
    payeeVerified: true,
    bankVerified: true,
    attachmentsComplete: true,
    budgetSufficient: true,
  });

  if (!claim) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <EmptyState text="เลือกเอกสารก่อนทำ workflow บัญชี" />
      </section>
    );
  }

  const missingAttachments = getMissingAttachments(claim);
  const checklistPasses = Object.values(checks).every(Boolean) && missingAttachments.length === 0;
  const failedCheckCount = Object.values(checks).filter((checked) => !checked).length;
  const canSubmit = hasPermission(userRole, "payment.submit") && (claim.status === "DRAFT" || claim.status === "NEEDS_MORE_INFO" || claim.status === "REJECTED");
  const canReview = hasPermission(userRole, "payment.review") && claim.status === "SUBMITTED_TO_ACCOUNTING";
  const canApprove = hasPermission(userRole, "payment.approve") && claim.status === "UNDER_REVIEW" && checklistPasses;
  const canReturn = (claim.status === "UNDER_REVIEW" || claim.status === "SUBMITTED_TO_ACCOUNTING");
  const canNeedsInfo = hasPermission(userRole, "payment.requestInfo") && canReturn;
  const canReject = hasPermission(userRole, "payment.reject") && canReturn;
  const canTransfer = hasPermission(userRole, "payment.transfer") && claim.status === "APPROVED";
  const canClose = hasPermission(userRole, "payment.close") && claim.status === "TRANSFERRED";
  const workflowSteps = [
    { status: "DRAFT", label: "Draft" },
    { status: "SUBMITTED_TO_ACCOUNTING", label: "Submitted" },
    { status: "UNDER_REVIEW", label: "Review" },
    { status: "APPROVED", label: "Approved" },
    { status: "TRANSFERRED", label: "Transferred" },
    { status: "CLOSED", label: "Closed" },
  ] as const;

  const updateCheck = (key: keyof typeof checks, value: boolean) => {
    setChecks((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-emerald-600">Accounting Workflow</div>
          <h3 className="mt-1 text-lg font-extrabold text-gray-950">ตรวจเอกสารและปิดรายการ</h3>
        </div>
        <FileCheck2 size={20} className="text-emerald-600" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-extrabold md:grid-cols-6">
        {workflowSteps.map((step) => {
          const active = claim.status === step.status;
          const done = workflowSteps.findIndex((item) => item.status === claim.status) > workflowSteps.findIndex((item) => item.status === step.status);
          return (
            <div
              key={step.status}
              className={`rounded-xl border px-2 py-2 ${
                active
                  ? "border-orange-200 bg-orange-50 text-orange-700"
                  : done
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-gray-100 bg-gray-50 text-gray-400"
              }`}
            >
              {step.label}
            </div>
          );
        })}
      </div>

      {claim.status === "NEEDS_MORE_INFO" && (
        <div className="mt-4 rounded-xl border border-yellow-100 bg-yellow-50 p-3 text-sm font-semibold leading-6 text-yellow-800">
          บัญชีขอข้อมูลเพิ่ม: SE สามารถแก้เอกสาร/แนบไฟล์ให้ครบ แล้วกด “ส่งบัญชี” เพื่อวนกลับเข้าคิวตรวจอีกครั้ง
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <Field label="ผู้ตรวจ/ผู้บันทึก">
          <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="form-input py-2" />
        </Field>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onAction(claim, "submit", `${reviewer} ส่งเอกสารให้บัญชีตรวจ`)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          ส่งบัญชี
        </button>
        <button
          type="button"
          disabled={!canReview}
          onClick={() => onAction(claim, "review", `${reviewer} รับเรื่องและเริ่มตรวจเอกสาร`)}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          เริ่มตรวจเอกสาร
        </button>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-extrabold text-gray-900">Verification checklist</div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${checklistPasses ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {checklistPasses ? "ผ่านพร้อมอนุมัติ" : `ต้องตรวจอีก ${failedCheckCount + missingAttachments.length} จุด`}
          </span>
        </div>
        {[
          ["docTypeCorrect", "ประเภทเอกสารถูกต้อง"],
          ["amountMatches", "ยอดเงินตรงกับรายการ/ใบเสร็จ"],
          ["taxCorrect", "WHT / Retention คำนวณถูกต้อง"],
          ["payeeVerified", "ชื่อผู้รับตรงกับบัตร/เอกสาร"],
          ["bankVerified", "บัญชีธนาคารตรวจสอบแล้ว"],
          ["attachmentsComplete", "เอกสารแนบครบ"],
          ["budgetSufficient", "งบประมาณเพียงพอ"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={checks[key as keyof typeof checks]}
              onChange={(event) => updateCheck(key as keyof typeof checks, event.target.checked)}
              className="h-4 w-4 accent-orange-600"
            />
          </label>
        ))}
      </div>

      {missingAttachments.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
          ยังขาดเอกสารบังคับ: {missingAttachments.map((item) => item.name).join(", ")}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canApprove}
          onClick={() => onAction(claim, "approve", `${reviewer} อนุมัติยอด ${formatMoney(claim.netPayable)} บาท`)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          อนุมัติ
        </button>
        <button
          type="button"
          disabled={!canNeedsInfo}
          onClick={() => onAction(claim, "needs_info", rejectReason || `${reviewer} ขอเอกสาร/ข้อมูลเพิ่มเติม`)}
          className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          ขอข้อมูลเพิ่ม
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          rows={2}
          placeholder="เหตุผลตีกลับ/ปฏิเสธ หรือหมายเหตุบัญชี"
          className="form-input resize-none"
        />
        <button
          type="button"
          disabled={!canReject}
          onClick={() => onAction(claim, "reject", rejectReason || `${reviewer} ปฏิเสธเอกสาร`)}
          className="w-full rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-extrabold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Reject
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="text-sm font-extrabold text-gray-900">บันทึกการโอน</div>
        <div className="mt-3 space-y-3">
          <Field label="วันที่โอน">
            <input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} className="form-input py-2" />
          </Field>
          <Field label="เลขอ้างอิงธนาคาร / Slip ref">
            <input value={transferRef} onChange={(event) => setTransferRef(event.target.value)} className="form-input py-2" />
          </Field>
          <button
            type="button"
            disabled={!canTransfer || !transferRef.trim()}
            onClick={() => onAction(claim, "transfer", `${reviewer} บันทึกโอนวันที่ ${formatThaiDate(transferDate)} ref: ${transferRef || "-"} ยอด ${formatMoney(claim.netPayable)} บาท`)}
            className="w-full rounded-xl bg-teal-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            บันทึกโอน
          </button>
          <button
            type="button"
            disabled={!canClose}
            onClick={() => onAction(claim, "close", `${reviewer} ปิดรายการหลังตรวจ slip/ref ${transferRef || claim.docNo}`)}
            className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
          >
            ปิดรายการ
          </button>
        </div>
      </div>
    </section>
  );
}

function PaymentAuditTimeline({ logs, claim }: { logs: PaymentAuditRecord[]; claim?: PaymentClaim }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-blue-600">Audit Timeline</div>
          <h3 className="mt-1 text-lg font-extrabold text-gray-950">ประวัติรายการบัญชี</h3>
          {claim && <p className="mt-1 text-xs font-semibold text-gray-400">{claim.docNo}</p>}
        </div>
        <Clock3 size={20} className="text-blue-600" />
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm font-semibold leading-6 text-gray-500">
          ยังไม่มี audit จากฐานข้อมูลจริง รายการ mock จะแสดง workflow ได้แต่ยังไม่บันทึก timeline
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.audit_id || `${log.action}-${log.created_at}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-gray-950">{formatAuditAction(log.action)}</div>
                  <div className="mt-1 text-xs font-semibold text-gray-400">{formatAuditTimestamp(log.created_at)}</div>
                </div>
                {log.to_status && <StatusBadge status={formatAuditStatus(log.to_status)} />}
              </div>
              {(log.from_status || log.to_status) && (
                <div className="mt-2 text-xs font-bold text-gray-500">
                  {formatAuditStatusLabel(log.from_status)} → {formatAuditStatusLabel(log.to_status)}
                </div>
              )}
              {log.note && <div className="mt-2 text-sm font-medium leading-6 text-gray-600">{log.note}</div>}
              <div className="mt-2 text-xs font-semibold text-gray-400">
                {log.actor_name || log.actor_email || "System"}{log.actor_role ? ` · ${log.actor_role}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TypeBreakdownPanel({ breakdown }: { breakdown: ReturnType<typeof buildTypeBreakdown> }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-gray-950">สัดส่วนรายจ่าย</h3>
          <p className="text-xs font-semibold text-gray-400">ตามประเภทเอกสาร</p>
        </div>
        <FileText size={18} className="text-orange-500" />
      </div>
      <div className="mt-5 grid grid-cols-[128px_minmax(0,1fr)] items-center gap-4">
        <div
          className="grid h-32 w-32 place-items-center rounded-full"
          style={{ background: `conic-gradient(${breakdown.gradient})` }}
        >
          <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center shadow-sm">
            <span className="text-sm font-extrabold text-gray-950">{formatMoney(breakdown.total)}</span>
          </div>
        </div>
        <div className="space-y-2">
          {breakdown.groups.map((group) => (
            <div key={group.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-gray-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                {group.label}
              </span>
              <span className="font-extrabold text-gray-950">{formatMoney(group.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TopPayeesPanel({ payees }: { payees: Array<{ name: string; kind: string; amount: number }> }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="font-extrabold text-gray-950">ผู้รับเงินสูงสุด</h3>
      <div className="mt-4 space-y-3">
        {payees.map((payee, index) => (
          <div key={payee.name} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gray-100 text-xs font-extrabold text-gray-500">{index + 1}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-gray-900">{payee.name}</div>
                <div className="text-xs font-semibold text-gray-400">{payee.kind}</div>
              </div>
            </div>
            <div className="text-right text-sm font-extrabold text-gray-950">{formatMoney(payee.amount)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PendingActionsPanel({ claims, onSelect }: { claims: PaymentClaim[]; onSelect: (id: string) => void }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-gray-950">Pending actions สำหรับ SE</h3>
          <p className="text-sm font-medium text-gray-500">รายการที่ควรจัดการก่อนส่งต่อบัญชีหรือก่อนตามงาน</p>
        </div>
        <Clock3 size={20} className="text-orange-500" />
      </div>
      <div className="space-y-3">
        {claims.map((claim) => (
          <button
            key={claim.id}
            type="button"
            onClick={() => onSelect(claim.id)}
            className="flex w-full items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-left transition hover:border-orange-100 hover:bg-orange-50/50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-gray-950">{claim.docNo} · {claim.payeeName}</span>
              <span className="mt-1 block text-sm font-medium text-gray-500">{getPendingReason(claim)}</span>
            </span>
            <StatusBadge status={claim.status} />
          </button>
        ))}
      </div>
    </section>
  );
}

function AccountingReadinessPanel({ claims }: { claims: PaymentClaim[] }) {
  const ready = claims.filter((claim) => getMissingAttachments(claim).length === 0).length;
  const needsInfo = claims.filter((claim) => claim.status === "NEEDS_MORE_INFO" || claim.status === "REJECTED").length;
  const waitingTransfer = claims.filter((claim) => claim.status === "APPROVED").length;
  const waitingClose = claims.filter((claim) => claim.status === "TRANSFERRED").length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-gray-950">Accounting readiness</h3>
          <p className="text-sm font-medium text-gray-500">ภาพรวมความพร้อมก่อนเชื่อม workflow บัญชีใน phase ถัดไป</p>
        </div>
        <FileCheck2 size={20} className="text-emerald-600" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="เอกสารครบ" value={`${ready}/${claims.length}`} tone="green" />
        <MiniStat label="ขอเพิ่ม/ตีกลับ" value={`${needsInfo}`} tone="red" />
        <MiniStat label="รอโอน" value={`${waitingTransfer}`} tone="orange" />
        <MiniStat label="รอปิด" value={`${waitingClose}`} tone="green" />
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4 text-sm font-medium leading-6 text-gray-500">
        Phase นี้ยังเป็น mock frontend: checklist, approve / reject / needs more info, บันทึกโอน และปิดรายการทำงานบน state ในหน้า เพื่อให้ phase backend/database ต่อได้โดยไม่ต้องรื้อ UI หลัก
      </div>
    </section>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "orange" }) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-xs font-extrabold opacity-70">{label}</div>
      <div className="mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}

function formatAuditStatus(value?: string) {
  const status = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_LABELS, status)
    ? status as PaymentClaimStatus
    : "DRAFT";
}

function formatAuditStatusLabel(value?: string) {
  const status = String(value || "").trim().toUpperCase();
  if (!status) return "-";
  return Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_LABELS, status)
    ? PAYMENT_STATUS_LABELS[status as PaymentClaimStatus]
    : status;
}

function formatAuditAction(value?: string) {
  if (value === "submit_email") return "ส่งขอเบิกแล้ว";
  const labels: Record<string, string> = {
    created: "สร้างรายการ",
    submit: "ส่งบัญชี",
    review: "เริ่มตรวจ",
    approve: "อนุมัติ",
    needs_info: "ขอข้อมูลเพิ่ม",
    reject: "ปฏิเสธ",
    transfer: "บันทึกโอน",
    close: "ปิดรายการ",
    status_updated: "อัปเดตสถานะ",
    attachment_uploaded: "แนบไฟล์",
    document_generated: "สร้าง PDF",
  };
  const action = String(value || "").trim();
  return labels[action] || action || "บันทึกกิจกรรม";
}

function formatAuditTimestamp(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function StatusBadge({ status }: { status: PaymentClaimStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold ${PAYMENT_STATUS_STYLES[status]}`}>
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 p-5">
      <h4 className="mb-4 font-extrabold text-gray-950">{title}</h4>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function AttachmentToggle({
  label,
  checked,
  required = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  required?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm font-bold transition ${
      checked ? "border-emerald-100 bg-emerald-50 text-emerald-700" : required ? "border-red-100 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-gray-500"
    }`}>
      <span>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-orange-600"
      />
    </label>
  );
}

function InfoRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span className={`max-w-[220px] text-right ${strong ? "font-extrabold text-orange-700" : "font-bold text-gray-900"}`}>{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm font-semibold text-gray-500">{text}</div>;
}
