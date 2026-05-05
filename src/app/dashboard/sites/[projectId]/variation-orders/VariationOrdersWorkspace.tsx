"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Banknote,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Send,
  Workflow,
} from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { hasPermission } from "@/lib/permissions";
import {
  VO_STATUS_LABELS,
  VO_STATUS_STYLES,
  VO_TYPE_LABELS,
  asVoStatus,
  asVoType,
  formatMoney,
  formatThaiDate,
  numberValue,
  todayBangkok,
  type VoItemInput,
  type VoRecord,
} from "@/lib/variationOrders";

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

type CreateForm = {
  vo_type: string;
  title: string;
  description: string;
  client_name: string;
  contract_before: string;
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
  client_name: "",
  contract_before: "",
  source_type: "client_request",
  source_ref_id: "",
  source_description: "",
  vat_exempt: false,
  withholding_tax: "0",
  supporting_docs: "",
  approval_deadline_days: "14",
  items: [
    { item_no: 1, description: "", unit: "LS", quantity: "1", unit_price: "" },
  ],
};

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
  { key: "pipeline", label: "Pipeline", icon: FileText },
  { key: "create", label: "สร้าง VO", icon: Plus },
  { key: "approval", label: "อนุมัติ", icon: CheckCircle2 },
  { key: "plan", label: "เข้าแผนงาน", icon: Workflow },
  { key: "finance", label: "วางบิล/รับชำระ", icon: Banknote },
  { key: "reports", label: "รายงาน/Audit", icon: BarChart3 },
];

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
  const headings = useMemo(() => tasks.filter((task) => task.task_type === "heading"), [tasks]);
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
      if (isClient) return ["pipeline", "approval"].includes(tab.key);
      if (tab.key === "create") return permissions.create;
      if (tab.key === "plan") return permissions.addToPlan;
      if (tab.key === "finance") return permissions.createInvoice || permissions.recordPayment || permissions.overdueCheck;
      if (tab.key === "reports") return permissions.generateMonthlyReport;
      return true;
    });
  }, [isClient, permissions]);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [selectedVoId, setSelectedVoId] = useState("");
  const [createForm, setCreateForm] = useState<CreateForm>({
    ...emptyCreateForm,
    client_name: project.client || "",
    contract_before: project.budget || "",
  });
  const [evidence, setEvidence] = useState(emptyEvidence);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [clientDecision, setClientDecision] = useState({ remarks: "", reject_reason: "" });
  const [cancelReason, setCancelReason] = useState("");
  const [plan, setPlan] = useState(emptyPlan);
  const [invoice, setInvoice] = useState({ invoice_no: "", invoice_date: todayBangkok(), due_days: "7" });
  const [payment, setPayment] = useState({ receipt_no: "", paid_date: todayBangkok(), amount_paid: "", payment_method: "bank_transfer", payment_ref: "", evidence_file: "" });
  const [reportMonth, setReportMonth] = useState(todayBangkok().slice(0, 7));
  const [loadingAction, setLoadingAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [documentHtml, setDocumentHtml] = useState("");

  const selectedVo = useMemo(() => {
    return vos.find((vo) => vo.vo_id === selectedVoId) || vos[0];
  }, [selectedVoId, vos]);
  const selectedDocuments = useMemo(() => {
    if (!selectedVo?.vo_id) return [];
    return (data?.documents || []).filter((document) => document.vo_id === selectedVo.vo_id);
  }, [data?.documents, selectedVo]);
  const selectedPayments = useMemo(() => {
    if (!selectedVo?.vo_id) return [];
    return (data?.payments || []).filter((paymentRow) => paymentRow.vo_id === selectedVo.vo_id);
  }, [data?.payments, selectedVo]);
  const selectedLedger = useMemo(() => {
    if (!selectedVo?.vo_id) return [];
    return (data?.ledger || []).filter((ledgerRow) => ledgerRow.vo_id === selectedVo.vo_id);
  }, [data?.ledger, selectedVo]);

  const stats = useMemo(() => {
    const outstanding = vos.reduce((sum, vo) => sum + numberValue(vo.balance), 0);
    return {
      count: vos.length,
      pending: vos.filter((vo) => vo.status === "pending_approval").length,
      approved: vos.filter((vo) => vo.status === "approved").length,
      outstanding,
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
    const result = await postAction("create_vo", createForm);
    if (result?.data?.vo_id) {
      setSelectedVoId(result.data.vo_id);
      setCreateForm({ ...emptyCreateForm, client_name: project.client || "", contract_before: project.budget || "" });
      setActiveTab("approval");
    }
  };

  const submitSelected = async () => {
    if (!selectedVo?.vo_id) return;
    await postAction("submit_to_client", {
      vo_id: selectedVo.vo_id,
      pm_checklist: {
        items_correct: true,
        calculation_verified: true,
        linked_tasks_set: true,
        supporting_docs_ok: true,
        contract_value_ok: true,
        pm_remarks: "",
      },
    });
  };

  const approveSelected = async () => {
    if (!selectedVo?.vo_id) return;
    const upload = evidenceFile ? await fileToUploadPayload(evidenceFile) : null;
    const result = await postAction("approve_on_behalf", { vo_id: selectedVo.vo_id, evidence, evidence_file_upload: upload });
    if (result?.success) setActiveTab("plan");
  };

  const clientApproveSelected = async () => {
    if (!selectedVo?.vo_id) return;
    await postAction("client_decision", {
      vo_id: selectedVo.vo_id,
      decision: "approved",
      client_remarks: clientDecision.remarks,
    });
  };

  const clientRejectSelected = async () => {
    if (!selectedVo?.vo_id) return;
    await postAction("client_decision", {
      vo_id: selectedVo.vo_id,
      decision: "rejected",
      reject_reason: clientDecision.reject_reason,
    });
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
      setActiveTab("pipeline");
    }
  };

  const createInvoice = async () => {
    if (!selectedVo?.vo_id) return;
    await postAction("create_invoice", {
      vo_id: selectedVo.vo_id,
      invoice_no: invoice.invoice_no || `INV-${selectedVo.vo_id}`,
      invoice_date: invoice.invoice_date,
      due_days: invoice.due_days,
    });
  };

  const recordPayment = async () => {
    if (!selectedVo?.vo_id) return;
    await postAction("record_payment", {
      vo_id: selectedVo.vo_id,
      ...payment,
      receipt_no: payment.receipt_no || `RCP-${selectedVo.vo_id}`,
    });
  };

  const runOverdueCheck = async () => {
    await postAction("overdue_check", {});
  };
  const runExpiryCheck = async () => {
    await postAction("expiry_check", {});
  };
  const cancelSelected = async () => {
    if (!selectedVo?.vo_id) return;
    const result = await postAction("cancel_vo", { vo_id: selectedVo.vo_id, reason: cancelReason });
    if (result?.success) setCancelReason("");
  };
  const generateMonthlyReport = async () => {
    await postAction("generate_monthly_report", { month: reportMonth });
  };

  const printDocument = () => {
    if (!documentHtml) return;
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200");
    if (!win) return;
    win.document.write(documentHtml);
    win.document.close();
    window.setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <Metric label="VO ทั้งหมด" value={`${stats.count}`} />
          <Metric label="รออนุมัติ" value={`${stats.pending}`} tone="amber" />
          <Metric label="อนุมัติแล้ว" value={`${stats.approved}`} tone="sky" />
          <Metric label="เงินค้างชำระ" value={`${formatMoney(stats.outstanding)} บาท`} tone={stats.outstanding > 0 ? "orange" : "green"} />
        </div>
      </section>

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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0">
          {activeTab === "pipeline" && (
            <PipelineSection vos={vos} isLoading={isLoading} selectedVoId={selectedVo?.vo_id || ""} onSelect={setSelectedVoId} />
          )}
          {activeTab === "create" && (
            <CreateSection form={createForm} setForm={setCreateForm} onSubmit={createVo} loading={loadingAction === "create_vo"} />
          )}
          {activeTab === "approval" && (
            <ApprovalSection
              vo={selectedVo}
              evidence={evidence}
              setEvidence={setEvidence}
              evidenceFile={evidenceFile}
              setEvidenceFile={setEvidenceFile}
              onSubmitToClient={submitSelected}
              onApprove={approveSelected}
              userRole={normalizedRole}
              permissions={permissions}
              clientDecision={clientDecision}
              setClientDecision={setClientDecision}
              onClientApprove={clientApproveSelected}
              onClientReject={clientRejectSelected}
              cancelReason={cancelReason}
              setCancelReason={setCancelReason}
              onCancel={cancelSelected}
              onExpiryCheck={runExpiryCheck}
              loadingAction={loadingAction}
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
          {activeTab === "finance" && (
            <FinanceSection
              vo={selectedVo}
              invoice={invoice}
              setInvoice={setInvoice}
              payment={payment}
              setPayment={setPayment}
              onCreateInvoice={createInvoice}
              onRecordPayment={recordPayment}
              onOverdueCheck={runOverdueCheck}
              payments={selectedPayments}
              ledger={selectedLedger}
              loadingAction={loadingAction}
              canCreateInvoice={permissions.createInvoice}
              canRecordPayment={permissions.recordPayment}
              canRunOverdueCheck={permissions.overdueCheck}
            />
          )}
          {activeTab === "reports" && (
            <ReportsAuditSection
              vos={vos}
              auditLogs={data?.audit_logs || []}
              month={reportMonth}
              setMonth={setReportMonth}
              onGenerateMonthlyReport={generateMonthlyReport}
              loading={loadingAction === "generate_monthly_report"}
              canGenerateMonthlyReport={permissions.generateMonthlyReport}
            />
          )}
        </main>

        <aside className="space-y-4">
          <SelectedVoPanel vo={selectedVo} documents={selectedDocuments} />
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-extrabold text-gray-900">หลักการใช้งาน</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
              {isClient ? (
                <>
                  <p>1. ตรวจรายละเอียด VO และยอดรวมก่อนตัดสินใจ</p>
                  <p>2. กดยืนยันหรือปฏิเสธผ่านระบบ ระบบจะบันทึกเป็นหลักฐานดิจิทัล</p>
                  <p>3. หากอนุมัติแล้ว ทีมงานจะนำไปวางแผนและออกเอกสารต่อ</p>
                </>
              ) : (
                <>
                  <p>1. สร้างรายการงานเพิ่ม-ลดและตรวจยอด</p>
                  <p>2. PM ส่งอนุมัติ แล้วออฟฟิศบันทึกหลักฐานแทนลูกค้า</p>
                  <p>3. หลังอนุมัติ ให้เพิ่มเข้าแผนงานเอง เลือกหัวข้อหลักและวันเวลาได้เหมือน task ปกติ</p>
                  <p>4. วางบิลและรับชำระเพื่อปิดยอดทางบัญชี</p>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PipelineSection({
  vos,
  isLoading,
  selectedVoId,
  onSelect,
}: {
  vos: Array<VoRecord & { items?: VoItemInput[] }>;
  isLoading: boolean;
  selectedVoId: string;
  onSelect: (voId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-lg font-extrabold text-gray-900">รายการงานเพิ่ม-ลด</h3>
        <p className="text-sm text-gray-500">ติดตามสถานะตั้งแต่ร่าง อนุมัติ วางบิล จนถึงรับชำระ</p>
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
              <th className="px-4 py-3">แผนงาน</th>
              <th className="px-4 py-3">กำหนดอนุมัติ</th>
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
                  <td className="px-4 py-3">{vo.task_plan_status === "planned" ? "เพิ่มเข้าแผนแล้ว" : status === "approved" ? "รอเพิ่มเข้าแผน" : "-"}</td>
                  <td className="px-4 py-3">{formatThaiDate(vo.approval_deadline)}</td>
                </tr>
              );
            })}
            {vos.length === 0 && !isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายการงานเพิ่ม-ลด</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">กำลังโหลด...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function fileToUploadPayload(file: File) {
  return new Promise<{ name: string; type: string; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("อ่านไฟล์แนบไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function CreateSection({ form, setForm, onSubmit, loading }: { form: CreateForm; setForm: (next: CreateForm) => void; onSubmit: () => void; loading: boolean }) {
  const updateItem = (index: number, key: keyof VoItemInput, value: string) => {
    const items = form.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    setForm({ ...form, items });
  };
  const addItem = () => {
    setForm({ ...form, items: [...form.items, { item_no: form.items.length + 1, description: "", unit: "LS", quantity: "1", unit_price: "" }] });
  };
  const removeItem = (index: number) => {
    const items = form.items.filter((_item, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, item_no: itemIndex + 1 }));
    setForm({ ...form, items: items.length ? items : [{ item_no: 1, description: "", unit: "LS", quantity: "1", unit_price: "" }] });
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-extrabold text-gray-900">สร้างงานเพิ่ม-ลด</h3>
        <p className="text-sm text-gray-500">กรอกข้อมูลให้ครบ ระบบจะคำนวณยอดและสร้างใบ VO ให้พิมพ์ได้ทันที</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="ประเภท">
          <select value={form.vo_type} onChange={(event) => setForm({ ...form, vo_type: event.target.value })} className="form-input bg-white">
            <option value="VO+">งานเพิ่ม (VO+)</option>
            <option value="VO-">งานลด (VO-)</option>
            <option value="VO0">งานสับเปลี่ยน (VO0)</option>
          </select>
        </Field>
        <Field label="ชื่องาน">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-input" />
        </Field>
        <Field label="ลูกค้า">
          <input value={form.client_name} onChange={(event) => setForm({ ...form, client_name: event.target.value })} className="form-input" />
        </Field>
        <Field label="มูลค่าสัญญาปัจจุบัน">
          <input value={form.contract_before} onChange={(event) => setForm({ ...form, contract_before: event.target.value })} className="form-input" inputMode="decimal" />
        </Field>
        <Field label="WHT">
          <select value={form.withholding_tax} onChange={(event) => setForm({ ...form, withholding_tax: event.target.value })} className="form-input bg-white">
            <option value="0">ไม่หัก</option>
            <option value="1">1%</option>
            <option value="3">3%</option>
            <option value="5">5%</option>
          </select>
        </Field>
        <Field label="กำหนดอนุมัติ (วัน)">
          <input value={form.approval_deadline_days} onChange={(event) => setForm({ ...form, approval_deadline_days: event.target.value })} className="form-input" inputMode="numeric" />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Field label="รายละเอียด">
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="form-input resize-none" />
        </Field>
        <Field label="เอกสารประกอบ/อ้างอิง">
          <textarea value={form.supporting_docs} onChange={(event) => setForm({ ...form, supporting_docs: event.target.value })} rows={4} className="form-input resize-none" />
        </Field>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-gray-50 text-xs font-bold text-gray-500">
            <tr>
              <th className="px-3 py-2">รายการ</th>
              <th className="px-3 py-2 w-24">หน่วย</th>
              <th className="px-3 py-2 w-24">จำนวน</th>
              <th className="px-3 py-2 w-36">ราคา/หน่วย</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {form.items.map((item, index) => (
              <tr key={index}>
                <td className="px-3 py-2"><input value={String(item.description || "")} onChange={(event) => updateItem(index, "description", event.target.value)} className="form-input" /></td>
                <td className="px-3 py-2"><input value={String(item.unit || "")} onChange={(event) => updateItem(index, "unit", event.target.value)} className="form-input" /></td>
                <td className="px-3 py-2"><input value={String(item.quantity || "")} onChange={(event) => updateItem(index, "quantity", event.target.value)} className="form-input" inputMode="decimal" /></td>
                <td className="px-3 py-2"><input value={String(item.unit_price || "")} onChange={(event) => updateItem(index, "unit_price", event.target.value)} className="form-input" inputMode="decimal" /></td>
                <td className="px-3 py-2 text-right"><button type="button" onClick={() => removeItem(index)} className="text-sm font-bold text-red-600">ลบ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addItem} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
          <Plus size={16} />
          เพิ่มรายการ
        </button>
        <button type="button" onClick={onSubmit} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
          สร้าง VO
        </button>
      </div>
    </section>
  );
}

function ApprovalSection({
  vo,
  evidence,
  setEvidence,
  evidenceFile,
  setEvidenceFile,
  onSubmitToClient,
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
  onSubmitToClient: () => void;
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
      <h3 className="text-lg font-extrabold text-gray-900">ส่งอนุมัติและบันทึกหลักฐาน</h3>
      {!vo ? <EmptyText text="เลือก VO ก่อน" /> : (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onSubmitToClient} disabled={loadingAction === "submit_to_client" || vo.status !== "draft" || !permissions.submitToClient} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
              {loadingAction === "submit_to_client" ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              PM ส่งอนุมัติ
            </button>
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
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-extrabold text-gray-900">เพิ่มเข้าแผนงาน</h3>
      {!vo ? <EmptyText text="เลือก VO ก่อน" /> : (
        <div className="mt-4 space-y-4">
          {voType === "VO+" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="หัวข้อหลัก">
                <select value={plan.parent_task_id} onChange={(event) => setPlan({ ...plan, parent_task_id: event.target.value })} className="form-input bg-white">
                  <option value="">เลือกหัวข้อหลัก</option>
                  {headings.map((task) => <option key={task.task_id} value={task.task_id}>{task.name}</option>)}
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
            <button type="button" onClick={onAddToPlan} disabled={loading || !canAddToPlan || !["approved", "billed", "partial_payment", "paid", "overdue"].includes(String(vo.status || ""))} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Workflow size={17} />}
              เพิ่มเข้าแผนงาน
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function FinanceSection({
  vo,
  invoice,
  setInvoice,
  payment,
  setPayment,
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
              <Field label="เครดิต (วันทำการ)">
                <input value={invoice.due_days} onChange={(event) => setInvoice({ ...invoice, due_days: event.target.value })} className="form-input" />
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
              <Field label="เลขอ้างอิง/สลิป">
                <input value={payment.payment_ref} onChange={(event) => setPayment({ ...payment, payment_ref: event.target.value })} className="form-input" />
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

function ReportsAuditSection({
  vos,
  auditLogs,
  month,
  setMonth,
  onGenerateMonthlyReport,
  loading,
  canGenerateMonthlyReport,
}: {
  vos: Array<VoRecord & { items?: VoItemInput[] }>;
  auditLogs: Array<Record<string, string | number | undefined>>;
  month: string;
  setMonth: (month: string) => void;
  onGenerateMonthlyReport: () => void;
  loading: boolean;
  canGenerateMonthlyReport: boolean;
}) {
  const monthlyRows = useMemo(() => {
    const grouped = new Map<string, { label: string; plus: number; minus: number; paid: number }>();
    vos.forEach((vo) => {
      const key = String(vo.created_at || vo.invoice_date || "").slice(0, 7) || "ไม่ระบุ";
      const current = grouped.get(key) || { label: key, plus: 0, minus: 0, paid: 0 };
      if (vo.vo_type === "VO-") current.minus += numberValue(vo.grand_total);
      else if (vo.vo_type === "VO+") current.plus += numberValue(vo.grand_total);
      current.paid += numberValue(vo.amount_paid);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-8);
  }, [vos]);
  const maxValue = Math.max(1, ...monthlyRows.flatMap((row) => [row.plus, row.minus, row.paid]));

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">รายงานงานเพิ่ม-ลด</h3>
            <p className="text-sm text-gray-500">สร้างรายงานประจำเดือนแบบ print-ready และเก็บ PDF เข้า Drive</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="เดือนรายงาน">
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="form-input" />
            </Field>
            <button
              type="button"
              onClick={onGenerateMonthlyReport}
              disabled={loading || !canGenerateMonthlyReport}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Printer size={17} />}
              สร้างรายงาน
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 font-extrabold text-gray-900">
          <BarChart3 size={19} className="text-orange-600" />
          Cashflow VO ตามเดือน
        </div>
        <div className="space-y-3">
          {monthlyRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[90px_1fr] items-center gap-3 text-sm">
              <div className="font-bold text-gray-600">{row.label}</div>
              <div className="space-y-1">
                <Bar label="VO+" value={row.plus} max={maxValue} className="bg-emerald-500" />
                <Bar label="VO-" value={row.minus} max={maxValue} className="bg-red-500" />
                <Bar label="Paid" value={row.paid} max={maxValue} className="bg-sky-500" />
              </div>
            </div>
          ))}
          {monthlyRows.length === 0 && <EmptyText text="ยังไม่มีข้อมูล cashflow" />}
        </div>
      </div>

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

function SelectedVoPanel({ vo, documents }: { vo?: VoRecord; documents: Array<Record<string, string | number | undefined>> }) {
  if (!vo) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <EmptyText text="ยังไม่ได้เลือก VO" />
      </section>
    );
  }
  const type = asVoType(String(vo.vo_type || ""));
  const status = asVoStatus(String(vo.status || ""));
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-orange-600">Selected VO</div>
          <h3 className="mt-1 text-lg font-extrabold text-gray-900">{vo.vo_id}</h3>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <InfoRow label="ประเภท" value={VO_TYPE_LABELS[type]} />
        <InfoRow label="ชื่องาน" value={String(vo.title || "-")} />
        <InfoRow label="มูลค่า" value={`${formatMoney(vo.grand_total)} บาท`} />
        <InfoRow label="ยอดคงเหลือ" value={`${formatMoney(vo.balance)} บาท`} />
        <InfoRow label="แผนงาน" value={vo.task_plan_status === "planned" ? "เพิ่มเข้าแผนแล้ว" : "ยังไม่เพิ่มเข้าแผน"} />
      </div>
      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="text-sm font-extrabold text-gray-900">เอกสาร</div>
        <div className="mt-3 space-y-2">
          {documents.map((document) => (
            <a
              key={String(document.document_id)}
              href={String(document.pdf_url || "#")}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm ${document.pdf_url ? "bg-white text-gray-700 hover:border-orange-200 hover:text-orange-700" : "bg-gray-50 text-gray-400"}`}
            >
              <span className="truncate font-bold">{document.title || document.document_type || "Document"}</span>
              {document.pdf_url ? <ExternalLink size={15} /> : <span className="text-xs">HTML only</span>}
            </a>
          ))}
          {documents.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-xs font-semibold text-gray-400">ยังไม่มีเอกสาร</div>}
        </div>
      </div>
    </section>
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
