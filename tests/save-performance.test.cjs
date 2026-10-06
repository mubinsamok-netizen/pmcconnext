/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function loadTs(relativePath, dependencies) {
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
    process: { env: {} },
    Buffer,
    File,
  }, { filename });
  return loaded.exports;
}

function crudFixture({ supabase = true, fallback = true, fail = false } = {}) {
  const calls = [];
  const failure = new Error("Database unavailable");
  const write = async () => {
    calls.push("supabase");
    if (fail) throw failure;
    return { success: true };
  };
  const crud = loadTs("src/lib/sheetsCrud.ts", {
    "./google": {
      MASTER_SHEET_ID: "master", SHEET_ID: "site",
      sheets: { spreadsheets: {
        values: { batchUpdate: async (request) => calls.push(request) },
        get: async () => ({ data: { sheets: [{ properties: { title: "Tasks", sheetId: 7 } }] } }),
        batchUpdate: async (request) => calls.push(request),
      } },
    },
    "./sheetsSetup": { MASTER_SCHEMA: {}, SITE_SCHEMA: { Tasks: ["task_id", "name", "updated_at"] } },
    "./supabaseCrud": { getSupabaseSiteConfig: () => ({}), updateSupabase: write, deleteSupabase: write },
    "./supabaseRest": { isSupabaseBackend: () => supabase, shouldFallbackToSheets: () => fallback },
    "./supabaseSchema": { isSupabaseSiteSchemaMode: () => false },
  });
  const resolveRow = async () => { calls.push("resolve-sheet-row"); return 4; };
  return { crud, calls, resolveRow, failure };
}

for (const operation of ["update", "deleteRow"]) {
  const run = (fixture, resolveRow = fixture.resolveRow) => operation === "update"
    ? fixture.crud.update("Tasks", "TASK-1", { name: "Updated" }, "site", resolveRow)
    : fixture.crud.deleteRow("Tasks", "TASK-1", "site", resolveRow);

  test(`${operation}: successful Supabase write never waits for Sheets`, async () => {
    const fixture = crudFixture();
    await run(fixture, async () => { throw new Error("Sheets must not be contacted"); });
    assert.deepEqual(fixture.calls, ["supabase"]);
  });

  test(`${operation}: failed Supabase write resolves the legacy row only afterwards`, async () => {
    const fixture = crudFixture({ fail: true });
    await run(fixture);
    assert.deepEqual(fixture.calls.slice(0, 2), ["supabase", "resolve-sheet-row"]);
    const request = fixture.calls[2].requestBody;
    if (operation === "update") assert.equal(request.data[0].range, "Tasks!B4");
    else assert.equal(request.requests[0].deleteDimension.range.startIndex, 3);
  });

  test(`${operation}: disabled fallback preserves the database error without reading Sheets`, async () => {
    const fixture = crudFixture({ fail: true, fallback: false });
    await assert.rejects(run(fixture), (error) => error === fixture.failure);
    assert.deepEqual(fixture.calls, ["supabase"]);
  });

  test(`${operation}: Sheets backend still resolves and writes the correct row`, async () => {
    const fixture = crudFixture({ supabase: false });
    await run(fixture);
    assert.equal(fixture.calls[0], "resolve-sheet-row");
    assert.equal(fixture.calls.length, 2);
  });

  test(`${operation}: numeric legacy row arguments remain supported`, async () => {
    const fixture = crudFixture({ supabase: false });
    await run(fixture, 4);
    assert.equal(fixture.calls.length, 1);
  });
}

