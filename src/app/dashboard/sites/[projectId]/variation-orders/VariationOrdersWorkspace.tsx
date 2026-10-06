"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  Banknote,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { hasPermission } from "@/lib/permissions";
import {
  VO_STATUS_LABELS,
  VO_STATUS_STYLES,
  VO_TYPE_LABELS,
  asVoItemChangeType,
  asVoItemRowType,
  asVoStatus,
  asVoType,
  calculateVoTotals,
  formatMoney,
  formatThaiDate,
  isVoFinanciallyActive,
  numberValue,
  resolveVoItemChangeType,
  todayBangkok,
  voFinancialEffect,
  type VoItemInput,
  type VoRecord,
} from "@/lib/variationOrders";
import { parseVoSpreadsheetRows, type VoSpreadsheetParseResult } from "@/lib/variationOrderSpreadsheet";

type Project = {
  project_id: string;
  name?: string;
  client?: string;
  budget?: string;
  contract_no?: string;
};

type TaskRecord = Record<string, string | number | undefined> & {
  task_id: string;
  name?: string;
  task_type?: string;
  parent_task_id?: string;
};

type ApiResponse = {
  success: boolean;
  project: Project;
  data: Array<VoRecord & { items?: VoItemInput[] }>;
  tasks: TaskRecord[];
  documents: Array<Record<string, string | number | undefined>>;
  payments: Array<Record<string, string | number | undefined>>;
  ledger: Array<Record<string, string | number | undefined>>;
  audit_logs: Array<Record<string, string | number | undefined>>;
};

type CustomerItemDecision = {
  item_key?: string;
  item_no?: string | number;
  description?: string;
  amount?: string | number;
  decision?: "approved" | "rejected";
  note?: string;
};

function taskOrder(task: TaskRecord) {
  return Number(task.order_index || 0) || 999999;
}

function getTaskDepth(task: TaskRecord, taskMap: Map<string, TaskRecord>) {
  let depth = 0;
  let parentId = String(task.parent_task_id || "");
  const seen = new Set<string>([task.task_id]);

  while (parentId && !seen.has(parentId)) {
    const parent = taskMap.get(parentId);
    if (!parent) break;
    depth += 1;
    seen.add(parentId);
    parentId = String(parent.parent_task_id || "");
  }

  return depth;
}

function getHeadingLevelLabel(task: TaskRecord, taskMap: Map<string, TaskRecord>) {
  return `H${getTaskDepth(task, taskMap) + 1}`;
}

type CreateForm = {
  vo_type: string;
  title: string;
  description: string;
  amount: string;
  extension_days: string;
  status: string;
  client_name: string;
  source_type: string;
  source_ref_id: string;
  source_description: string;
  vat_exempt: boolean;
  withholding_tax: string;
  supporting_docs: string;
  approval_deadline_days: string;
  items: VoItemInput[];
};

const emptyCreateForm: CreateForm = {
  vo_type: "VO+",
  title: "",
  description: "",
  amount: "",
  extension_days: "0",
  status: "pending_approval",
  client_name: "",
  source_type: "client_request",
  source_ref_id: "",
  source_description: "",
  vat_exempt: true,
  withholding_tax: "0",
  supporting_docs: "",
  approval_deadline_days: "14",
  items: [
    { item_no: 1, sort_order: 1, row_type: "group", change_type: "add", description: "", unit: "LS", quantity: "1", unit_price: "" },
    { item_no: 2, sort_order: 2, row_type: "detail", parent_item_no: 1, description: "", unit: "", quantity: "1", unit_price: "" },
  ],
};

function calculationForItems(items: VoItemInput[], voType: string = "VO+") {
  return calculateVoTotals({ items, defaultVoType: asVoType(voType), tax: { vat_exempt: true } });
}

function normalizeEditorItems(items: VoItemInput[]) {
  let groupNo = 0;
  let currentGroupNo = 0;
  return items.map((item, index) => {
    const rowType = asVoItemRowType(String(item.row_type || ""));
    if (rowType === "group") {
      groupNo += 1;
      currentGroupNo = groupNo;
    }
    return {
      ...item,
      item_no: rowType === "group" ? currentGroupNo : index + 1,
      sort_order: index + 1,
      row_type: rowType,
      parent_item_no: rowType === "group" ? "" : currentGroupNo || 1,
    } satisfies VoItemInput;
  });
}

const emptyEvidence = {
  client_approved_by: "",
  client_approved_date: todayBangkok(),
  channel: "line",
  evidence_type: "line_screenshot",
  evidence_description: "",
  evidence_filename: "",
  remarks: "",
};

const emptyPlan = {
  parent_task_id: "",
  task_id: "",
  name: "",
  category: "งานทั่วไป",
  assignee: "",
  start: todayBangkok(),
  end: todayBangkok(),
  notes: "",
};

const tabs = [
  { key: "history", label: "รายการ / ประวัติ", icon: FileText },
  { key: "create", label: "เพิ่มงานใหม่", icon: Plus },
  { key: "plan", label: "เข้าแผนงาน", icon: Workflow },
];

const PLAN_ELIGIBLE_STATUSES = new Set(["approved", "billed", "partial_payment", "paid", "overdue"]);

function canAddVoToPlan(vo?: VoRecord) {
  return PLAN_ELIGIBLE_STATUSES.has(asVoStatus(String(vo?.status || "")));
}

function rejectionReasonFor(vo?: VoRecord) {
  if (!vo?.rejection_json) return "";
  try {
    const rejection = JSON.parse(String(vo.rejection_json)) as { reason?: unknown };
    return String(rejection.reason || "").trim();
  } catch {
    return "";
  }
}

