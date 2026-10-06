/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function loadTs(relativePath, dependencies = {}, env = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    exports: loaded.exports,
    module: loaded,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console: { ...console, warn() {} },
    process: { env },
    URL,
    Error,
  }, { filename });
  return loaded.exports;
}

function fixture({ backend = "supabase", fallback = "sheets", databaseFails = false, sheetsAvailable = false } = {}) {
  const rows = [];
  const calls = { sheets: 0, schema: 0, writes: 0, deleted: [] };
  const template = loadTs("src/lib/scheduleTemplateData.ts");
  const rest = loadTs("src/lib/supabaseRest.ts", {}, {
    DATA_BACKEND: backend,
    DATA_BACKEND_FALLBACK: fallback,
    SUPABASE_EXPERIMENTAL_SITE_READS: "true",
  });
  const dependencies = {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "@/lib/sheetsCrud": {
      findAllRaw: async () => {
        calls.sheets++;
        if (!sheetsAvailable) throw new Error("Requested entity was not found.");
        return rows.map((row) => ({ ...row }));
      },
      insertMany: async (_table, added) => {
        calls.writes++;
        rows.push(...added);
        return { inserted: added };
      },
      insert: async (_table, row) => {
        calls.writes++;
        rows.push(row);
        return { inserted: row };
      },
      deleteRow: async (_table, id) => { calls.deleted.push(id); },
    },
    "@/lib/sheetsSetup": { ensureSchema: async () => { calls.schema++; } },
    "@/lib/siteContext": { getProjectContext: async () => ({ sheetId: "missing-legacy-sheet" }) },
    "@/lib/scheduleTemplateData": template,
    "@/lib/supabaseRest": rest,
    "@/lib/supabaseReadModel": {
      getSupabaseTasks: async (projectId) => {
        if (databaseFails) throw new Error("Supabase unavailable");
        return rows.filter((row) => row.project_id === projectId).map((row) => ({ ...row }));
      },
    },
  };
  return {
    rows, calls, template,
    tasks: loadTs("src/app/api/tasks/route.ts", dependencies),
    importer: loadTs("src/app/api/tasks/template/route.ts", dependencies),
  };
}

const importRequest = () => ({ json: async () => ({ project_id: "P-1", import_all: true }) });
const listRequest = { url: "http://localhost/api/tasks?project_id=P-1" };

test("full schedule creation and reload succeed with a missing legacy sheet; repeating import reuses tasks", async () => {
  const f = fixture();
  const empty = await f.tasks.GET(listRequest);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data.length, 0);
  const created = await f.importer.POST(importRequest());
  assert.equal(created.status, 200);
  assert.equal(created.body.count, f.template.SCHEDULE_TEMPLATE_TASKS.length);
  assert.ok(created.body.count > 0);
  const ids = new Set(f.rows.map((row) => row.task_id));
  assert.equal(ids.size, f.rows.length);
  for (const row of f.rows) {
    assert.equal(row.project_id, "P-1");
    if (row.parent_task_id) assert.ok(ids.has(row.parent_task_id));
  }
  const listed = await f.tasks.GET(listRequest);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, created.body.count);
  const repeated = await f.importer.POST(importRequest());
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.count, 0);
  assert.equal(repeated.body.reused_count, created.body.count);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.sheets, 0);
  assert.equal(f.calls.schema, 0);
});

test("individual task creation and subtree deletion do not require the legacy sheet", async () => {
  const f = fixture();
  f.rows.push({ project_id: "P-1", task_id: "ROOT", name: "Root" });
  const created = await f.tasks.POST({ json: async () => ({ project_id: "P-1", name: "Child", parent_task_id: "ROOT" }) });
  assert.equal(created.status, 200);
  assert.equal(created.body.data.order_index, "2");
  const removed = await f.tasks.DELETE({ url: "http://localhost/api/tasks?project_id=P-1&task_id=ROOT" });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.deleted_count, 2);
  assert.deepEqual(f.calls.deleted, [created.body.data.task_id, "ROOT"]);
  assert.equal(f.calls.sheets, 0);
});

for (const mode of ["sheets", "fallback"]) {
  test(`${mode}: schedule import and project filtering still work with Sheets`, async () => {
    const f = fixture({ backend: mode === "sheets" ? "sheets" : "supabase", databaseFails: true, sheetsAvailable: true });
    f.rows.push({ project_id: "OTHER", task_id: "OTHER-TASK", name: "Other project" });
    const result = await f.importer.POST(importRequest());
    assert.equal(result.status, 200);
    assert.equal(result.body.count, f.template.SCHEDULE_TEMPLATE_TASKS.length);
    const listed = await f.tasks.GET(listRequest);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, result.body.count);
    assert.ok(listed.body.data.every((row) => row.project_id === "P-1"));
    assert.equal(f.calls.sheets, 2);
  });
}

test("disabled fallback preserves Supabase failure and does not create a schedule", async () => {
  const f = fixture({ fallback: "none", databaseFails: true });
  const result = await f.importer.POST(importRequest());
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "Supabase unavailable");
  assert.equal(f.calls.sheets, 0);
  assert.equal(f.calls.writes, 0);
});

test("when both backends fail, schedule creation reports failure without inserting tasks", async () => {
  const f = fixture({ databaseFails: true });
  const result = await f.importer.POST(importRequest());
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "Requested entity was not found.");
  assert.equal(f.calls.sheets, 1);
  assert.equal(f.calls.writes, 0);
});
