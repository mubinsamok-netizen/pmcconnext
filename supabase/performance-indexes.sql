-- Performance indexes for Supabase-backed reads.
-- Run this in the Supabase SQL editor after creating/migrating site schemas.
-- It covers both the legacy public site tables and per-project site_* schemas.

do $$
declare
  v_schema text;
begin
  for v_schema in
    select nspname
    from pg_namespace
    where nspname = 'public'
       or nspname like 'site_%'
  loop
    if to_regclass(format('%I.%I', v_schema, 'tasks')) is not null then
      execute format('create index if not exists %I on %I.tasks (project_id, order_index)', 'tasks_project_order_idx', v_schema);
      execute format('create index if not exists %I on %I.tasks (project_id, end_date)', 'tasks_project_end_date_idx', v_schema);
      execute format('create index if not exists %I on %I.tasks (project_id, status)', 'tasks_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'milestones')) is not null then
      execute format('create index if not exists %I on %I.milestones (project_id, date)', 'milestones_project_date_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'daily_reports')) is not null then
      execute format('create index if not exists %I on %I.daily_reports (project_id, report_date desc)', 'daily_reports_project_report_date_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'weekly_reports')) is not null then
      execute format('create index if not exists %I on %I.weekly_reports (project_id, week_start desc)', 'weekly_reports_project_week_start_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'monthly_reports')) is not null then
      execute format('create index if not exists %I on %I.monthly_reports (project_id, month_start desc)', 'monthly_reports_project_month_start_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'project_documents')) is not null then
      execute format('create index if not exists %I on %I.project_documents (project_id, created_at desc)', 'project_documents_project_created_at_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'issues')) is not null then
      execute format('create index if not exists %I on %I.issues (project_id, due_date)', 'issues_project_due_date_idx', v_schema);
      execute format('create index if not exists %I on %I.issues (project_id, status)', 'issues_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'materials')) is not null then
      execute format('create index if not exists %I on %I.materials (project_id, delivery_date)', 'materials_project_delivery_date_idx', v_schema);
      execute format('create index if not exists %I on %I.materials (project_id, status)', 'materials_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'variation_orders')) is not null then
      execute format('create index if not exists %I on %I.variation_orders (project_id, created_at desc)', 'variation_orders_project_created_at_idx', v_schema);
      execute format('create index if not exists %I on %I.variation_orders (project_id, status)', 'variation_orders_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'vo_items')) is not null then
      execute format('create index if not exists %I on %I.vo_items (project_id, vo_id)', 'vo_items_project_vo_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'vo_documents')) is not null then
      execute format('create index if not exists %I on %I.vo_documents (project_id, vo_id)', 'vo_documents_project_vo_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'vo_payments')) is not null then
      execute format('create index if not exists %I on %I.vo_payments (project_id, vo_id)', 'vo_payments_project_vo_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'customer_decisions')) is not null then
      execute format('create index if not exists %I on %I.customer_decisions (project_id, order_index)', 'customer_decisions_project_order_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'defect_rounds')) is not null then
      execute format('create index if not exists %I on %I.defect_rounds (project_id, inspection_date desc)', 'defect_rounds_project_inspection_date_idx', v_schema);
      execute format('create index if not exists %I on %I.defect_rounds (project_id, status)', 'defect_rounds_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'defect_items')) is not null then
      execute format('create index if not exists %I on %I.defect_items (project_id, round_id)', 'defect_items_project_round_idx', v_schema);
      execute format('create index if not exists %I on %I.defect_items (project_id, status)', 'defect_items_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'defect_evidence')) is not null then
      execute format('create index if not exists %I on %I.defect_evidence (project_id, round_id)', 'defect_evidence_project_round_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'qc_checklists')) is not null then
      execute format('create index if not exists %I on %I.qc_checklists (project_id, inspection_date desc)', 'qc_checklists_project_inspection_date_idx', v_schema);
      execute format('create index if not exists %I on %I.qc_checklists (project_id, status)', 'qc_checklists_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'site_memos')) is not null then
      execute format('create index if not exists %I on %I.site_memos (project_id, updated_at desc)', 'site_memos_project_updated_at_idx', v_schema);
      execute format('create index if not exists %I on %I.site_memos (project_id, status)', 'site_memos_project_status_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'site_memo_evidence')) is not null then
      execute format('create index if not exists %I on %I.site_memo_evidence (project_id, memo_id)', 'site_memo_evidence_project_memo_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'site_notes')) is not null then
      execute format('create index if not exists %I on %I.site_notes (project_id, updated_at desc)', 'site_notes_project_updated_at_idx', v_schema);
      execute format('create index if not exists %I on %I.site_notes (project_id, archived)', 'site_notes_project_archived_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'project_lifecycle')) is not null then
      execute format('create index if not exists %I on %I.project_lifecycle (project_id)', 'project_lifecycle_project_idx', v_schema);
    end if;

    if to_regclass(format('%I.%I', v_schema, 'project_warranty')) is not null then
      execute format('create index if not exists %I on %I.project_warranty (project_id)', 'project_warranty_project_idx', v_schema);
    end if;
  end loop;
end $$;

create index if not exists projects_active_project_idx on public.projects (active, project_id);
create index if not exists user_project_access_email_active_idx on public.user_project_access (lower(email), active);
create index if not exists user_project_access_google_sub_active_idx on public.user_project_access (google_sub, active);
create index if not exists team_members_email_idx on public.team_members (lower(email));
create index if not exists notifications_project_created_at_idx on public.notifications (project_id, created_at desc);
create index if not exists notifications_target_email_created_at_idx on public.notifications (lower(target_email), created_at desc);