function customerItemDecisionsFor(vo?: VoRecord) {
  if (!vo) return [];
  const parse = (value: unknown) => {
    try {
      return JSON.parse(String(value || "{}")) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const evidence = parse(vo.evidence_json);
  const rejection = parse(vo.rejection_json);
  const decisions = Array.isArray(evidence.item_decisions)
    ? evidence.item_decisions
    : Array.isArray(rejection.item_decisions)
      ? rejection.item_decisions
      : [];
  return decisions as CustomerItemDecision[];
}

type VoPermissions = {
  create: boolean;
  submitToClient: boolean;
  approveOnBehalf: boolean;
  addToPlan: boolean;
  createInvoice: boolean;
  recordPayment: boolean;
  cancel: boolean;
  expiryCheck: boolean;
  overdueCheck: boolean;
  generateMonthlyReport: boolean;
};

export default function VariationOrdersWorkspace({ project, userRole }: { project: Project; userRole: string }) {
  const endpoint = `/api/sites/${encodeURIComponent(project.project_id)}/variation-orders`;
  const { data, isLoading, mutate } = useSWR<ApiResponse>(endpoint, fetcher);
  const vos = useMemo(() => data?.data || [], [data?.data]);
  const tasks = useMemo(() => data?.tasks || [], [data?.tasks]);
  const headings = useMemo(() => tasks.filter((task) => task.task_type === "heading").sort((a, b) => taskOrder(a) - taskOrder(b)), [tasks]);
  const workTasks = useMemo(() => tasks.filter((task) => task.task_type !== "heading"), [tasks]);
  const normalizedRole = String(userRole || "").toLowerCase();
  const isClient = normalizedRole === "client";
  const permissions = useMemo(() => ({
    create: hasPermission(userRole, "vo.create"),
    submitToClient: hasPermission(userRole, "vo.submitToClient"),
    approveOnBehalf: hasPermission(userRole, "vo.approveOnBehalf"),
    addToPlan: hasPermission(userRole, "vo.addToPlan"),
    createInvoice: hasPermission(userRole, "vo.createInvoice"),
    recordPayment: hasPermission(userRole, "vo.recordPayment"),
    cancel: hasPermission(userRole, "vo.cancel"),
    expiryCheck: hasPermission(userRole, "vo.expiryCheck"),
    overdueCheck: hasPermission(userRole, "vo.overdueCheck"),
    generateMonthlyReport: hasPermission(userRole, "vo.generateMonthlyReport"),
  }), [userRole]);
  const visibleTabs = useMemo(() => {
    return tabs.filter((tab) => {
      if (isClient) return tab.key === "history";
      if (tab.key === "create") return permissions.create;
      if (tab.key === "plan") return permissions.addToPlan;
      return true;
    });
  }, [isClient, permissions]);
  const [activeTab, setActiveTab] = useState("history");
  const [selectedVoId, setSelectedVoId] = useState("");
  const [editingVoId, setEditingVoId] = useState("");
  const [createForm, setCreateForm] = useState<CreateForm>({
    ...emptyCreateForm,
    client_name: project.client || "",
  });
  const [plan, setPlan] = useState(emptyPlan);
  const [loadingAction, setLoadingAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [documentHtml, setDocumentHtml] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const selectedVoFromState = useMemo(() => {
    return vos.find((vo) => vo.vo_id === selectedVoId) || vos[0];
  }, [selectedVoId, vos]);
  const planCandidate = useMemo(() => {
    return (
      vos.find((vo) => canAddVoToPlan(vo) && vo.task_plan_status !== "planned") ||
      vos.find((vo) => canAddVoToPlan(vo))
    );
  }, [vos]);
  const selectedVo = useMemo(() => {
    if (
      activeTab === "plan" &&
      planCandidate &&
      (!selectedVoFromState || !canAddVoToPlan(selectedVoFromState) || selectedVoFromState.task_plan_status === "planned")
    ) {
      return planCandidate;
    }

    return selectedVoFromState;
  }, [activeTab, planCandidate, selectedVoFromState]);
  const selectedDocuments = useMemo(() => {
    if (!selectedVo?.vo_id) return [];
    return (data?.documents || []).filter((document) => document.vo_id === selectedVo.vo_id);
  }, [data?.documents, selectedVo]);

  const stats = useMemo(() => {
    const approvedVos = vos.filter(isVoFinanciallyActive);
    const effects = approvedVos.map(voFinancialEffect);
    const addAmount = effects.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0);
    const deductAmount = Math.abs(effects.filter((amount) => amount < 0).reduce((sum, amount) => sum + amount, 0));
    const extensionDays = approvedVos.reduce((sum, vo) => sum + numberValue(vo.extension_days), 0);
    return {
      count: vos.length,
      pending: vos.filter((vo) => vo.status === "pending_approval").length,
      approved: approvedVos.length,
      addAmount,
      deductAmount,
      netAmount: addAmount - deductAmount,
      extensionDays,
    };
  }, [vos]);

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    setLoadingAction(action);
    setMessage("");
    setError("");
    setDocumentHtml("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const missing = Array.isArray(result.missing) ? `: ${result.missing.join(", ")}` : "";
        throw new Error(`${result.error || "ทำรายการไม่สำเร็จ"}${missing}`);
      }
      if (result.document_html) setDocumentHtml(String(result.document_html));
      await mutate();
      setMessage("ทำรายการสำเร็จ");
      return result;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setLoadingAction("");
    }
  };

  const createVo = async () => {
    if (!createForm.title.trim()) {
      setMessage("");
      setError("กรุณากรอกชื่องาน");
      return;
    }
    const approvalDeadlineDays = numberValue(createForm.approval_deadline_days);
    if (approvalDeadlineDays < 1 || approvalDeadlineDays > 90) {
      setMessage("");
      setError("กรุณากำหนดระยะเวลาตอบกลับระหว่าง 1–90 วัน");
      return;
    }
    const calculation = calculationForItems(createForm.items, createForm.vo_type);
    if (calculation.increase_total + calculation.decrease_total <= 0) {
      setMessage("");
      setError("กรุณากรอกรายการงานและมูลค่ารวมให้มากกว่า 0 บาท");
      return;
    }
    const result = await postAction(editingVoId ? "update_vo" : "create_vo", {
      ...(editingVoId ? { vo_id: editingVoId } : {}),
      ...createForm,
      vat_exempt: true,
      withholding_tax: "0",
      vo_type: calculation.vo_type,
      amount: String(calculation.grand_total),
      items: normalizeEditorItems(createForm.items),
    });
    if (result?.data?.vo_id) {
      setSelectedVoId(result.data.vo_id);
      setEditingVoId("");
      setCreateForm({ ...emptyCreateForm, client_name: project.client || "" });
      setActiveTab("history");
    }
  };

  const startEditVo = (vo: VoRecord & { items?: VoItemInput[] }) => {
    const existingItems = Array.isArray(vo.items) && vo.items.length > 0
      ? normalizeEditorItems(vo.items.map((item, index) => ({
          item_no: item.item_no || index + 1,
          sort_order: item.sort_order || index + 1,
          row_type: asVoItemRowType(String(item.row_type || "")),
          change_type: asVoItemChangeType(String(item.change_type || item.row_type || ""), asVoType(String(vo.vo_type || "VO+"))),
          parent_item_no: item.parent_item_no,
          description: String(item.description || ""),
          unit: String(item.unit || "LS"),
          quantity: String(item.quantity || "1"),
          unit_price: String(item.unit_price || ""),
          material_unit_price: String(item.material_unit_price || ""),
          material_amount: String(item.material_amount || ""),
          labor_unit_price: String(item.labor_unit_price || (!item.material_unit_price && !item.labor_unit_price ? item.unit_price || "" : "")),
          labor_amount: String(item.labor_amount || ""),
          amount: String(item.amount || ""),
        })))
      : [{
          item_no: 1,
          sort_order: 1,
          row_type: "group",
          change_type: asVoType(String(vo.vo_type || "VO+")) === "VO-" ? "deduct" : "add",
          description: String(vo.title || vo.description || "งานเพิ่ม-ลด"),
          unit: "LS",
          quantity: "1",
          unit_price: String(vo.grand_total || vo.subtotal || ""),
        }];
    setSelectedVoId(vo.vo_id);
    setEditingVoId(vo.vo_id);
    setCreateForm({
      vo_type: String(vo.vo_type || "VO+"),
      title: String(vo.title || ""),
      description: String(vo.description || ""),
      amount: String(calculationForItems(existingItems, String(vo.vo_type || "VO+")).grand_total),
      extension_days: String(vo.extension_days || "0"),
      status: String(vo.status || "") === "rejected"
        ? "draft"
        : ["draft", "pending_approval"].includes(String(vo.status || "")) ? String(vo.status || "") : "pending_approval",
      client_name: String(vo.client_name || project.client || ""),
      source_type: String(vo.source_type || "client_request"),
      source_ref_id: String(vo.source_ref_id || ""),
      source_description: String(vo.source_description || ""),
      vat_exempt: String(vo.vat_exempt || "").toLowerCase() === "true",
      withholding_tax: String(vo.withholding_tax || "0"),
      supporting_docs: String(vo.supporting_docs || ""),
      approval_deadline_days: "14",
      items: existingItems,
    });
    setActiveTab("create");
    setMessage(`กำลังแก้ไข ${vo.vo_id}`);
    setError("");
  };

  const cancelEdit = () => {
    setEditingVoId("");
    setCreateForm({ ...emptyCreateForm, client_name: project.client || "" });
    setMessage("");
    setError("");
    setActiveTab("history");
  };

  const addToPlan = async () => {
    if (!selectedVo?.vo_id) return;
    const planPayload = {
      ...plan,
      name: plan.name || selectedVo.title || "",
    };
    const result = await postAction("add_to_plan", { vo_id: selectedVo.vo_id, plan: planPayload });
    if (result?.success) {
      setPlan(emptyPlan);
      setActiveTab("history");
    }
  };

  const sendApproval = async () => {
    if (!selectedVo?.vo_id) return;
    await postAction("send_approval", {
      vo_id: selectedVo.vo_id,
      origin: window.location.origin,
    });
  };

  const createRevisionFromApprovedItems = async () => {
    if (!selectedVo?.vo_id) return;
    const result = await postAction("create_revision_from_approved_items", { vo_id: selectedVo.vo_id });
    if (result?.data?.vo_id) {
      setSelectedVoId(String(result.data.vo_id));
      setEditingVoId("");
      setActiveTab("history");
      setMessage(result.reused
        ? `เปิด ${result.data.vo_id} ซึ่งเป็นฉบับแก้ไขที่สร้างไว้แล้ว`
        : `สร้าง ${result.data.vo_id} เป็นฉบับร่างแล้ว กรุณาตรวจสอบก่อนส่งลูกค้า`);
    }
  };

  const printDocument = () => {
    if (!documentHtml) return;
    const opened = printHtml(documentHtml, 900, 1200);
    if (opened) {
      setMessage("เปิดหน้าพิมพ์แล้ว");
      setError("");
    }
  };

  const printHtml = (html: string, width = 900, height = 1200, targetWindow?: Window | null) => {
    const win = targetWindow || window.open("", "_blank", `popup=yes,width=${width},height=${height}`);
    if (!win) {
      setError("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup แล้วกด Print อีกครั้ง");
      return false;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    window.setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
    return true;
  };

  const openPrintPreview = () => {
    setPrintDialogOpen(true);
    setMessage("");
    setError("");
  };

  const editVo = async (vo: VoRecord & { items?: VoItemInput[] }) => {
    const status = asVoStatus(String(vo.status || ""));
    const requiresRecall = status === "pending_approval" && Boolean(vo.approval_token || vo.sent_to_customer_at);

    if (requiresRecall) {
      const result = await postAction("recall_for_edit", { vo_id: vo.vo_id });
      if (!result?.data) return;

      const recalledVo = {
        ...vo,
        ...result.data,
        status: "draft",
        items: vo.items,
      } as VoRecord & { items?: VoItemInput[] };
      setDetailDialogOpen(false);
      startEditVo(recalledVo);
      setMessage(`เรียกกลับ ${vo.vo_id} แล้ว ลิงก์เดิมถูกยกเลิก กรุณาบันทึกและส่ง LINE ฉบับใหม่`);
      return;
    }

    setDetailDialogOpen(false);
    startEditVo(vo);
  };

  const printVariationOrders = () => {
    document.body.classList.add("printing-variation-orders");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-variation-orders"), 250);
  };

  return (
    <div className="space-y-5">
      {activeTab !== "create" ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="ยอดเงินงานเพิ่มรวม" value={`${formatMoney(stats.addAmount)} บาท`} tone="green" />
            <Metric label="ยอดเงินงานลดรวม" value={`${formatMoney(stats.deductAmount)} บาท`} tone="red" />
            <Metric label="ยอดเงินสุทธิ" value={`${formatMoney(stats.netAmount)} บาท`} tone={stats.netAmount >= 0 ? "orange" : "red"} />
            <Metric label="วันเพิ่มรวม" value={`${formatMoney(stats.extensionDays)} วัน`} tone="sky" />
            <Metric label="อนุมัติแล้ว" value={`${stats.approved} รายการ`} tone="gray" />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-orange-600 text-white shadow-sm" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {documentHtml && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm font-semibold text-orange-800">
          <span>ระบบสร้างเอกสาร HTML พร้อมพิมพ์แล้ว</span>
          <button type="button" onClick={printDocument} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-white hover:bg-orange-700">
            <Printer size={16} />
            Print
          </button>
        </div>
      )}

      <div className={activeTab === "plan" ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]" : "min-w-0"}>
        <main className="min-w-0">
          {activeTab === "create" && (
            <CreateSection
              form={createForm}
              setForm={setCreateForm}
              onSubmit={createVo}
              loading={loadingAction === "create_vo" || loadingAction === "update_vo"}
              editingVoId={editingVoId}
              onCancelEdit={cancelEdit}
            />
          )}
          {activeTab === "plan" && (
            <PlanSection
              vo={selectedVo}
              plan={plan}
              setPlan={setPlan}
              headings={headings}
              workTasks={workTasks}
              onAddToPlan={addToPlan}
              loading={loadingAction === "add_to_plan"}
              canAddToPlan={permissions.addToPlan}
            />
          )}
          {activeTab === "history" && (
            <HistoryPrintSection
              vos={vos}
              auditLogs={data?.audit_logs || []}
              selectedVoId={selectedVo?.vo_id || ""}
              onSelect={(voId) => {
                setSelectedVoId(voId);
                setDetailDialogOpen(true);
              }}
              isLoading={isLoading}
              onPrintAll={openPrintPreview}
              printing={false}
              canPrintAll={permissions.generateMonthlyReport}
            />
          )}
        </main>

        {activeTab === "plan" ? <aside className="space-y-4">
          <SelectedVoPanel
            vo={selectedVo}
            documents={selectedDocuments}
            canSendApproval={permissions.submitToClient}
            canEdit={permissions.create}
            loading={loadingAction === "send_approval"}
            editLoading={loadingAction === "recall_for_edit"}
            revisionLoading={loadingAction === "create_revision_from_approved_items"}
            onSendApproval={sendApproval}
            onCreateRevision={createRevisionFromApprovedItems}
            onEdit={editVo}
          />
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-extrabold text-gray-900">หลักการใช้งาน</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
              {isClient ? (
                <>
                  <p>1. ตรวจตารางงานและยอดรวมของแต่ละรายการก่อนตัดสินใจ</p>
                  <p>2. เลือกอนุมัติหรือไม่อนุมัติ พร้อมใส่หมายเหตุแยกเป็นรายการ</p>
                  <p>3. หากอนุมัติแล้ว ทีมงานจะนำไปวางแผนและออกเอกสารต่อ</p>
                </>
              ) : (
                <>
                  <p>1. วิศวกรกรอกหัวข้องานและรายการเพิ่ม-ลดในตาราง</p>
                  <p>2. ส่งลิงก์ให้ลูกค้าเลือกอนุมัติและใส่หมายเหตุแยกเป็นรายการ</p>
                  <p>3. รายการที่ผ่านการอนุมัติจึงนำไปเพิ่มในแผนงานและออกเอกสารต่อ</p>
                  <p>4. tab ประวัติใช้ตรวจทะเบียนและสถานะย้อนหลัง</p>
                </>
              )}
            </div>
          </section>
        </aside> : null}
      </div>

      {detailDialogOpen && selectedVo && activeTab === "history" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailDialogOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="vo-detail-dialog-title" className="flex h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-[1720px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs font-extrabold uppercase text-orange-600">Variation Order</div>
                <h3 id="vo-detail-dialog-title" className="truncate text-lg font-black text-slate-950">รายละเอียด {selectedVo.vo_id}</h3>
              </div>
              <button type="button" onClick={() => setDetailDialogOpen(false)} title="ปิด" aria-label="ปิดรายละเอียด VO" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <XCircle size={20} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
              <SelectedVoPanel
                vo={selectedVo}
                documents={selectedDocuments}
                canSendApproval={permissions.submitToClient}
                canEdit={permissions.create}
                loading={loadingAction === "send_approval"}
                editLoading={loadingAction === "recall_for_edit"}
                revisionLoading={loadingAction === "create_revision_from_approved_items"}
                onSendApproval={sendApproval}
                onCreateRevision={createRevisionFromApprovedItems}
                onEdit={editVo}
                expanded
              />
            </div>
          </div>
        </div>
      ) : null}

      {printDialogOpen && (
        <div className="variation-orders-print-dialog fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto max-w-6xl rounded-2xl bg-white shadow-2xl">
            <div className="variation-orders-print-controls flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Print Preview</h3>
                <p className="text-sm text-gray-500">ตัวอย่างเอกสารทะเบียนงานเพิ่ม-ลดก่อนพิมพ์</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPrintDialogOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  onClick={printVariationOrders}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 font-semibold text-white transition hover:bg-orange-700"
                >
                  <Printer size={17} />
                  พิมพ์เอกสาร
                </button>
              </div>
            </div>
            <VariationOrdersPrintDocument project={project} vos={vos} summary={stats} />
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineSection({
  vos,
  isLoading,
  selectedVoId,
  onSelect,
  onPrintAll,
  printing,
  canPrintAll,
}: {
  vos: Array<VoRecord & { items?: VoItemInput[] }>;
  isLoading: boolean;
  selectedVoId: string;
  onSelect: (voId: string) => void;
  onPrintAll: () => void;
  printing: boolean;
  canPrintAll: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-lg font-extrabold text-gray-900">รายการงานเพิ่ม-ลด</h3>
          <p className="text-sm text-gray-500">ติดตามสถานะตั้งแต่ร่าง อนุมัติ วางบิล จนถึงรับชำระ</p>
        </div>
        <button
          type="button"
          onClick={onPrintAll}
          disabled={!canPrintAll || printing}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {printing ? <Loader2 size={17} className="animate-spin" /> : <Printer size={17} />}
          Print ทั้งหมด
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-gray-50 text-xs font-bold text-gray-500">
            <tr>
              <th className="px-4 py-3">VO No.</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">ชื่องาน</th>
              <th className="px-4 py-3 text-right">มูลค่า</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3 text-right">วันเพิ่ม</th>
              <th className="px-4 py-3">แผนงาน</th>
              <th className="px-4 py-3">วันที่บันทึก</th>
              <th className="w-16 px-4 py-3 text-center">ดู</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vos.map((vo) => {
              const status = asVoStatus(String(vo.status || ""));
              const type = asVoType(String(vo.vo_type || ""));
              const selected = selectedVoId === vo.vo_id;
              return (
                <tr key={vo.vo_id} onClick={() => onSelect(vo.vo_id)} className={`cursor-pointer transition hover:bg-orange-50/40 ${selected ? "bg-orange-50/60" : ""}`}>
                  <td className="px-4 py-3 font-extrabold text-gray-900">{vo.vo_id}</td>
                  <td className="px-4 py-3">{VO_TYPE_LABELS[type]}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{vo.title}</div>
                    <div className="text-xs text-gray-500">{vo.client_name || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{formatMoney(vo.grand_total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={status} /></td>
                  <td className="px-4 py-3 text-right font-bold text-sky-700">{formatMoney(vo.extension_days)}</td>
                  <td className="px-4 py-3">{vo.task_plan_status === "planned" ? "เพิ่มเข้าแผนแล้ว" : status === "approved" ? "รอเพิ่มเข้าแผน" : "-"}</td>
                  <td className="px-4 py-3">{formatThaiDate(String(vo.created_at || "").slice(0, 10))}</td>
                  <td className="px-4 py-3 text-center">
                    <button type="button" title="เปิดรายละเอียด" aria-label={`เปิดรายละเอียด ${vo.vo_id}`} onClick={(event) => { event.stopPropagation(); onSelect(vo.vo_id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-orange-50 hover:text-orange-700">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {vos.length === 0 && !isLoading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายการงานเพิ่ม-ลด</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">กำลังโหลด...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreateSection({
  form,
  setForm,
  onSubmit,
  loading,
  editingVoId,
  onCancelEdit,
}: {
  form: CreateForm;
  setForm: (next: CreateForm) => void;
  onSubmit: () => void;
  loading: boolean;
  editingVoId?: string;
  onCancelEdit?: () => void;
}) {
  const [importPreview, setImportPreview] = useState<VoSpreadsheetParseResult | null>(null);
  const [importSourceName, setImportSourceName] = useState("");
  const [importError, setImportError] = useState("");
  const [importingSpreadsheet, setImportingSpreadsheet] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const itemCalculation = calculationForItems(form.items, form.vo_type);
  const calculatedItems = itemCalculation.items;
  const itemsTotal = itemCalculation.net_change;
  const groupCount = form.items.filter((item) => asVoItemRowType(String(item.row_type || "")) === "group").length;
  const detailCount = form.items.filter((item) => asVoItemRowType(String(item.row_type || "")) === "detail").length;
  useEffect(() => {
    if (!workspaceExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceExpanded]);
  const rowLabels = useMemo(() => form.items.reduce<{
    labels: string[];
    groupNo: number;
    childNo: number;
  }>((state, item) => {
      const rowType = asVoItemRowType(String(item.row_type || ""));
      if (rowType === "group") {
        const groupNo = state.groupNo + 1;
        return { labels: [...state.labels, String(groupNo)], groupNo, childNo: 0 };
      }
      if (rowType === "detail") {
        const childNo = state.childNo + 1;
        return { labels: [...state.labels, `${Math.max(state.groupNo, 1)}.${childNo}`], groupNo: state.groupNo, childNo };
      }
      return { ...state, labels: [...state.labels, ""] };
    }, { labels: [], groupNo: 0, childNo: 0 }).labels, [form.items]);
  const setItems = (items: VoItemInput[], formPatch: Partial<CreateForm> = {}) => {
    const normalizedItems = normalizeEditorItems(items);
    const calculation = calculationForItems(normalizedItems, String(formPatch.vo_type || form.vo_type));
    setForm({ ...form, ...formPatch, vo_type: calculation.vo_type, items: normalizedItems, amount: String(calculation.grand_total) });
  };
  const updateItem = (index: number, patch: Partial<VoItemInput>) => {
    setItems(form.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const addItemRow = (rowType: "group" | "detail" | "note") => {
    setItems([...form.items, {
      row_type: rowType,
      change_type: rowType === "group" ? (form.vo_type === "VO-" ? "deduct" : "add") : undefined,
      description: "",
      unit: rowType === "note" ? "" : rowType === "group" ? "LS" : "",
      quantity: rowType === "note" ? "" : "1",
      material_unit_price: "",
      labor_unit_price: "",
    }]);
  };
  const setDocumentType = (voType: string) => {
    const nextType = asVoType(voType);
    if (nextType === "VO0") {
      setForm({ ...form, vo_type: nextType });
      return;
    }
    setItems(form.items.map((item) => (
      asVoItemRowType(String(item.row_type || "")) === "group"
        ? { ...item, change_type: nextType === "VO-" ? "deduct" : "add" }
        : item
    )), { vo_type: nextType });
  };
  const addItemAfter = (index: number, rowType: "detail" | "note") => {
    const nextGroupIndex = form.items.findIndex((item, itemIndex) => itemIndex > index && asVoItemRowType(String(item.row_type || "")) === "group");
    const insertIndex = nextGroupIndex === -1 ? form.items.length : nextGroupIndex;
    setItems([
      ...form.items.slice(0, insertIndex),
      {
        row_type: rowType,
        description: "",
        unit: rowType === "note" ? "" : "",
        quantity: rowType === "note" ? "" : "1",
        material_unit_price: "",
        labor_unit_price: "",
      },
      ...form.items.slice(insertIndex),
    ]);
  };
  const duplicateItemRow = (index: number) => {
    const source = form.items[index];
    if (!source) return;
    const rowType = asVoItemRowType(String(source.row_type || ""));
    const nextGroupIndex = rowType === "group"
      ? form.items.findIndex((item, itemIndex) => itemIndex > index && asVoItemRowType(String(item.row_type || "")) === "group")
      : -1;
    const blockEnd = rowType === "group" ? (nextGroupIndex === -1 ? form.items.length : nextGroupIndex) : index + 1;
    const duplicatedRows = form.items.slice(index, blockEnd).map((item) => ({ ...item, item_no: undefined, sort_order: undefined }));
    setItems([
      ...form.items.slice(0, blockEnd),
      ...duplicatedRows,
      ...form.items.slice(blockEnd),
    ]);
  };
  const removeItemRow = (index: number) => {
    const source = form.items[index];
    if (!source) return;
    const rowType = asVoItemRowType(String(source.row_type || ""));
    if (rowType !== "group") {
      setItems(form.items.filter((_item, itemIndex) => itemIndex !== index));
      return;
    }
    const nextGroupIndex = form.items.findIndex((item, itemIndex) => itemIndex > index && asVoItemRowType(String(item.row_type || "")) === "group");
    const blockEnd = nextGroupIndex === -1 ? form.items.length : nextGroupIndex;
    setItems([...form.items.slice(0, index), ...form.items.slice(blockEnd)]);
  };
  const showImportPreview = (result: VoSpreadsheetParseResult, sourceName: string) => {
    setImportPreview(result);
    setImportSourceName(sourceName);
    setImportError("");
  };
  const importSpreadsheetFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImportError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 10 MB");
      return;
    }
    setImportingSpreadsheet(true);
    setImportError("");
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true, cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
      if (!worksheet) throw new Error("ไม่พบ Worksheet ในไฟล์ Excel");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null });
      showImportPreview(parseVoSpreadsheetRows(rows), file.name);
    } catch (spreadsheetError) {
      setImportPreview(null);
      setImportError(spreadsheetError instanceof Error ? spreadsheetError.message : "อ่านไฟล์ Excel ไม่สำเร็จ");
    } finally {
      setImportingSpreadsheet(false);
    }
  };
  const previewPastedRows = () => {
    const rows = pasteText
      .split(/\r?\n/)
      .map((row) => row.split("\t"))
      .filter((row) => row.some((cell) => cell.trim()));
    showImportPreview(parseVoSpreadsheetRows(rows, { allowHeaderless: true }), "ข้อมูลที่วางจาก Excel");
  };
  const applyImportedItems = (mode: "replace" | "append") => {
    if (!importPreview || importPreview.errors.length > 0 || importPreview.items.length === 0) return;
    const nextItems = mode === "replace" ? importPreview.items : [...form.items, ...importPreview.items];
    const firstGroup = importPreview.items.find((item) => item.row_type === "group");
    setItems(nextItems, { title: form.title || String(firstGroup?.description || "") });
    setImportPreview(null);
    setImportSourceName("");
    setImportError("");
    setPasteText("");
    setPasteOpen(false);
  };

  return (
    <section className={workspaceExpanded
      ? "fixed inset-0 z-[70] flex min-w-0 flex-col overflow-hidden border-t-4 border-t-orange-600 bg-white shadow-2xl"
      : "min-w-0 overflow-hidden rounded-md border border-gray-200 border-t-4 border-t-orange-600 bg-white shadow-sm"}>
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-600 text-white">
              <FileSpreadsheet size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold text-gray-950">{editingVoId ? `แก้ไข ${editingVoId}` : "ใบงานเพิ่ม-ลดฉบับใหม่"}</h3>
              <p className="text-xs font-semibold text-gray-500">{groupCount} หมวดงาน · {detailCount} รายการย่อย</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWorkspaceExpanded((current) => !current)}
              title={workspaceExpanded ? "ย่อหน้าจอ" : "ขยายพื้นที่ทำงาน"}
              aria-label={workspaceExpanded ? "ย่อพื้นที่ทำงานตาราง" : "ขยายพื้นที่ทำงานตาราง"}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-100"
            >
              {workspaceExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span className="hidden sm:inline">{workspaceExpanded ? "ย่อหน้าจอ" : "ขยายตาราง"}</span>
            </button>
            {editingVoId && onCancelEdit ? (
              <button type="button" onClick={onCancelEdit} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-100">
                <XCircle size={16} />
                ยกเลิกแก้ไข
              </button>
            ) : null}
            <button type="button" onClick={onSubmit} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-orange-600 px-4 text-xs font-extrabold text-white shadow-sm hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingVoId ? "บันทึกการแก้ไข" : "บันทึกใบงาน"}
            </button>
          </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-3 px-4 py-3 xl:grid-cols-[140px_minmax(260px,1.35fr)_minmax(220px,1fr)_110px_150px_180px]">
        <div className="order-1 xl:order-none">
          <Field label="ประเภทงาน">
            <select value={form.vo_type} onChange={(event) => setDocumentType(event.target.value)} className="form-input bg-white">
              <option value="VO+">งานเพิ่ม</option>
              <option value="VO-">งานลด</option>
              <option value="VO0">งานเพิ่ม-ลด (ผสม)</option>
            </select>
          </Field>
        </div>
        <div className="order-3 col-span-2 xl:order-none xl:col-span-1">
          <Field label="ชื่อเอกสาร / เรื่อง">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-input" placeholder="เช่น เปลี่ยนแปลงแบบ, งานโครงสร้าง, งานเพิ่มจากลูกค้า" />
          </Field>
        </div>
        <div className="order-4 col-span-2 xl:order-none xl:col-span-1">
          <Field label="อ้างอิงหลักฐาน">
            <input value={form.source_ref_id} onChange={(event) => setForm({ ...form, source_ref_id: event.target.value })} className="form-input" placeholder="เช่น เลขใบเสนอราคา, ใบเสร็จ, แชท LINE" />
          </Field>
        </div>
        <div className="order-5 xl:order-none">
          <Field label="จำนวนวันเพิ่ม">
            <input value={form.extension_days} onChange={(event) => setForm({ ...form, extension_days: event.target.value })} className="form-input" inputMode="numeric" placeholder="0" />
          </Field>
        </div>
        <div className="order-6 xl:order-none">
          <Field label="กำหนดตอบกลับ (วัน)">
            <input
              type="number"
              min="1"
              max="90"
              value={form.approval_deadline_days}
              onChange={(event) => setForm({ ...form, approval_deadline_days: event.target.value })}
              className="form-input"
              inputMode="numeric"
            />
          </Field>
        </div>
        <div className="order-2 xl:order-none">
          <Field label="สถานะ">
            <div className="grid h-10 grid-cols-2 overflow-hidden rounded-md border border-gray-200 bg-gray-100 p-0.5">
              <button type="button" onClick={() => setForm({ ...form, status: "pending_approval" })} className={`rounded px-2 text-xs font-extrabold ${form.status === "pending_approval" ? "bg-white text-orange-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>รอยืนยัน</button>
              <button type="button" onClick={() => setForm({ ...form, status: "draft" })} className={`rounded px-2 text-xs font-extrabold ${form.status === "draft" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>ฉบับร่าง</button>
            </div>
          </Field>
        </div>
      </div>
      <div className={`border-t border-gray-200 ${workspaceExpanded ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => addItemRow("group")} className="inline-flex h-9 items-center gap-2 rounded-md bg-gray-900 px-3 text-xs font-extrabold text-white hover:bg-black">
              <Plus size={15} /> รายการหลัก
            </button>
            <button type="button" onClick={() => addItemRow("detail")} className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
              <Plus size={15} /> รายละเอียดย่อย
            </button>
            <button type="button" onClick={() => addItemRow("note")} className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
              <Plus size={15} /> หมายเหตุ
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPasteOpen((current) => !current)} className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-extrabold text-gray-700 hover:bg-gray-50">
              <ClipboardPaste size={15} /> วาง Excel
            </button>
            <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-extrabold text-blue-800 hover:bg-blue-100 ${importingSpreadsheet ? "pointer-events-none opacity-60" : ""}`}>
              {importingSpreadsheet ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
              Import
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => {
                  void importSpreadsheetFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <a href="/templates/pcm-vo-import-template.xlsx" download title="ดาวน์โหลด Excel Template" className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100">
              <Download size={15} /> Template
            </a>
          </div>
        </div>
        {pasteOpen ? (
          <div className="mt-3 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="block min-w-0">
              <span className="text-xs font-extrabold text-gray-700">ข้อมูลจาก Excel</span>
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                rows={4}
                className="mt-1 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="วางตารางที่คัดลอกจาก Excel"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setPasteOpen(false); setPasteText(""); }} className="inline-flex min-h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-xs font-extrabold text-gray-700 hover:bg-gray-100">ยกเลิก</button>
              <button type="button" onClick={previewPastedRows} disabled={!pasteText.trim()} className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-40">ตรวจข้อมูล</button>
            </div>
          </div>
        ) : null}
        {importError ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            <XCircle size={16} className="mt-0.5 shrink-0" /> {importError}
          </div>
        ) : null}
        {importPreview ? (
          <div className={`mt-3 rounded-lg border p-4 ${importPreview.errors.length > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
                  <FileSpreadsheet size={17} />
                  <span className="truncate">{importSourceName}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-gray-700">
                  <span>รายการหลัก {importPreview.counts.group}</span>
                  <span>รายการย่อย {importPreview.counts.detail}</span>
                  <span>หมายเหตุ {importPreview.counts.note}</span>
                  <span>ยอดสุทธิ {formatMoney(calculationForItems(importPreview.items).net_change)} บาท</span>
                </div>
                {importPreview.errors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs font-bold text-red-700">
                    {importPreview.errors.slice(0, 6).map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                ) : null}
                {importPreview.warnings.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-800">
                    {importPreview.warnings.slice(0, 6).map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => { setImportPreview(null); setImportSourceName(""); }} className="inline-flex min-h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-xs font-extrabold text-gray-700 hover:bg-gray-100">ยกเลิก</button>
                <button type="button" onClick={() => applyImportedItems("append")} disabled={importPreview.errors.length > 0 || importPreview.items.length === 0} className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-200 bg-white px-4 text-xs font-extrabold text-blue-800 hover:bg-blue-50 disabled:opacity-40">เพิ่มต่อท้าย</button>
                <button type="button" onClick={() => applyImportedItems("replace")} disabled={importPreview.errors.length > 0 || importPreview.items.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-40">
                  <CheckCircle2 size={15} /> ใช้รายการนี้
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className={workspaceExpanded
          ? "min-h-0 flex-1 overflow-auto border-y border-gray-300 bg-white"
          : "max-h-[calc(100vh-330px)] min-h-[280px] overflow-auto border-y border-gray-300 bg-white"}>
          <table className="w-full min-w-[1320px] table-fixed border-collapse text-xs">
            <thead className="sticky top-0 z-30 text-white shadow-sm">
              <tr>
                <th rowSpan={2} className="w-28 border border-slate-700 bg-slate-900 px-2 py-2 text-center">เพิ่ม / ลด</th>
                <th rowSpan={2} className="w-14 border border-slate-700 bg-slate-900 px-2 py-2 text-center">#</th>
                <th rowSpan={2} className="w-[420px] border border-slate-700 bg-slate-900 px-3 py-2 text-left">รายการงาน</th>
                <th rowSpan={2} className="w-20 border border-slate-700 bg-slate-900 px-2 py-2 text-right">ปริมาณ</th>
                <th rowSpan={2} className="w-16 border border-slate-700 bg-slate-900 px-2 py-2 text-left">หน่วย</th>
                <th colSpan={2} className="border border-slate-700 bg-slate-900 px-2 py-2 text-center">ค่าวัสดุ</th>
                <th colSpan={2} className="border border-slate-700 bg-slate-900 px-2 py-2 text-center">ค่าแรง</th>
                <th rowSpan={2} className="w-28 border border-slate-700 bg-slate-900 px-2 py-2 text-right">รวมเป็นเงิน</th>
                <th rowSpan={2} className="w-28 border border-slate-700 bg-slate-900 px-2 py-2 xl:sticky xl:right-0 xl:z-40" aria-label="เครื่องมือ" />
              </tr>
              <tr className="bg-slate-800 text-slate-200">
                <th className="w-24 border border-slate-700 px-2 py-1.5 text-right">หน่วยละ</th>
                <th className="w-24 border border-slate-700 px-2 py-1.5 text-right">รวม</th>
                <th className="w-24 border border-slate-700 px-2 py-1.5 text-right">หน่วยละ</th>
                <th className="w-24 border border-slate-700 px-2 py-1.5 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, index) => {
                const rowType = asVoItemRowType(String(item.row_type || ""));
                const calculated = calculatedItems.find((row) => row.sort_order === index + 1);
                const changeType = calculated?.change_type || asVoItemChangeType(String(item.change_type || item.row_type || ""), asVoType(form.vo_type));
                const isDeduct = changeType === "deduct";
                if (rowType === "group") {
                  return (
                    <tr key={index} className={`${isDeduct ? "bg-red-50" : "bg-blue-50"} font-bold text-slate-900`}>
                      <td className="border border-slate-300 p-1.5">
                        <div className="grid h-8 grid-cols-2 overflow-hidden rounded border border-slate-300 bg-white p-0.5">
                          <button type="button" title="กำหนดเป็นงานเพิ่ม" aria-label={`กำหนดหมวด ${rowLabels[index]} เป็นงานเพิ่ม`} onClick={() => updateItem(index, { change_type: "add" })} className={`rounded text-xs font-black ${!isDeduct ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-blue-50 hover:text-blue-700"}`}>+</button>
                          <button type="button" title="กำหนดเป็นงานลด" aria-label={`กำหนดหมวด ${rowLabels[index]} เป็นงานลด`} onClick={() => updateItem(index, { change_type: "deduct" })} className={`rounded text-xs font-black ${isDeduct ? "bg-red-600 text-white" : "text-slate-400 hover:bg-red-50 hover:text-red-700"}`}>−</button>
                        </div>
                      </td>
                      <td className={`border border-slate-300 px-2 py-2 text-center text-sm font-black ${isDeduct ? "text-red-800" : "text-blue-900"}`}>{rowLabels[index]}</td>
                      <td colSpan={7} className="border-y border-slate-300 p-1">
                        <div className="flex items-center gap-2 px-2">
                          <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-black ${isDeduct ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{isDeduct ? "งานลด" : "งานเพิ่ม"}</span>
                          <input value={String(item.description || "")} onChange={(event) => updateItem(index, { description: event.target.value })} className={`h-10 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm font-extrabold outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset ${isDeduct ? "focus:ring-red-400" : "focus:ring-blue-400"}`} placeholder="ชื่อหมวดงาน เช่น งานหลังคา หรืองานปูกระเบื้อง" />
                        </div>
                      </td>
                      <td className={`border border-slate-300 px-3 py-2 text-right text-sm font-black tabular-nums ${isDeduct ? "bg-red-100/70 text-red-800" : "bg-blue-100/70 text-blue-900"}`}>{isDeduct ? "−" : "+"}{formatMoney(calculated?.amount)}</td>
                      <td className={`border border-slate-300 px-1 text-center xl:sticky xl:right-0 xl:z-10 ${isDeduct ? "bg-red-50" : "bg-blue-50"}`}>
                        <button type="button" title="เพิ่มรายการย่อยในหมวดนี้" aria-label={`เพิ่มรายการย่อยในหมวด ${rowLabels[index]}`} onClick={() => addItemAfter(index, "detail")} className="inline-flex h-8 w-8 items-center justify-center rounded text-blue-700 hover:bg-blue-100"><Plus size={15} /></button>
                        <button type="button" title="ทำสำเนาทั้งหมวด" aria-label={`ทำสำเนาหมวด ${rowLabels[index]}`} onClick={() => duplicateItemRow(index)} className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-blue-700"><Copy size={15} /></button>
                        <button type="button" title="ลบหมวด" aria-label={`ลบหมวด ${rowLabels[index]}`} onClick={() => removeItemRow(index)} disabled={groupCount <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                }

                if (rowType === "note") {
                  return (
                    <tr key={index} className="bg-amber-50 text-amber-950">
                      <td className="border border-amber-200 px-3 py-2 text-[11px] font-extrabold">หมายเหตุ</td>
                      <td className="border border-amber-200 px-2 py-2 text-center text-amber-500">•</td>
                      <td colSpan={7} className="border-y border-amber-200 p-1">
                        <input value={String(item.description || "")} onChange={(event) => updateItem(index, { description: event.target.value })} className="h-9 w-full border-0 bg-transparent px-3 italic outline-none placeholder:text-amber-600/60 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-amber-400" placeholder="เงื่อนไขหรือหมายเหตุประกอบรายการ" />
                      </td>
                      <td className="border border-amber-200 text-center text-amber-400">-</td>
                      <td className="border border-amber-200 bg-amber-50 px-1 text-center xl:sticky xl:right-0 xl:z-10">
                        <button type="button" title="ทำสำเนาแถว" aria-label={`ทำสำเนาแถว ${index + 1}`} onClick={() => duplicateItemRow(index)} className="inline-flex h-8 w-8 items-center justify-center rounded text-amber-700 hover:bg-white"><Copy size={15} /></button>
                        <button type="button" title="ลบแถว" aria-label={`ลบแถว ${index + 1}`} onClick={() => removeItemRow(index)} disabled={form.items.length <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded text-amber-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={index} className="bg-white text-slate-800 hover:bg-slate-50/70">
                    <td className={`border border-slate-200 px-3 py-2 text-center text-[11px] font-black ${isDeduct ? "text-red-600" : "text-blue-700"}`}>{isDeduct ? "− ลด" : "+ เพิ่ม"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-bold text-slate-500">{rowLabels[index]}</td>
                    <td className="border border-slate-200 p-1">
                      <input value={String(item.description || "")} onChange={(event) => updateItem(index, { description: event.target.value })} className="h-9 w-full border-0 bg-transparent px-3 outline-none placeholder:text-slate-400 focus:bg-orange-50/50 focus:ring-2 focus:ring-inset focus:ring-orange-400" placeholder="รายละเอียดงาน วัสดุ หรือบริการ" />
                    </td>
                    {["quantity", "unit", "material_unit_price", "material_amount", "labor_unit_price", "labor_amount", "amount"].map((column) => {
                      const calculatedValue = calculated?.[column as keyof typeof calculated];
                      const isEditable = ["quantity", "unit", "material_unit_price", "labor_unit_price"].includes(column);
                      const value = column === "unit"
                        ? String(item.unit || "")
                        : ["material_amount", "labor_amount", "amount"].includes(column)
                          ? formatMoney(calculatedValue as string | number | undefined)
                          : String(item[column as keyof VoItemInput] || "");
                      return (
                        <td key={column} className={`border border-slate-200 p-1 ${column === "unit" ? "text-left" : "text-right"}`}>
                          {isEditable ? (
                            <input
                              value={value}
                              onChange={(event) => updateItem(index, { [column]: event.target.value })}
                              inputMode={column === "unit" ? undefined : "decimal"}
                              className={`h-9 w-full border-0 bg-transparent px-2 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-orange-400 ${column === "unit" ? "text-left" : "text-right"}`}
                            />
                          ) : <span className={`block px-2 font-bold tabular-nums ${column === "amount" ? (isDeduct ? "text-red-700" : "text-slate-950") : "text-slate-600"}`}>{column === "amount" && isDeduct ? "−" : ""}{value}</span>}
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 bg-white p-1 text-center xl:sticky xl:right-0 xl:z-10">
                      <button type="button" title="ทำสำเนาแถว" aria-label={`ทำสำเนาแถว ${index + 1}`} onClick={() => duplicateItemRow(index)} className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-blue-50 hover:text-blue-700">
                        <Copy size={15} />
                      </button>
                      <button type="button" title="ลบแถว" aria-label={`ลบแถว ${index + 1}`} onClick={() => removeItemRow(index)} disabled={form.items.length <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-white">
                <td colSpan={11} className="border-t border-dashed border-slate-300 px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" onClick={() => addItemRow("detail")} className="inline-flex h-9 items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"><Plus size={15} /> เพิ่มรายการย่อย</button>
                    <button type="button" onClick={() => addItemRow("note")} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-bold text-slate-500 hover:bg-amber-50 hover:text-amber-800"><Plus size={15} /> หมายเหตุ</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className={`${workspaceExpanded ? "shrink-0" : "sticky bottom-0"} z-40 flex flex-col gap-3 border-t border-gray-300 bg-white/95 px-4 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-xs">
          <div><span className="font-bold text-gray-500">รวมงานเพิ่ม</span><span className="ml-2 font-black tabular-nums text-blue-700">+{formatMoney(itemCalculation.increase_total)} บาท</span></div>
          <div><span className="font-bold text-gray-500">รวมงานลด</span><span className="ml-2 font-black tabular-nums text-red-700">−{formatMoney(itemCalculation.decrease_total)} บาท</span></div>
          <div><span className="font-bold text-gray-500">ยอดสุทธิ</span><span className={`ml-2 text-xl font-black tabular-nums ${itemsTotal < 0 ? "text-red-700" : "text-gray-950"}`}>{itemsTotal > 0 ? "+" : itemsTotal < 0 ? "−" : ""}{formatMoney(Math.abs(itemsTotal))} บาท</span></div>
          <div><span className="font-bold text-gray-500">วันเพิ่ม</span><span className="ml-2 font-extrabold tabular-nums text-sky-700">{formatMoney(form.extension_days)} วัน</span></div>
          <div><span className="font-bold text-gray-500">หมวดงาน</span><span className="ml-2 font-extrabold text-gray-800">{groupCount}</span></div>
          <div><span className="font-bold text-gray-500">รายการย่อย</span><span className="ml-2 font-extrabold text-gray-800">{detailCount}</span></div>
        </div>
        <button type="button" onClick={onSubmit} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-orange-600 px-6 text-sm font-extrabold text-white shadow-sm hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
          {editingVoId ? "บันทึกการแก้ไข" : "บันทึกงานเพิ่ม-ลด"}
        </button>
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ApprovalSection({
  vo,
  evidence,
  setEvidence,
  evidenceFile,
  setEvidenceFile,
  onApprove,
  userRole,
  permissions,
  clientDecision,
  setClientDecision,
  onClientApprove,
  onClientReject,
  cancelReason,
  setCancelReason,
  onCancel,
  onExpiryCheck,
  loadingAction,
}: {
  vo?: VoRecord;
  evidence: typeof emptyEvidence;
  setEvidence: (next: typeof emptyEvidence) => void;
  evidenceFile: File | null;
  setEvidenceFile: (file: File | null) => void;
  onApprove: () => void;
  userRole: string;
  permissions: VoPermissions;
  clientDecision: { remarks: string; reject_reason: string };
  setClientDecision: (next: { remarks: string; reject_reason: string }) => void;
  onClientApprove: () => void;
  onClientReject: () => void;
  cancelReason: string;
  setCancelReason: (reason: string) => void;
  onCancel: () => void;
  onExpiryCheck: () => void;
  loadingAction: string;
}) {
  const isClient = userRole === "client";
  if (isClient) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-extrabold text-gray-900">อนุมัติงานเพิ่ม-ลด</h3>
        {!vo ? <EmptyText text="เลือก VO ก่อน" /> : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <Metric label="เลขที่ VO" value={String(vo.vo_id || "-")} />
              <Metric label="มูลค่า" value={`${formatMoney(vo.grand_total)} บาท`} tone="orange" />
              <Metric label="กำหนดตอบ" value={formatThaiDate(vo.approval_deadline)} tone={vo.status === "pending_approval" ? "amber" : "gray"} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
              <div className="font-extrabold text-gray-900">{vo.title || "-"}</div>
              <div className="mt-1 whitespace-pre-wrap">{vo.description || "-"}</div>
            </div>
            <Field label="หมายเหตุถึงทีมงาน (ถ้ามี)">
              <textarea
                value={clientDecision.remarks}
                onChange={(event) => setClientDecision({ ...clientDecision, remarks: event.target.value })}
                rows={3}
                className="form-input resize-none"
              />
            </Field>
            <Field label="เหตุผลกรณีปฏิเสธ">
              <textarea
                value={clientDecision.reject_reason}
                onChange={(event) => setClientDecision({ ...clientDecision, reject_reason: event.target.value })}
                rows={3}
                className="form-input resize-none"
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={onClientReject}
                disabled={loadingAction === "client_decision" || vo.status !== "pending_approval" || !clientDecision.reject_reason.trim()}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAction === "client_decision" ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
                ปฏิเสธ
              </button>
              <button
                type="button"
                onClick={onClientApprove}
                disabled={loadingAction === "client_decision" || vo.status !== "pending_approval"}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAction === "client_decision" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                ยืนยันอนุมัติ
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-extrabold text-gray-900">บันทึกหลักฐานจากลูกค้า</h3>
      {!vo ? <EmptyText text="เลือก VO ก่อน" /> : (
        <>
          <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
            ใช้หน้านี้เฉพาะกรณีต้องเติมหลักฐานให้ VO เก่า ส่วน VO ใหม่ให้แนบรูปแชทตอนสร้าง ระบบจะบันทึกอนุมัติจากหลักฐานให้ทันที
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="ผู้ยืนยันฝั่งลูกค้า">
              <input value={evidence.client_approved_by} onChange={(event) => setEvidence({ ...evidence, client_approved_by: event.target.value })} className="form-input" />
            </Field>
            <Field label="วันที่ลูกค้าแจ้งจริง">
              <input type="date" value={evidence.client_approved_date} onChange={(event) => setEvidence({ ...evidence, client_approved_date: event.target.value })} className="form-input" />
            </Field>
            <Field label="ช่องทาง">
              <select value={evidence.channel} onChange={(event) => setEvidence({ ...evidence, channel: event.target.value })} className="form-input bg-white">
                <option value="line">LINE</option>
                <option value="email">Email</option>
                <option value="phone_call">โทรศัพท์</option>
                <option value="in_person">คุยหน้างาน</option>
                <option value="signed_doc">เอกสารลงนาม</option>
              </select>
            </Field>
            <Field label="ประเภทหลักฐาน">
              <select value={evidence.evidence_type} onChange={(event) => setEvidence({ ...evidence, evidence_type: event.target.value })} className="form-input bg-white">
                <option value="line_screenshot">ภาพแชท LINE</option>
                <option value="email_screenshot">ภาพอีเมล</option>
                <option value="signed_doc">เอกสารลงนาม</option>
                <option value="meeting_minutes">บันทึกประชุม</option>
                <option value="verbal_confirmed">ยืนยันด้วยวาจา</option>
              </select>
            </Field>
            <Field label="ชื่อไฟล์หลักฐาน">
              <input value={evidence.evidence_filename} onChange={(event) => setEvidence({ ...evidence, evidence_filename: event.target.value })} className="form-input" />
            </Field>
            <Field label="แนบไฟล์หลักฐาน">
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-gray-700">
                  <Paperclip size={18} className="text-orange-600" />
                  <span>{evidenceFile ? evidenceFile.name : "เลือกไฟล์ภาพ/PDF หลักฐาน"}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setEvidenceFile(file);
                      if (file && !evidence.evidence_filename) setEvidence({ ...evidence, evidence_filename: file.name });
                    }}
                  />
                </label>
              </div>
            </Field>
            <Field label="คำอธิบายหลักฐาน">
              <textarea value={evidence.evidence_description} onChange={(event) => setEvidence({ ...evidence, evidence_description: event.target.value })} rows={4} className="form-input resize-none" />
            </Field>
          </div>
          <div className="mt-5 text-right">
            <button type="button" onClick={onApprove} disabled={loadingAction === "approve_on_behalf" || vo.status !== "pending_approval" || !permissions.approveOnBehalf} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loadingAction === "approve_on_behalf" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
              บันทึกอนุมัติแทนลูกค้า
            </button>
          </div>
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-extrabold text-gray-900">จัดการรายการที่ค้าง</div>
                <div className="text-sm text-gray-500">ใช้เมื่อ VO หมดอายุ หรือจำเป็นต้องยกเลิกก่อนวางบิล</div>
              </div>
              <button type="button" onClick={onExpiryCheck} disabled={loadingAction === "expiry_check" || !permissions.expiryCheck} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-wait disabled:opacity-60">
                {loadingAction === "expiry_check" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                ตรวจ VO หมดอายุ
              </button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="เหตุผลการยกเลิก"
                className="form-input"
              />
              <button
                type="button"
                onClick={onCancel}
                disabled={loadingAction === "cancel_vo" || !permissions.cancel || !cancelReason.trim() || !["draft", "pending_approval", "approved", "rejected", "expired"].includes(String(vo.status || ""))}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAction === "cancel_vo" ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
                ยกเลิก VO
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PlanSection({
  vo,
  plan,
  setPlan,
  headings,
  workTasks,
  onAddToPlan,
  loading,
  canAddToPlan,
}: {
  vo?: VoRecord;
  plan: typeof emptyPlan;
  setPlan: (next: typeof emptyPlan) => void;
  headings: TaskRecord[];
  workTasks: TaskRecord[];
  onAddToPlan: () => void;
  loading: boolean;
  canAddToPlan: boolean;
}) {
  const voType = asVoType(String(vo?.vo_type || ""));
  const canPlanSelectedVo = canAddVoToPlan(vo);
  const hasPlanTarget = voType === "VO+" ? headings.length > 0 : workTasks.length > 0;
  const canSubmitPlan = canAddToPlan && canPlanSelectedVo && hasPlanTarget;
  const headingMap = useMemo(() => new Map(headings.map((task) => [task.task_id, task])), [headings]);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-extrabold text-gray-900">เพิ่มเข้าแผนงาน</h3>
      {!vo ? <EmptyText text="เลือก VO ก่อน" /> : (
        <div className="mt-4 space-y-4">
          {!canPlanSelectedVo ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              เลือก VO ที่อนุมัติแล้วก่อน จึงจะเพิ่มเข้าแผนงานได้
            </div>
          ) : null}
          {canPlanSelectedVo && !hasPlanTarget ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {voType === "VO+" ? "ยังไม่มีหัวข้อในแผนงาน กรุณาสร้างหัวข้อในหน้าแผนงานก่อน" : "ยังไม่มี task ในแผนงานให้เลือก"}
            </div>
          ) : null}
          {voType === "VO+" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="หัวข้อหลัก">
                <select value={plan.parent_task_id} onChange={(event) => setPlan({ ...plan, parent_task_id: event.target.value })} className="form-input bg-white">
                  <option value="">เลือกหัวข้อแม่</option>
                  {headings.map((task) => <option key={task.task_id} value={task.task_id}>{getHeadingLevelLabel(task, headingMap)} - {task.name}</option>)}
                </select>
              </Field>
              <Field label="ชื่องานในแผน">
                <input value={plan.name || String(vo.title || "")} onChange={(event) => setPlan({ ...plan, name: event.target.value })} className="form-input" />
              </Field>
              <Field label="ผู้รับผิดชอบ">
                <input value={plan.assignee} onChange={(event) => setPlan({ ...plan, assignee: event.target.value })} className="form-input" />
              </Field>
              <Field label="หมวดงาน">
                <input value={plan.category} onChange={(event) => setPlan({ ...plan, category: event.target.value })} className="form-input" />
              </Field>
              <Field label="วันเริ่ม">
                <input type="date" value={plan.start} onChange={(event) => setPlan({ ...plan, start: event.target.value })} className="form-input" />
              </Field>
              <Field label="วันจบ">
                <input type="date" value={plan.end} onChange={(event) => setPlan({ ...plan, end: event.target.value })} className="form-input" />
              </Field>
              <Field label="หมายเหตุ">
                <textarea value={plan.notes} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} rows={3} className="form-input resize-none" />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label={voType === "VO-" ? "เลือก task ที่ลดงาน" : "เลือก task ที่สับเปลี่ยน"}>
                <select value={plan.task_id} onChange={(event) => setPlan({ ...plan, task_id: event.target.value })} className="form-input bg-white">
                  <option value="">เลือก task</option>
                  {workTasks.map((task) => <option key={task.task_id} value={task.task_id}>{task.name}</option>)}
                </select>
              </Field>
              <Field label="หมายเหตุเพิ่มเติม">
                <textarea value={plan.notes} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} rows={3} className="form-input resize-none" />
              </Field>
            </div>
          )}
          <div className="text-right">
            <button type="button" onClick={onAddToPlan} disabled={loading || !canSubmitPlan} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Workflow size={17} />}
              เพิ่มเข้าแผนงาน
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FinanceSection({
  vo,
  invoice,
  setInvoice,
  payment,
  setPayment,
  paymentEvidenceFile,
  setPaymentEvidenceFile,
  onCreateInvoice,
  onRecordPayment,
  onOverdueCheck,
  payments,
  ledger,
  loadingAction,
  canCreateInvoice,
  canRecordPayment,
  canRunOverdueCheck,
}: {
  vo?: VoRecord;
  invoice: { invoice_no: string; invoice_date: string; due_days: string };
  setInvoice: (next: { invoice_no: string; invoice_date: string; due_days: string }) => void;
  payment: { receipt_no: string; paid_date: string; amount_paid: string; payment_method: string; payment_ref: string; evidence_file: string };
  setPayment: (next: { receipt_no: string; paid_date: string; amount_paid: string; payment_method: string; payment_ref: string; evidence_file: string }) => void;
  paymentEvidenceFile: File | null;
  setPaymentEvidenceFile: (file: File | null) => void;
  onCreateInvoice: () => void;
  onRecordPayment: () => void;
  onOverdueCheck: () => void;
  payments: Array<Record<string, string | number | undefined>>;
  ledger: Array<Record<string, string | number | undefined>>;
  loadingAction: string;
  canCreateInvoice: boolean;
  canRecordPayment: boolean;
  canRunOverdueCheck: boolean;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-gray-900">วางบิล/รับชำระ</h3>
          <p className="text-sm text-gray-500">ติดตาม invoice, receipt, ยอดคงเหลือ และรายการบัญชีของ VO ที่เลือก</p>
        </div>
        <button type="button" onClick={onOverdueCheck} disabled={loadingAction === "overdue_check" || !canRunOverdueCheck} className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-wait disabled:opacity-60">
          {loadingAction === "overdue_check" ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
          ตรวจ Overdue
        </button>
      </div>
      {!vo ? <EmptyText text="เลือก VO ก่อน" /> : (
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-4">
            <Metric label="Invoice" value={String(vo.invoice_no || "-")} />
            <Metric label="Due Date" value={String(vo.due_date || "-")} tone={vo.status === "overdue" ? "red" : "gray"} />
            <Metric label="ชำระแล้ว" value={`${formatMoney(vo.amount_paid)} บาท`} tone="green" />
            <Metric label="คงเหลือ" value={`${formatMoney(vo.balance)} บาท`} tone={numberValue(vo.balance) > 0 ? "orange" : "green"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 font-extrabold text-gray-900">ออกใบแจ้งหนี้</div>
            <div className="space-y-3">
              <Field label="เลข Invoice">
                <input value={invoice.invoice_no} onChange={(event) => setInvoice({ ...invoice, invoice_no: event.target.value })} placeholder={`INV-${vo.vo_id}`} className="form-input" />
              </Field>
              <Field label="วันที่วางบิล">
                <input type="date" value={invoice.invoice_date} onChange={(event) => setInvoice({ ...invoice, invoice_date: event.target.value })} className="form-input" />
              </Field>
              <button type="button" onClick={onCreateInvoice} disabled={loadingAction === "create_invoice" || vo.status !== "approved" || !canCreateInvoice} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                {loadingAction === "create_invoice" ? <Loader2 size={17} className="animate-spin" /> : <Banknote size={17} />}
                ออก Invoice
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 font-extrabold text-gray-900">บันทึกชำระเงิน</div>
            <div className="space-y-3">
              <Field label="จำนวนเงินที่ได้รับ">
                <input value={payment.amount_paid} onChange={(event) => setPayment({ ...payment, amount_paid: event.target.value })} className="form-input" inputMode="decimal" />
              </Field>
              <Field label="วันที่ชำระ">
                <input type="date" value={payment.paid_date} onChange={(event) => setPayment({ ...payment, paid_date: event.target.value })} className="form-input" />
              </Field>
              <Field label="แนบหลักฐานการชำระเงิน">
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-gray-700">
                    <Paperclip size={18} className="text-orange-600" />
                    <span className="min-w-0 flex-1 truncate">{paymentEvidenceFile ? paymentEvidenceFile.name : "เลือกไฟล์สลิป/หลักฐาน"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setPaymentEvidenceFile(file);
                        setPayment({
                          ...payment,
                          payment_ref: file?.name || "",
                          evidence_file: file?.name || "",
                        });
                      }}
                    />
                  </label>
                  {paymentEvidenceFile && (
                    <button type="button" onClick={() => {
                      setPaymentEvidenceFile(null);
                      setPayment({ ...payment, payment_ref: "", evidence_file: "" });
                    }} className="mt-3 text-xs font-bold text-red-600">
                      ลบไฟล์แนบ
                    </button>
                  )}
                </div>
              </Field>
              <button type="button" onClick={onRecordPayment} disabled={loadingAction === "record_payment" || !canRecordPayment || !["billed", "partial_payment", "overdue"].includes(String(vo.status || ""))} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
                {loadingAction === "record_payment" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                บันทึกชำระ
              </button>
            </div>
          </div>
        </div>
          <HistoryTable
            title="ประวัติรับชำระ"
            rows={payments}
            columns={[
              ["receipt_no", "Receipt"],
              ["paid_date", "วันที่"],
              ["amount_paid", "ยอดรับ"],
              ["payment_method", "วิธี"],
              ["payment_ref", "อ้างอิง"],
            ]}
          />
          <HistoryTable
            title="Finance Ledger"
            rows={ledger}
            columns={[
              ["entry_type", "ประเภท"],
              ["ref_no", "เลขอ้างอิง"],
              ["entry_date", "วันที่"],
              ["debit", "Debit"],
              ["credit", "Credit"],
              ["balance", "Balance"],
            ]}
          />
        </div>
      )}
    </section>
  );
}

function HistoryPrintSection({
  vos,
  auditLogs,
  selectedVoId,
  onSelect,
  isLoading,
  onPrintAll,
  printing,
  canPrintAll,
}: {
  vos: Array<VoRecord & { items?: VoItemInput[] }>;
  auditLogs: Array<Record<string, string | number | undefined>>;
  selectedVoId: string;
  onSelect: (voId: string) => void;
  isLoading: boolean;
  onPrintAll: () => void;
  printing: boolean;
  canPrintAll: boolean;
}) {
  return (
    <section className="space-y-5">
      <PipelineSection
        vos={vos}
        isLoading={isLoading}
        selectedVoId={selectedVoId}
        onSelect={onSelect}
        onPrintAll={onPrintAll}
        printing={printing}
        canPrintAll={canPrintAll}
      />

      <HistoryTable
        title="Audit Trail"
        rows={auditLogs}
        columns={[
          ["timestamp", "เวลา"],
          ["actor_name", "ผู้ใช้"],
          ["actor_role", "Role"],
          ["action", "Action"],
          ["target_id", "VO/Target"],
          ["summary", "รายละเอียด"],
        ]}
      />
    </section>
  );
}

function VariationOrdersPrintDocument({
  project,
  vos,
  summary,
}: {
  project: Project;
  vos: Array<VoRecord & { items?: VoItemInput[] }>;
  summary: {
    count: number;
    pending: number;
    approved: number;
    addAmount: number;
    deductAmount: number;
    netAmount: number;
    extensionDays: number;
  };
}) {
  const printedAt = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date());
  const financialVos = vos.filter(isVoFinanciallyActive);
  const paid = financialVos.reduce((sum, vo) => sum + numberValue(vo.amount_paid), 0);
  const outstanding = financialVos.reduce((sum, vo) => sum + numberValue(vo.balance), 0);

  return (
    <div className="variation-orders-print-document bg-white p-8 text-gray-950">
      <div className="mb-6 flex items-center gap-5 border-b-2 border-gray-950 pb-5">
        <Image src="/logo.png" alt="Pichayamongkol Construction" width={180} height={56} className="h-14 w-auto object-contain" />
        <div className="min-w-0">
          <h1 className="text-2xl font-black leading-tight text-gray-950">Variation Order Register Report</h1>
          <p className="mt-1 text-sm text-gray-600">Pichayamongkol Construction Co., Ltd.</p>
          <p className="text-sm text-gray-600">รายงานทะเบียนงานเพิ่ม-ลด | พิมพ์วันที่ {printedAt}</p>
        </div>
        <div className="ml-auto rounded-xl border border-gray-200 px-4 py-3 text-right">
          <div className="text-xs font-semibold text-gray-500">โครงการ</div>
          <div className="font-bold text-gray-950">{project.name || project.project_id}</div>
          <div className="text-xs font-semibold text-gray-500">{project.client || "-"}</div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <VoPrintMetric label="VO ทั้งหมด" value={`${summary.count} รายการ`} />
        <VoPrintMetric label="งานเพิ่มรวม" value={`${formatMoney(summary.addAmount)} บาท`} />
        <VoPrintMetric label="งานลดรวม" value={`${formatMoney(summary.deductAmount)} บาท`} />
        <VoPrintMetric label="สุทธิ" value={`${formatMoney(summary.netAmount)} บาท`} />
        <VoPrintMetric label="วันเพิ่มรวม" value={`${formatMoney(summary.extensionDays)} วัน`} />
        <VoPrintMetric label="รออนุมัติ" value={`${summary.pending} รายการ`} />
        <VoPrintMetric label="อนุมัติแล้ว" value={`${summary.approved} รายการ`} />
        <VoPrintMetric label="คงเหลือรับชำระ" value={`${formatMoney(outstanding)} บาท`} />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="font-bold text-gray-500">เลขที่โครงการ</div>
          <div className="mt-1 font-extrabold text-gray-950">{project.project_id}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="font-bold text-gray-500">เลขที่สัญญา</div>
          <div className="mt-1 font-extrabold text-gray-950">{project.contract_no || "-"}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="font-bold text-gray-500">รับชำระแล้ว</div>
          <div className="mt-1 font-extrabold text-gray-950">{formatMoney(paid)} บาท</div>
        </div>
      </div>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-gray-950 text-white">
            <th className="w-10 border border-gray-300 px-2 py-2 text-left">#</th>
            <th className="w-40 border border-gray-300 px-2 py-2 text-left">VO No.</th>
            <th className="w-24 border border-gray-300 px-2 py-2 text-left">ประเภท</th>
            <th className="border border-gray-300 px-2 py-2 text-left">ชื่องาน / รายละเอียด</th>
            <th className="w-28 border border-gray-300 px-2 py-2 text-right">มูลค่าเสนอ</th>
            <th className="w-28 border border-gray-300 px-2 py-2 text-left">สถานะ</th>
            <th className="w-24 border border-gray-300 px-2 py-2 text-right">วันเพิ่ม</th>
            <th className="w-32 border border-gray-300 px-2 py-2 text-left">แผนงาน</th>
            <th className="w-28 border border-gray-300 px-2 py-2 text-left">วันที่บันทึก</th>
          </tr>
        </thead>
        <tbody>
          {vos.length === 0 ? (
            <tr>
              <td colSpan={9} className="border border-gray-300 px-3 py-8 text-center text-gray-500">ยังไม่มีรายการงานเพิ่ม-ลด</td>
            </tr>
          ) : (
            vos.map((vo, index) => {
              const type = asVoType(String(vo.vo_type || ""));
              const status = asVoStatus(String(vo.status || ""));
              const createdAt = String(vo.created_at || "").slice(0, 10);

              return (
                <tr key={vo.vo_id} className="break-inside-avoid">
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{index + 1}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top">
                    <div className="font-bold text-gray-950">{vo.vo_id}</div>
                    <div className="text-gray-500">{String(vo.source_ref_id || "-")}</div>
                  </td>
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{VO_TYPE_LABELS[type]}</td>
                  <td className="whitespace-pre-line border border-gray-300 px-2 py-2 align-top">
                    <div className="font-bold text-gray-950">{vo.title || "-"}</div>
                    {vo.description ? <div className="mt-1 text-gray-600">{vo.description}</div> : null}
                    {vo.customer_approved_by ? <div className="mt-1 text-gray-500">ผู้อนุมัติ: {vo.customer_approved_by}</div> : null}
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-right align-top font-bold">{formatMoney(vo.grand_total)}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top font-bold">{VO_STATUS_LABELS[status]}</td>
                  <td className="border border-gray-300 px-2 py-2 text-right align-top font-bold">{formatMoney(vo.extension_days)}</td>
                  <td className="border border-gray-300 px-2 py-2 align-top">
                    {vo.task_plan_status === "planned" ? "เพิ่มเข้าแผนแล้ว" : "ยังไม่เพิ่มเข้าแผน"}
                  </td>
                  <td className="border border-gray-300 px-2 py-2 align-top">{formatThaiDate(createdAt)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div className="mt-8 grid grid-cols-3 gap-8 text-center text-xs text-gray-600">
        <div>
          <div className="mb-8 border-b border-gray-400" />
          ผู้จัดทำ
        </div>
        <div>
          <div className="mb-8 border-b border-gray-400" />
          Project Manager
        </div>
        <div>
          <div className="mb-8 border-b border-gray-400" />
          ผู้อนุมัติ
        </div>
      </div>
    </div>
  );
}

function VoPrintMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-base font-black text-gray-950">{value}</div>
      <div className="text-[10px] font-semibold text-gray-500">{label}</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Bar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  const width = Math.max(2, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[11px] font-bold text-gray-400">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-md bg-gray-100">
        <div className={`h-full rounded-md ${className}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-24 text-right text-xs font-bold text-gray-600">{formatMoney(value)}</span>
    </div>
  );
}

function SelectedVoPanel({
  vo,
  documents,
  canSendApproval,
  canEdit,
  loading,
  editLoading,
  revisionLoading,
  onSendApproval,
  onCreateRevision,
  onEdit,
  expanded = false,
}: {
  vo?: VoRecord & { items?: VoItemInput[] };
  documents: Array<Record<string, string | number | undefined>>;
  canSendApproval: boolean;
  canEdit: boolean;
  loading: boolean;
  editLoading: boolean;
  revisionLoading: boolean;
  onSendApproval: () => void;
  onCreateRevision: () => void;
  onEdit: (vo: VoRecord & { items?: VoItemInput[] }) => void;
  expanded?: boolean;
}) {
  if (!vo) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <EmptyText text="ยังไม่ได้เลือก VO" />
      </section>
    );
  }
  const type = asVoType(String(vo.vo_type || ""));
  const status = asVoStatus(String(vo.status || ""));
  const rejectionReason = rejectionReasonFor(vo);
  const voItems = Array.isArray(vo.items) ? vo.items : [];
  const itemDecisions = customerItemDecisionsFor(vo);
  const approvedDecisions = itemDecisions.filter((item) => item.decision === "approved");
  const rejectedDecisions = itemDecisions.filter((item) => item.decision === "rejected");
  const approvedAmount = approvedDecisions.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const customerApprovalNote = String(vo.customer_approval_note || "").trim();
  const canEditVo = canEdit && ["draft", "pending_approval", "rejected", "expired"].includes(status);
  const requiresRecall = status === "pending_approval" && Boolean(vo.approval_token || vo.sent_to_customer_at);
  const canCreateRevision = canEdit && status === "rejected" && approvedDecisions.length > 0;
  return (
    <section className={expanded ? "bg-white" : "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase text-orange-600">ข้อมูลใบงาน</div>
          <h3 className="mt-1 text-xl font-black text-gray-950">{vo.title || vo.vo_id}</h3>
          <div className="mt-1 text-xs font-bold text-gray-500">{vo.vo_id}</div>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className={`mt-5 gap-x-8 gap-y-3 text-sm ${expanded ? "grid sm:grid-cols-2" : "space-y-3"}`}>
        <InfoRow label="ประเภท" value={VO_TYPE_LABELS[type]} />
        <InfoRow label="ชื่องาน" value={String(vo.title || "-")} />
        <InfoRow
          label={type === "VO0" ? "ส่วนต่างสุทธิ" : "มูลค่า"}
          value={`${type === "VO0" && voFinancialEffect(vo) > 0 ? "+" : ""}${formatMoney(voFinancialEffect(vo))} บาท`}
        />
        <InfoRow label="จำนวนวันเพิ่ม" value={`${formatMoney(vo.extension_days)} วัน`} />
        <InfoRow label="อ้างอิงเอกสาร" value={String(vo.source_ref_id || "-")} />
        <InfoRow label="ส่งลูกค้า" value={vo.sent_to_customer_at ? formatThaiDate(String(vo.sent_to_customer_at).slice(0, 10)) : "-"} />
        <InfoRow label="แผนงาน" value={vo.task_plan_status === "planned" ? "เพิ่มเข้าแผนแล้ว" : "ยังไม่เพิ่มเข้าแผน"} />
        {status === "rejected" ? <InfoRow label="เหตุผลที่ลูกค้าไม่อนุมัติ" value={rejectionReason || String(vo.description || "-")} /> : null}
      </div>
      {voItems.length > 0 ? (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-extrabold text-gray-900">รายการใน VO</div>
              <div className="mt-0.5 text-xs font-semibold text-gray-500">แสดงหมวดงาน รายการย่อย ราคา และผลพิจารณาในตารางเดียว</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="text-gray-500">{voItems.length} แถว</span>
              {itemDecisions.length > 0 ? (
                <>
                  <span className="bg-emerald-50 px-2 py-1 text-emerald-700">อนุมัติ {approvedDecisions.length}</span>
                  <span className="bg-red-50 px-2 py-1 text-red-700">ไม่อนุมัติ {rejectedDecisions.length}</span>
                  <span className="bg-blue-50 px-2 py-1 text-blue-700">ยอดอนุมัติ {formatMoney(approvedAmount)} บาท</span>
                </>
              ) : null}
            </div>
          </div>
          <VoItemsReadOnlyTable items={voItems} decisions={itemDecisions} defaultVoType={type} expanded={expanded} />
        </div>
      ) : null}
      {itemDecisions.length > 0 ? (
        <div className="mt-4 border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-black uppercase text-slate-500">หมายเหตุรวมจากลูกค้า</div>
          <div className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">
            {customerApprovalNote || "ไม่มีหมายเหตุเพิ่มเติม"}
          </div>
        </div>
      ) : null}
      {status === "rejected" ? (
        <div className="mt-5 border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-black text-slate-950">งานที่ OE ต้องทำต่อ</div>
          <div className="mt-3 grid gap-3 text-sm font-semibold leading-6 text-slate-700 md:grid-cols-3">
            <div className="flex items-start gap-2"><span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-black text-white">1</span><span>ตรวจหมายเหตุของ {rejectedDecisions.length} รายการที่ไม่อนุมัติ</span></div>
            <div className="flex items-start gap-2"><span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-black text-white">2</span><span>{canCreateRevision ? "สร้างฉบับแก้ไขจากรายการที่ลูกค้าอนุมัติ แล้วปรับรายละเอียดตามข้อสังเกต" : "แก้ไขรายการตามข้อสังเกตและบันทึกกลับเป็นฉบับร่าง"}</span></div>
            <div className="flex items-start gap-2"><span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-black text-white">3</span><span>ตรวจยอดและเอกสาร ก่อนส่ง LINE ฉบับใหม่ให้ลูกค้ายืนยัน</span></div>
          </div>
        </div>
      ) : null}
      {requiresRecall ? (
        <div className="mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900">
          ใบงานนี้ส่งให้ลูกค้าแล้ว หากต้องแก้ไข ระบบจะยกเลิกลิงก์เดิมและเปลี่ยนใบงานกลับเป็นฉบับร่าง หลังบันทึกต้องส่ง LINE ฉบับใหม่
        </div>
      ) : null}
      <div className={`mt-5 gap-2 border-t border-gray-100 pt-4 ${expanded ? "grid sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}`}>
        {status === "rejected" ? (
          <button
            type="button"
            onClick={onCreateRevision}
            disabled={revisionLoading || !canCreateRevision}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revisionLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            สร้างฉบับแก้ไขจากรายการที่อนุมัติ
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onEdit(vo)}
          disabled={!canEditVo || editLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-extrabold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {editLoading ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
          {editLoading ? "กำลังเรียกกลับ..." : requiresRecall ? "เรียกกลับมาแก้ไข" : "แก้ไขรายการนี้"}
        </button>
        <button
          type="button"
          onClick={onSendApproval}
          disabled={loading || !canSendApproval || !["draft", "pending_approval"].includes(String(vo.status || ""))}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          ส่ง LINE ให้ลูกค้าอนุมัติ
        </button>
        {vo.approval_url ? (
          <a href={String(vo.approval_url)} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-50">
            <ExternalLink size={15} />
            เปิดลิงก์อนุมัติ
          </a>
        ) : null}
      </div>
      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="text-sm font-extrabold text-gray-900">เอกสาร</div>
        <div className={`mt-3 gap-2 ${expanded ? "grid sm:grid-cols-2" : "space-y-2"}`}>
          {documents.map((document) => (
            <a
              key={String(document.document_id)}
              href={String(document.pdf_url || "#")}
              target="_blank"
              rel="noreferrer"
              className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm ${document.pdf_url ? "bg-white text-gray-700 hover:border-orange-200 hover:text-orange-700" : "bg-gray-50 text-gray-400"}`}
            >
              <span className="min-w-0 truncate font-bold">{document.title || document.document_type || "Document"}</span>
              {document.pdf_url ? <ExternalLink size={15} /> : <span className="text-xs">HTML only</span>}
            </a>
          ))}
          {documents.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-xs font-semibold text-gray-400">ยังไม่มีเอกสาร</div>}
        </div>
      </div>
    </section>
  );
}

function VoItemsReadOnlyTable({
  items,
  decisions,
  defaultVoType,
  expanded = false,
}: {
  items: VoItemInput[];
  decisions: CustomerItemDecision[];
  defaultVoType: ReturnType<typeof asVoType>;
  expanded?: boolean;
}) {
  const hasDecisions = decisions.length > 0;
  const hasGroups = items.some((item) => asVoItemRowType(String(item.row_type || "")) === "group");

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-300">
      <div className={expanded ? "overflow-x-auto" : "max-h-[420px] overflow-auto"}>
        <table className={`w-full border-collapse text-xs ${hasDecisions ? (expanded ? "min-w-[980px]" : "min-w-[1040px]") : (expanded ? "min-w-[920px]" : "min-w-[980px]")}`}>
          <thead className="sticky top-0 z-20 bg-slate-950 text-white">
            <tr>
              <th rowSpan={2} className="w-24 border border-slate-700 px-2 py-2.5 text-left">ประเภท</th>
              <th rowSpan={2} className="w-14 border border-slate-700 px-2 py-2.5 text-center">#</th>
              <th rowSpan={2} className="min-w-64 border border-slate-700 px-3 py-2.5 text-left">รายการงาน</th>
              <th rowSpan={2} className="w-20 border border-slate-700 px-2 py-2.5 text-right">ปริมาณ</th>
              <th rowSpan={2} className="w-20 border border-slate-700 px-2 py-2.5 text-left">หน่วย</th>
              <th colSpan={2} className="border border-slate-700 px-2 py-2 text-center">ค่าวัสดุ</th>
              <th colSpan={2} className="border border-slate-700 px-2 py-2 text-center">ค่าแรง</th>
              <th rowSpan={2} className="w-28 border border-slate-700 px-2 py-2.5 text-right">รวมเป็นเงิน</th>
              {hasDecisions ? <th rowSpan={2} className="w-24 border border-slate-700 px-2 py-2.5 text-center">ผลพิจารณา</th> : null}
            </tr>
            <tr className="text-slate-300">
              <th className="w-24 border border-slate-700 px-2 py-2 text-right">หน่วยละ</th>
              <th className="w-24 border border-slate-700 px-2 py-2 text-right">รวม</th>
              <th className="w-24 border border-slate-700 px-2 py-2 text-right">หน่วยละ</th>
              <th className="w-24 border border-slate-700 px-2 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const rowType = asVoItemRowType(String(item.row_type || ""));
              const isGroup = rowType === "group";
              const isNote = rowType === "note";
              const isDeduct = resolveVoItemChangeType(item, items, defaultVoType) === "deduct";
              const precedingRows = items.slice(0, index + 1);
              const currentGroupNo = precedingRows.filter((row) => asVoItemRowType(String(row.row_type || "")) === "group").length;
              const lastGroupIndex = precedingRows.map((row) => asVoItemRowType(String(row.row_type || ""))).lastIndexOf("group");
              const currentDetailNo = precedingRows.slice(lastGroupIndex + 1)
                .filter((row) => asVoItemRowType(String(row.row_type || "")) === "detail").length;

              const displayNo = isNote
                ? "•"
                : isGroup
                  ? currentGroupNo
                  : hasGroups && currentGroupNo > 0
                    ? `${currentGroupNo}.${currentDetailNo}`
                    : item.item_no || index + 1;
              const quantity = numberValue(item.quantity);
              const splitCostFields = [item.material_unit_price, item.material_amount, item.labor_unit_price, item.labor_amount]
                .some((value) => String(value ?? "").trim() !== "");
              const materialUnit = numberValue(item.material_unit_price);
              const laborUnit = splitCostFields ? numberValue(item.labor_unit_price) : numberValue(item.unit_price);
              const materialAmount = String(item.material_amount ?? "").trim() !== ""
                ? numberValue(item.material_amount)
                : quantity * materialUnit;
              const laborAmount = String(item.labor_amount ?? "").trim() !== ""
                ? numberValue(item.labor_amount)
                : quantity * laborUnit;
              const calculatedAmount = materialAmount + laborAmount || quantity * numberValue(item.unit_price);
              const rowAmount = String(item.amount ?? "").trim() !== "" ? numberValue(item.amount) : calculatedAmount;
              const signedRowAmount = isDeduct ? -Math.abs(rowAmount) : Math.abs(rowAmount);
              const itemKey = `${String(item.item_no || index + 1)}:${String(item.description || "").trim()}`;
              const decision = decisions.find((entry) => (
                entry.item_key === itemKey || (
                  String(entry.item_no || "") === String(item.item_no || index + 1) &&
                  (!entry.description || String(entry.description).trim() === String(item.description || "").trim())
                )
              ));

              if (isNote) {
                return (
                  <tr key={`${item.item_no || index}-${item.description || ""}`} className="bg-amber-50 text-amber-900">
                    <td className="border border-slate-300 px-2 py-2 font-extrabold">หมายเหตุ</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{displayNo}</td>
                    <td colSpan={8} className="border border-slate-300 px-3 py-2 italic">{item.description || "-"}</td>
                    {hasDecisions ? <td className="border border-slate-300 px-2 py-2 text-center text-slate-400">-</td> : null}
                  </tr>
                );
              }

              if (isGroup) {
                return (
                  <tr key={`${item.item_no || index}-${item.description || ""}`} className={`border-t-2 border-slate-400 text-slate-950 ${isDeduct ? "bg-red-50" : "bg-blue-50"}`}>
                    <td className={`border border-slate-300 px-2 py-2.5 font-extrabold ${isDeduct ? "text-red-700" : "text-blue-700"}`}>
                      {isDeduct ? "หมวดงานลด" : "หมวดงานเพิ่ม"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2.5 text-center font-black">{displayNo}</td>
                    <td colSpan={7} className="border border-slate-300 px-3 py-2.5 font-black">{item.description || "-"}</td>
                    <td className={`border border-slate-300 px-2 py-2.5 text-right font-black tabular-nums ${isDeduct ? "bg-red-100/70 text-red-800" : "bg-blue-100/70 text-blue-800"}`}>
                      {isDeduct ? "−" : "+"}{formatMoney(Math.abs(signedRowAmount))}
                    </td>
                    {hasDecisions ? <VoDecisionCell decision={decision} /> : null}
                  </tr>
                );
              }

              return (
                <tr key={`${item.item_no || index}-${item.description || ""}`} className="bg-white text-slate-700 hover:bg-slate-50">
                  <td className="border border-slate-300 px-2 py-2.5 font-bold text-slate-500">รายการ</td>
                  <td className="border border-slate-300 px-2 py-2.5 text-center font-semibold text-slate-500">{displayNo}</td>
                  <td className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-900">{item.description || "-"}</td>
                  <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(quantity)}</td>
                  <td className="border border-slate-300 px-2 py-2.5">{item.unit || "-"}</td>
                  <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(materialUnit)}</td>
                  <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(materialAmount)}</td>
                  <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(laborUnit)}</td>
                  <td className="border border-slate-300 px-2 py-2.5 text-right tabular-nums">{formatMoney(laborAmount)}</td>
                  <td className={`border border-slate-300 px-2 py-2.5 text-right font-black tabular-nums ${isDeduct ? "text-red-700" : "text-blue-800"}`}>
                    {isDeduct ? "−" : "+"}{formatMoney(Math.abs(signedRowAmount))}
                  </td>
                  {hasDecisions ? <VoDecisionCell decision={decision} /> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VoDecisionCell({ decision }: { decision?: CustomerItemDecision }) {
  const approved = decision?.decision === "approved";
  const rejected = decision?.decision === "rejected";
  return (
    <td className="border border-slate-300 px-2 py-2.5 text-center">
      <span className={`inline-flex px-2 py-1 font-extrabold ${approved ? "bg-emerald-50 text-emerald-700" : rejected ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
        {approved ? "อนุมัติ" : rejected ? "ไม่อนุมัติ" : "รอพิจารณา"}
      </span>
    </td>
  );
}

function Metric({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "amber" | "sky" | "orange" | "green" | "red" }) {
  const tones = {
    gray: "border-gray-100 bg-gray-50 text-gray-900",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    sky: "border-sky-100 bg-sky-50 text-sky-800",
    orange: "border-orange-100 bg-orange-50 text-orange-800",
    green: "border-green-100 bg-green-50 text-green-800",
    red: "border-red-100 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-xs font-extrabold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-xl font-extrabold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: keyof typeof VO_STATUS_LABELS }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${VO_STATUS_STYLES[status]}`}>{VO_STATUS_LABELS[status]}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function Alert({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 text-sm font-bold ${tone === "success" ? "border-green-100 bg-green-50 text-green-700" : "border-red-100 bg-red-50 text-red-700"}`}>
      {children}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm font-semibold text-gray-500">{text}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[220px] text-right font-bold text-gray-900">{value}</span>
    </div>
  );
}

function HistoryTable({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Array<Record<string, string | number | undefined>>;
  columns: Array<[string, string]>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-extrabold text-gray-900">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-white text-xs font-bold text-gray-500">
            <tr>{columns.map(([, label]) => <th key={label} className="px-4 py-3">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {columns.map(([key]) => (
                  <td key={key} className="px-4 py-3 text-gray-700">
                    {["amount_paid", "debit", "credit", "balance"].includes(key) ? formatMoney(row[key]) : String(row[key] || "-")}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">ยังไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
