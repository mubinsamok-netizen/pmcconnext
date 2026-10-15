-- Run in the master schema (public by default). Set search_path first when
-- SUPABASE_MASTER_SCHEMA points to a different schema.
create table if not exists schedule_templates (
  template_id text primary key,
  name text not null check (length(trim(name)) between 1 and 150),
  items_json text not null,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
alter table schedule_templates enable row level security;
revoke all on schedule_templates from anon, authenticated;
grant select, insert on schedule_templates to service_role;
notify pgrst, 'reload schema';
