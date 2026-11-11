// Opt-in projections for the overview. Detail screens retain their existing full reads.
// All rows are retained: totals and the complete existing calendar still use the same records.
export const SITE_OVERVIEW_COLUMNS: Record<string, string> = {
  tasks: "task_id,project_id,name,assignee,start_date,end_date,status,percent_done,priority,order_index,task_type,planned_start,planned_end",
  milestones: "milestone_id,project_id,title,date,type",
  issues: "issue_id,project_id,title,priority,status,due_date,owner,created_at,updated_at",
  materials: "material_id,project_id,name,supplier,quantity,unit,qty_actual,order_date,delivery_date,status",
  daily_reports: "report_id,project_id,report_date,document_no,weather,work_done,created_at,updated_at",
  weekly_reports: "report_id,project_id,week_start,week_end,document_no,created_at,updated_at",
  monthly_reports: "report_id,project_id,month,month_start,month_end,document_no,created_at,updated_at",
  site_notes: "note_id,project_id,title,category,priority,pinned,archived,follow_up_date,created_at,updated_at",
  site_memos: "memo_id,project_id,document_no,title,event_date,issue_date,requires_customer_ack,has_time_impact,extension_days,status,issued_at,acknowledged_date,acknowledged_by,created_at,updated_at",
  project_documents: "document_id,project_id,category,title,file_name,mime_type,drive_file_id,uploaded_by_name,created_at,updated_at",
  defect_rounds: "round_id,project_id,document_no,title,inspection_date,status,acknowledged_date,acknowledged_by,created_at,updated_at",
  defect_items: "item_id,project_id,item_no,zone,work_category,description,status,owner,due_date",
  qc_checklists: "qc_id,project_id,document_no,title,status,approval_status,inspection_date,customer_approved_at,customer_approved_by,active",
  customer_decisions: "decision_id,project_id,title,decision_status,notified_at,decided_at,decided_by,active,created_at,updated_at",
  variation_orders: "vo_id,project_id,title,description,subtotal,grand_total,net_payable,approval_deadline,customer_approved_at,customer_approved_by,status,due_date,amount_due,balance,payment_status,created_at,updated_at",
  vo_finance_ledger: "ledger_id,project_id,entry_type,ref_no,entry_date,debit,credit,balance,summary",
};
