-- Supabase site-schema mode
-- Run this once in the Supabase SQL editor before enabling SUPABASE_SITE_SCHEMA_MODE.
--
-- Important:
-- - The app uses the Supabase REST API. Any per-site schema that the app reads/writes
--   must be added to Supabase API > Exposed schemas, or handled through RPC instead.
-- - This script clones table structure from the current public site tables.
-- - Existing rows are not moved by create_site_schema(); use migrate_project_to_site_schema()
--   when moving an existing project from public combined tables.

create or replace function public.site_schema_name(p_project_id text)
returns text
language sql
immutable
as $$
  select left(
    'site_' || trim(both '_' from regexp_replace(lower(coalesce(p_project_id, '')), '[^a-z0-9]+', '_', 'g')),
    63
  );
$$;

create or replace function public.site_table_names()
returns text[]
language sql
immutable
as $$
  select array[
    'tasks',
    'milestones',
    'budget',
    'materials',
    'issues',
    'daily_reports',
    'weekly_reports',
    'monthly_reports',
    'project_documents',
    'project_lifecycle',
    'project_warranty',
    'customer_decisions',
    'defect_rounds',
    'defect_items',
    'defect_evidence',
    'qc_checklists',
    'site_memos',
    'site_memo_evidence',
    'variation_orders',
    'vo_items',
    'vo_documents',
    'vo_payments',
    'vo_task_links',
    'vo_finance_ledger',
    'site_notes'
  ];
$$;

create or replace function public.create_site_schema(p_project_id text, p_schema_name text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schema text := coalesce(nullif(p_schema_name, ''), public.site_schema_name(p_project_id));
  v_table text;
  v_exposed_schemas text;
begin
  if coalesce(p_project_id, '') = '' or v_schema = 'site_' then
    raise exception 'project_id is required';
  end if;

  execute format('create schema if not exists %I', v_schema);
  execute format('grant usage on schema %I to anon, authenticated, service_role', v_schema);

  foreach v_table in array public.site_table_names()
  loop
    execute format(
      'create table if not exists %I.%I (like public.%I including all)',
      v_schema,
      v_table,
      v_table
    );
  end loop;

  execute format('grant all on all tables in schema %I to anon, authenticated, service_role', v_schema);
  execute format('grant all on all routines in schema %I to anon, authenticated, service_role', v_schema);
  execute format('grant all on all sequences in schema %I to anon, authenticated, service_role', v_schema);
  execute format('alter default privileges for role postgres in schema %I grant all on tables to anon, authenticated, service_role', v_schema);
  execute format('alter default privileges for role postgres in schema %I grant all on routines to anon, authenticated, service_role', v_schema);
  execute format('alter default privileges for role postgres in schema %I grant all on sequences to anon, authenticated, service_role', v_schema);

  update public.projects
  set site_sheet_id = v_schema
  where project_id = p_project_id
    and coalesce(site_sheet_id, '') = '';

  select string_agg(schema_name, ', ' order by
    case schema_name
      when 'public' then 0
      when 'graphql_public' then 1
      when 'storage' then 2
      else 3
    end,
    schema_name
  )
  into v_exposed_schemas
  from information_schema.schemata
  where schema_name in ('public', 'graphql_public', 'storage')
     or schema_name like 'site_%';

  execute format('alter role authenticator set pgrst.db_schemas = %L', v_exposed_schemas);
  notify pgrst, 'reload config';
  notify pgrst, 'reload schema';

  return v_schema;
end;
$$;

create or replace function public.migrate_project_to_site_schema(p_project_id text, p_schema_name text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schema text := public.create_site_schema(p_project_id, p_schema_name);
  v_table text;
begin
  foreach v_table in array public.site_table_names()
  loop
    execute format(
      'insert into %I.%I select * from public.%I where project_id = $1 on conflict do nothing',
      v_schema,
      v_table,
      v_table
    )
    using p_project_id;
  end loop;

  update public.projects
  set site_sheet_id = v_schema
  where project_id = p_project_id;

  return v_schema;
end;
$$;
