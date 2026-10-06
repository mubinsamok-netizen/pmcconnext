-- Adds spreadsheet-style VO rows to the legacy public tables and every site schema.
do $$
declare
  v_schema text;
begin
  for v_schema in
    select schema_name
    from information_schema.schemata
    where schema_name = 'public' or schema_name like 'site\_%' escape '\'
  loop
    if to_regclass(format('%I.vo_items', v_schema)) is null then
      continue;
    end if;

    execute format('alter table %I.vo_items add column if not exists sort_order integer', v_schema);
    execute format('alter table %I.vo_items add column if not exists row_type text not null default ''group''', v_schema);
    execute format('alter table %I.vo_items add column if not exists parent_item_no numeric', v_schema);
    execute format('alter table %I.vo_items add column if not exists material_unit_price numeric', v_schema);
    execute format('alter table %I.vo_items add column if not exists material_amount numeric', v_schema);
    execute format('alter table %I.vo_items add column if not exists labor_unit_price numeric', v_schema);
    execute format('alter table %I.vo_items add column if not exists labor_amount numeric', v_schema);
    execute format('update %I.vo_items set sort_order = coalesce(sort_order, item_no, 0)', v_schema);
  end loop;
end $$;