test("editing a Memo reads only memos and returns the saved record after audit succeeds", async () => {
  const reads = [];
  const writes = [];
  const memo = { memo_id: "MEMO-1", project_id: "P-1", _rowIndex: "MEMO-1", title: "Old", attachments_json: "[]" };
  const route = loadTs("src/app/api/sites/[projectId]/memos/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "@/lib/auditLog": { writeAuditLog: async () => writes.push("audit") },
    "@/lib/drive": {}, "@/lib/line": {}, "@/lib/pdfRenderer": {}, "@/lib/publicUrl": {},
    "@/lib/permissions": { hasPermission: () => true },
    "@/lib/variationOrders": {},
    "@/lib/sheetsCrud": {
      findAll: async (table) => { reads.push(table); return [memo]; },
      update: async (_table, id, patch, _sheet, fallback) => {
        assert.equal(id, "MEMO-1");
        assert.equal(patch.title, "New");
        assert.equal(typeof fallback, "function");
        writes.push("update");
      },
    },
    "@/lib/siteApi": {
      getSiteApiContext: async () => ({ session: { user: {} }, project: { project_id: "P-1" }, siteSheetId: "site" }),
      getErrorMessage: (error) => error.message,
    },
    "@/lib/siteMemos": {
      textValue: (value) => String(value || "").trim(),
      boolText: (value) => value ? "TRUE" : "FALSE",
      numberValue: (value) => Number(value || 0),
      parseMemoAttachments: JSON.parse,
      safeJsonStringify: JSON.stringify,
      todayBangkok: () => "2026-09-08",
    },
  });
  const response = await route.POST({ json: async () => ({ action: "update_memo", memo_id: "MEMO-1", title: "New", detail: "Updated details" }) }, { params: Promise.resolve({ projectId: "P-1" }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.title, "New");
  assert.ok(response.body.data.updated_at);
  assert.deepEqual(reads, ["Site_Memos"]);
  assert.deepEqual(writes, ["update", "audit"]);
});

for (const databaseFails of [false, true]) {
  test(`editing a VO preserves totals and items using only two table groups (fallback=${databaseFails})`, async () => {
    const reads = [];
    const writes = [];
    const tables = {
      Variation_Orders: [{ vo_id: "VO-1", project_id: "P-1", _rowIndex: "VO-1", status: "draft", revision_no: "0" }],
      VO_Items: [{ item_id: "ITEM-1", vo_id: "VO-1", project_id: "P-1", _rowIndex: "ITEM-1", item_no: 1 }],
    };
    const read = async (table, backend) => {
      assert.ok(Object.hasOwn(tables, table), `Unnecessary table read: ${table}`);
      reads.push(`${backend}:${table}`);
      if (backend === "supabase" && databaseFails) throw new Error("Supabase unavailable");
      return tables[table];
    };
    const helpers = loadTs("src/lib/variationOrders.ts", {
      "@/lib/bangkokDateTime": {}, "@/lib/lineFlexTheme": {},
    });
    const route = loadTs("src/app/api/sites/[projectId]/variation-orders/route.ts", {
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/drive": {}, "@/lib/line": {}, "@/lib/pdfRenderer": {}, "@/lib/publicUrl": {},
      "@/lib/variationOrderDocuments": {}, "@/lib/supabaseReadModel": {},
      "@/lib/permissions": { hasPermission: () => true },
      "@/lib/variationOrders": helpers,
      "@/lib/auditLog": { writeAuditLog: async () => writes.push({ table: "audit" }) },
      "@/lib/siteApi": {
        getSiteApiContext: async () => ({ session: { user: {} }, project: { project_id: "P-1", client: "Client" }, siteSheetId: "site" }),
        getErrorMessage: (error) => error.message,
      },
      "@/lib/supabaseRest": {
        isSupabaseReadEnabled: () => true,
        readWithSheetsFallback: async (_label, primary, fallback) => {
          try { return await primary(); } catch { return fallback(); }
        },
      },
      "@/lib/supabaseCrud": {
        getSupabaseSiteConfig: (table) => ({ table }),
        findAllSupabase: (config) => read(config.table, "supabase"),
      },
      "@/lib/sheetsCrud": {
        findAllRaw: (table) => read(table, "sheets"),
        update: async (table, id, patch, _sheet, fallback) => {
          assert.equal(typeof fallback, "function");
          writes.push({ table, id, patch });
        },
      },
    });
    const response = await route.POST({ json: async () => ({
      action: "update_vo", vo_id: "VO-1", title: "Updated VO", vo_type: "VO+",
      items: [{ description: "Work", quantity: 2, unit_price: 150, unit: "job" }],
    }) }, { params: Promise.resolve({ projectId: "P-1" }) });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.grand_total, 300);
    assert.equal(response.body.data.revision_no, "1");
    assert.deepEqual(writes.map((write) => write.table), ["Variation_Orders", "VO_Items", "audit"]);
    assert.equal(writes[1].id, "ITEM-1");
    assert.equal(writes[1].patch.amount, 300);
    assert.equal(reads.length, databaseFails ? 4 : 2);
  });
}
