"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Banknote,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Printer,
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
  { key: "create", label: "กรอก / แนบหลักฐาน", icon: Plus },
  { key: "plan", label: "เข้าแผนงาน", icon: Workflow },
  { key: "history", label: "ประวัติ / Print ทั้งหมด", icon: FileText },
];

const PLAN_ELIGIBLE_STATUSES = new Set(["approved", "billed", "partial_payment", "paid", "overdue"]);

function canAddVoToPlan(vo?: VoRecord) {
  return PLAN_ELIGIBLE_STATUSES.has(asVoStatus(String(vo?.status || "")));
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
      if (isClient) return tab.key === "history";
      if (tab.key === "create") return permissions.create;
      if (tab.key === "plan") return permissions.addToPlan;
      return true;
    });
  }, [isClient, permissions]);
  const [activeTab, setActiveTab] = useState(permissions.create && !isClient ? "create" : "history");
  const [selectedVoId, setSelectedVoId] = useState("");
  const [editingVoId, setEditingVoId] = useState("");
  const [createForm, setCreateForm] = useState<CreateForm>({
    ...emptyCreateForm,
    client_name: project.client || "",
  });
  const [supportingDocFiles, setSupportingDocFiles] = useState<File[]>([]);
  const [plan, setPlan] = useState(emptyPlan);
  const [loadingAction, setLoadingAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [documentHtml, setDocumentHtml] = useState("");

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
    const approvedStatuses = new Set(["approved", "billed", "partial_payment", "paid", "overdue", "work_unlocked"]);
    const approvedVos = vos.filter((vo) => approvedStatuses.has(String(vo.status || "")));
    const addAmount = approvedVos
      .filter((vo) => asVoType(String(vo.vo_type || "")) === "VO+")
      .reduce((sum, vo) => sum + numberValue(vo.grand_total), 0);
    const deductAmount = approvedVos
      .filter((vo) => asVoType(String(vo.vo_type || "")) === "VO-")
      .reduce((sum, vo) => sum + numberValue(vo.grand_total), 0);
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
    if (!createForm.amount.trim() || numberValue(createForm.amount) <= 0) {
      setMessage("");
      setError("กรุณากรอกมูลค่างานเพิ่ม/งานลด");
      return;
    }
    if (!editingVoId && supportingDocFiles.length === 0 && !createForm.supporting_docs.trim()) {
      setMessage("");
      setError("กรุณาแนบเอกสาร ใบเสร็จ/บิล หรือแคปหน้าจอจากลูกค้า");
      return;
    }
    const supportingUploads = await Promise.all(supportingDocFiles.map(fileToUploadPayload));
    const result = await postAction(editingVoId ? "update_vo" : "create_vo", {
      ...(editingVoId ? { vo_id: editingVoId } : {}),
      ...createForm,
      items: [
        {
          item_no: 1,
          description: createForm.title || createForm.description || "งานเพิ่ม-ลด",
          unit: "LS",
          quantity: "1",
          unit_price: createForm.amount,
        },
      ],
      supporting_doc_uploads: supportingUploads,
    });
    if (result?.data?.vo_id) {
      setSelectedVoId(result.data.vo_id);
      setEditingVoId("");
      setCreateForm({ ...emptyCreateForm, client_name: project.client || "" });
      setSupportingDocFiles([]);
      setActiveTab(permissions.addToPlan ? "plan" : "history");
    }
  };

  const startEditVo = (vo: VoRecord & { items?: VoItemInput[] }) => {
    const firstItem = Array.isArray(vo.items) ? vo.items[0] : undefined;
    setSelectedVoId(vo.vo_id);
    setEditingVoId(vo.vo_id);
    setCreateForm({
      vo_type: String(vo.vo_type || "VO+"),
      title: String(vo.title || ""),
      description: String(vo.description || ""),
      amount: String(firstItem?.unit_price || vo.grand_total || vo.subtotal || ""),
      extension_days: String(vo.extension_days || "0"),
      status: ["draft", "pending_approval", "rejected"].includes(String(vo.status || "")) ? String(vo.status || "") : "pending_approval",
      client_name: String(vo.client_name || project.client || ""),
      source_type: String(vo.source_type || "client_request"),
      source_ref_id: String(vo.source_ref_id || ""),
      source_description: String(vo.source_description || ""),
      vat_exempt: String(vo.vat_exempt || "").toLowerCase() === "true",
      withholding_tax: String(vo.withholding_tax || "0"),
      supporting_docs: String(vo.supporting_docs || ""),
      approval_deadline_days: "14",
      items: [
        {
          item_no: 1,
          description: String(firstItem?.description || vo.title || vo.description || "งานเพิ่ม-ลด"),
          unit: String(firstItem?.unit || "LS"),
          quantity: String(firstItem?.quantity || "1"),
          unit_price: String(firstItem?.unit_price || vo.grand_total || vo.subtotal || ""),
        },
      ],
    });
    setSupportingDocFiles([]);
    setActiveTab("create");
    setMessage(`กำลังแก้ไข ${vo.vo_id}`);
    setError("");
  };

  const cancelEdit = () => {
    setEditingVoId("");
    setCreateForm({ ...emptyCreateForm, client_name: project.client || "" });
    setSupportingDocFiles([]);
    setMessage("");
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

  const printAllReport = async () => {
    const printWindow = window.open("", "_blank", "popup=yes,width=1100,height=800");
    printWindow?.document.open();
    printWindow?.document.write("<!doctype html><html><head><meta charset=\"utf-8\" /><title>กำลังสร้างรายงาน</title></head><body style=\"font-family:Arial,sans-serif;padding:24px;\">กำลังสร้างรายงานทะเบียนงานเพิ่ม-ลดทั้งหมด...</body></html>");
    printWindow?.document.close();
    const result = await postAction("generate_monthly_report", { scope: "all" });
    if (result?.document_html) {
      const html = String(result.document_html);
      setDocumentHtml(html);
      const opened = printHtml(html, 1100, 800, printWindow);
      if (opened) {
        setMessage("เปิดหน้าพิมพ์ทะเบียนงานเพิ่ม-ลดทั้งหมดแล้ว");
        setError("");
      } else {
        setMessage("สร้างรายงานทั้งหมดแล้ว กดปุ่ม Print ด้านบนเพื่อเปิดหน้าพิมพ์อีกครั้ง");
      }
    } else {
      printWindow?.close();
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="ยอดเงินงานเพิ่มรวม" value={`${formatMoney(stats.addAmount)} บาท`} tone="green" />
          <Metric label="ยอดเงินงานลดรวม" value={`${formatMoney(stats.deductAmount)} บาท`} tone="red" />
          <Metric label="ยอดเงินสุทธิ" value={`${formatMoney(stats.netAmount)} บาท`} tone={stats.netAmount >= 0 ? "orange" : "red"} />
          <Metric label="วันเพิ่มรวม" value={`${formatMoney(stats.extensionDays)} วัน`} tone="sky" />
          <Metric label="อนุมัติแล้ว" value={`${stats.approved} รายการ`} tone="gray" />
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
          {activeTab === "create" && (
            <CreateSection
              form={createForm}
              setForm={setCreateForm}
              supportingDocFiles={supportingDocFiles}
              setSupportingDocFiles={setSupportingDocFiles}
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
              onSelect={setSelectedVoId}
              isLoading={isLoading}
              onPrintAll={printAllReport}
              printing={loadingAction === "generate_monthly_report"}
              canPrintAll={permissions.generateMonthlyReport}
            />
          )}
        </main>

        <aside className="space-y-4">
          <SelectedVoPanel
            vo={selectedVo}
            documents={selectedDocuments}
            canSendApproval={permissions.submitToClient}
            canEdit={permissions.create}
            loading={loadingAction === "send_approval"}
            onSendApproval={sendApproval}
            onEdit={startEditVo}
          />
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
                  <p>1. วิศวกรกรอกหัวข้องานเพิ่ม-ลด มูลค่า และจำนวนวันเพิ่ม</p>
                  <p>2. แนบไฟล์เอกสาร ใบเสร็จ/บิล และแคปหน้าจอจากลูกค้า แล้วกดบันทึก</p>
                  <p>3. ถ้าต้องใช้แผนงาน ให้ทำต่อใน tab เข้าแผนงานเหมือน workflow เดิม</p>
                  <p>4. tab ประวัติใช้ดูทะเบียนย้อนหลังและ Print ทั้งหมดพร้อม timestamp เวลาโหลดข้อมูล</p>
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
              <th className="px-4 py-3 text-right">วันเพิ่ม</th>
              <th className="px-4 py-3">แผนงาน</th>
              <th className="px-4 py-3">วันที่บันทึก</th>
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
                </tr>
              );
            })}
            {vos.length === 0 && !isLoading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">ยังไม่มีรายการงานเพิ่ม-ลด</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">กำลังโหลด...</td></tr>
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

function CreateSection({
  form,
  setForm,
  supportingDocFiles,
  setSupportingDocFiles,
  onSubmit,
  loading,
  editingVoId,
  onCancelEdit,
}: {
  form: CreateForm;
  setForm: (next: CreateForm) => void;
  supportingDocFiles: File[];
  setSupportingDocFiles: (next: File[]) => void;
  onSubmit: () => void;
  loading: boolean;
  editingVoId?: string;
  onCancelEdit?: () => void;
}) {
  const addSupportingFiles = (files: FileList | null) => {
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;
    setSupportingDocFiles([...supportingDocFiles, ...nextFiles]);
  };
  const removeSupportingFile = (index: number) => {
    setSupportingDocFiles(supportingDocFiles.filter((_file, fileIndex) => fileIndex !== index));
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">{editingVoId ? `แก้ไขงานเพิ่ม-ลด ${editingVoId}` : "กรอกงานเพิ่ม-ลด / แนบหลักฐาน"}</h3>
            <p className="text-sm text-gray-500">
              {editingVoId
                ? "แก้ไขข้อมูลก่อนลูกค้าอนุมัติได้ หากส่ง LINE ไปแล้วให้กดส่งอีกครั้งหลังบันทึก เพื่อให้ลูกค้าเห็นข้อมูลล่าสุด"
                : "วิศวกรนำเอกสารที่ทำจากข้างนอกมาแนบในระบบ พร้อมบันทึกยอดเงินและจำนวนวันเพิ่มเพื่อสรุปภาพรวมไซต์"}
            </p>
          </div>
          {editingVoId && onCancelEdit ? (
            <button type="button" onClick={onCancelEdit} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <XCircle size={16} />
              ยกเลิกแก้ไข
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="ประเภทงาน">
          <select value={form.vo_type} onChange={(event) => setForm({ ...form, vo_type: event.target.value })} className="form-input bg-white">
            <option value="VO+">งานเพิ่ม</option>
            <option value="VO-">งานลด</option>
            <option value="VO0">งานสับเปลี่ยน</option>
          </select>
        </Field>
        <Field label="หัวข้อ">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-input" />
        </Field>
        <Field label="เลขที่เอกสาร / ใบเสร็จ / อ้างอิง">
          <input value={form.source_ref_id} onChange={(event) => setForm({ ...form, source_ref_id: event.target.value })} className="form-input" placeholder="เช่น VO-001, ใบเสร็จ, เลขที่แชท" />
        </Field>
        <Field label="มูลค่า (บาท)">
          <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="form-input" inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="จำนวนวันเพิ่ม">
          <input value={form.extension_days} onChange={(event) => setForm({ ...form, extension_days: event.target.value })} className="form-input" inputMode="numeric" placeholder="0" />
        </Field>
        <Field label="สถานะ">
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="form-input bg-white">
            <option value="approved">อนุมัติแล้ว / ลูกค้ายืนยันแล้ว</option>
            <option value="pending_approval">รอลูกค้ายืนยัน</option>
            <option value="draft">บันทึกร่าง</option>
            <option value="rejected">ไม่อนุมัติ</option>
          </select>
        </Field>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Field label="รายละเอียด / เหตุผล">
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="form-input resize-none" />
        </Field>
        <Field label="หลักฐาน / หมายเหตุ">
          <div className="space-y-3">
            <textarea value={form.supporting_docs} onChange={(event) => setForm({ ...form, supporting_docs: event.target.value })} rows={4} className="form-input resize-none" placeholder="อธิบายว่าแนบอะไร เช่น ใบเสร็จ, บิล, แคปหน้าจอ LINE, รูปหน้างาน" />
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-orange-100 bg-white px-3 py-2 text-sm font-bold text-orange-700 hover:bg-orange-50">
                <Paperclip size={16} />
                แนบไฟล์หลักฐาน
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                  className="sr-only"
                  onChange={(event) => {
                    addSupportingFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <p className="mt-2 text-xs font-semibold text-gray-500">รองรับรูปแคปหน้าจอ, PDF, Word, Excel และเอกสารอ้างอิงจากภายนอก</p>
              {supportingDocFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {supportingDocFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-600">
                      <span className="truncate">{file.name}</span>
                      <button type="button" onClick={() => removeSupportingFile(index)} className="font-bold text-red-600">ลบ</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Field>
      </div>
      <div className="mt-5 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold text-gray-500">ยอดที่บันทึก</p>
          <p className="mt-1 text-xl font-extrabold text-gray-950">{formatMoney(form.amount)} บาท</p>
        </div>
        <div>
          <p className="font-bold text-gray-500">วันเพิ่ม</p>
          <p className="mt-1 text-xl font-extrabold text-sky-700">{formatMoney(form.extension_days)} วัน</p>
        </div>
        <div>
          <p className="font-bold text-gray-500">การนำไปคิดยอดรวม</p>
          <p className="mt-1 text-sm font-bold text-gray-700">{form.status === "approved" ? "นับใน dashboard ทันที" : "ยังไม่นับจนกว่าจะอนุมัติ"}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={onSubmit} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
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
              {voType === "VO+" ? "ยังไม่มีหัวข้อหลักในแผนงาน กรุณาสร้าง H1 ในหน้าแผนงานก่อน" : "ยังไม่มี task ในแผนงานให้เลือก"}
            </div>
          ) : null}
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
  const allSummary = useMemo(() => {
    const approvedStatuses = new Set(["approved", "billed", "partial_payment", "paid", "overdue", "work_unlocked"]);
    const approvedVos = vos.filter((vo) => approvedStatuses.has(String(vo.status || "")));
    const plus = approvedVos.filter((vo) => asVoType(String(vo.vo_type || "")) === "VO+").reduce((sum, vo) => sum + numberValue(vo.grand_total), 0);
    const minus = approvedVos.filter((vo) => asVoType(String(vo.vo_type || "")) === "VO-").reduce((sum, vo) => sum + numberValue(vo.grand_total), 0);
    const days = approvedVos.reduce((sum, vo) => sum + numberValue(vo.extension_days), 0);
    return { plus, minus, net: plus - minus, days, approved: approvedVos.length };
  }, [vos]);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">ประวัติงานเพิ่ม-ลด</h3>
            <p className="text-sm text-gray-500">ดูทะเบียนย้อนหลังทั้งหมด แล้วกด Print ทั้งหมดเพื่อออกเอกสารพร้อม timestamp เวลาโหลดข้อมูลสำหรับอ้างอิง</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={onPrintAll}
              disabled={!canPrintAll || printing}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {printing ? <Loader2 size={17} className="animate-spin" /> : <Printer size={17} />}
              Print ทั้งหมด
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <Metric label="งานเพิ่มทั้งหมด" value={`${formatMoney(allSummary.plus)} บาท`} tone="green" />
          <Metric label="งานลดทั้งหมด" value={`${formatMoney(allSummary.minus)} บาท`} tone="red" />
          <Metric label="สุทธิทั้งหมด" value={`${formatMoney(allSummary.net)} บาท`} tone={allSummary.net >= 0 ? "orange" : "red"} />
          <Metric label="วันเพิ่มทั้งหมด" value={`${formatMoney(allSummary.days)} วัน`} tone="sky" />
          <Metric label="อนุมัติแล้ว" value={`${allSummary.approved} รายการ`} />
        </div>
        <PipelineSection vos={vos} isLoading={isLoading} selectedVoId={selectedVoId} onSelect={onSelect} />
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
  onSendApproval,
  onEdit,
}: {
  vo?: VoRecord & { items?: VoItemInput[] };
  documents: Array<Record<string, string | number | undefined>>;
  canSendApproval: boolean;
  canEdit: boolean;
  loading: boolean;
  onSendApproval: () => void;
  onEdit: (vo: VoRecord & { items?: VoItemInput[] }) => void;
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
  const canEditVo = canEdit && ["draft", "pending_approval", "rejected", "expired"].includes(status);
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
        <InfoRow label="จำนวนวันเพิ่ม" value={`${formatMoney(vo.extension_days)} วัน`} />
        <InfoRow label="อ้างอิงเอกสาร" value={String(vo.source_ref_id || "-")} />
        <InfoRow label="ส่งลูกค้า" value={vo.sent_to_customer_at ? formatThaiDate(String(vo.sent_to_customer_at).slice(0, 10)) : "-"} />
        <InfoRow label="แผนงาน" value={vo.task_plan_status === "planned" ? "เพิ่มเข้าแผนแล้ว" : "ยังไม่เพิ่มเข้าแผน"} />
      </div>
      <div className="mt-5 space-y-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => onEdit(vo)}
          disabled={!canEditVo}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-extrabold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil size={16} />
          แก้ไขรายการนี้
        </button>
        <button
          type="button"
          onClick={onSendApproval}
          disabled={loading || !canSendApproval || !["draft", "pending_approval"].includes(String(vo.status || ""))}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          ส่ง LINE ให้ลูกค้าอนุมัติ
        </button>
        {vo.approval_url ? (
          <a href={String(vo.approval_url)} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-extrabold text-gray-700 hover:bg-gray-50">
            <ExternalLink size={15} />
            เปิดลิงก์อนุมัติ
          </a>
        ) : null}
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
