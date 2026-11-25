# VO plan task options

The authenticated VO list GET returns VO data, documents, payments, task links,
ledger and audit history. The screen requests plan choices only when a user
with plan permission opens the plan tab.

`GET /api/sites/{projectId}/variation-orders?view=plan-tasks` requires site
access and `vo.addToPlan`. Its successful JSON response contains
`success: true` and a `data` array. Each row includes `task_id`, `name`,
`task_type`, `parent_task_id`, and `order_index` when present. Supabase
selects those fields. The Sheets fallback projects them after reading the
site task rows. The add-to-plan action retains its existing read and validation.

Both GET views expose `Server-Timing`. Read durations have source descriptions
where applicable. Parallel read durations overlap and should not be added.
