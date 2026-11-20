/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

// Expose private read helpers only inside the test VM; production route exports stay unchanged.
function loadTs(relativePath, dependencies = {}, expose = [], env = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const input = fs.readFileSync(filename, "utf8");
  const parsed = ts.createSourceFile(filename, input, ts.ScriptTarget.Latest, true);
  const imports = new Set(parsed.statements.filter(ts.isImportDeclaration).map((node) => node.moduleSpecifier.text));
  const source = ts.transpileModule(input + (expose.length ? `\nexport { ${expose.join(", ")} };` : ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    exports: loaded.exports, module: loaded, Error, URL, performance,
    process: { env },
    ...globals,
    console: { ...console, warn() {} },
    require(name) {
      if ((name === "./projectListCache" || name === "@/lib/projectListCache") && !Object.hasOwn(dependencies, name)) return { invalidateProjectListForWrite() {}, readCachedProjectList: (load) => load(), readCachedProjectHealth: (_, load) => load() };
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      assert.ok(imports.has(name) || name === "react/jsx-runtime", `Unexpected dependency: ${name}`);
      // Unused UI, upload and notification imports are inert during read tests.
      return {};
    },
  }, { filename });
  return loaded.exports;
}

const project = { project_id: "P-1", name: "Project", site_sheet_id: "missing-sheet" };
const context = { project, siteSheetId: project.site_sheet_id, session: { user: {} } };
const rest = (backend = "supabase", fallback = "sheets") => loadTs("src/lib/supabaseRest.ts", {}, [], {
  DATA_BACKEND: backend, DATA_BACKEND_FALLBACK: fallback, SUPABASE_EXPERIMENTAL_SITE_READS: "true",
});

for (const mode of ["success", "empty", "fallback", "sheets", "disabled"]) {
  test(`shared schedule, documents and VO reads: ${mode}`, async () => {
    const rawReads = [];
    const primaryReads = [];
    const raw = async (table) => {
      rawReads.push(table);
      if (!["fallback", "sheets"].includes(mode)) throw new Error("Requested entity was not found.");
      return [{ project_id: "P-1", task_id: "TASK-1", marker: table }, { project_id: "OTHER", marker: "Other" }];
    };
    const primary = async (table) => {
      primaryReads.push(table);
      if (["fallback", "disabled"].includes(mode)) throw new Error("Supabase unavailable");
      return mode === "empty" ? [] : [{ project_id: "P-1", task_id: "TASK-1", marker: table }];
    };
    const deps = {
      "@/lib/supabaseRest": rest(mode === "sheets" ? "sheets" : "supabase", mode === "disabled" ? "none" : "sheets"),
      "@/lib/masterProjects": { getMasterProjects: async () => [project] },
      "@/lib/siteContext": { getProjectContext: async () => ({ sheetId: project.site_sheet_id }) },
      "@/lib/sheetsCrud": { findAllRaw: raw, findAll: raw },
      "@/lib/supabaseReadModel": {
        getSupabaseTasks: () => primary("Tasks"),
        getSupabaseMilestones: () => primary("Milestones"),
        getSupabaseProjectDocuments: () => primary("Project_Documents"),
      },
      "@/lib/supabaseCrud": {
        getSupabaseSiteConfig: (table) => ({ table }),
        findAllSupabase: (config) => primary(config.table),
      },
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/siteApi": { getSiteApiContext: async () => context, getErrorMessage: (error) => error.message },
    };
    const schedule = loadTs("src/lib/publicScheduleData.ts", deps);
    const documents = loadTs("src/app/api/sites/[projectId]/documents/route.ts", deps);
    const vo = loadTs("src/app/api/sites/[projectId]/variation-orders/route.ts", deps, ["getTaskRows", "getVoRows"]);
    const reads = [
      () => schedule.getPublicScheduleData("P-1").then((result) => result.tasks),
      () => vo.getTaskRows(context),
      ...["Variation_Orders", "VO_Items", "VO_Documents", "VO_Payments", "VO_Task_Links", "VO_Finance_Ledger"]
        .map((table) => () => vo.getVoRows(context, table)),
    ];
    for (const read of reads) {
      if (mode === "disabled") await assert.rejects(read, /Supabase unavailable/);
      else {
        const rows = await read();
        assert.equal(rows.length, mode === "empty" ? 0 : 1);
        assert.ok(rows.every((row) => row.project_id === undefined || row.project_id === "P-1"));
      }
    }
    const response = await documents.GET({}, { params: Promise.resolve({ projectId: "P-1" }) });
    assert.equal(response.status, mode === "disabled" ? 500 : 200);
    if (mode !== "disabled") assert.equal(response.body.data.length, mode === "empty" ? 0 : 1);
    if (["fallback", "sheets"].includes(mode)) assert.equal(rawReads.length, 10);
    else assert.equal(rawReads.length, 0);
    if (mode === "sheets") assert.equal(primaryReads.length, 0);
  });
}

test("VO reopen reads the same primary backend as create and edit with experimental reads off", async () => {
  const rows = [
    { item_id: "GROUP-TestbyZoneIdea", vo_id: "VO-TestbyZoneIdea", project_id: "P-1", row_type: "group_add", item_no: 1, sort_order: 1 },
    { item_id: "DETAIL-TestbyZoneIdea", vo_id: "VO-TestbyZoneIdea", project_id: "P-1", row_type: "detail", item_no: 2, parent_item_no: 1, sort_order: 2, description: "Before TestbyZoneIdea" },
  ];
  const api = loadTs("src/app/api/sites/[projectId]/variation-orders/route.ts", {
    "@/lib/supabaseRest": loadTs("src/lib/supabaseRest.ts", {}, [], {
      DATA_BACKEND: "supabase", SUPABASE_EXPERIMENTAL_SITE_READS: "false",
    }),
    "@/lib/sheetsCrud": { findAllRaw: async () => { throw new Error("Stale Sheets source must not be read"); } },
    "@/lib/supabaseCrud": {
      getSupabaseSiteConfig: (table) => ({ table }),
      findAllSupabase: async (config, projectId) => {
        assert.equal(projectId, "P-1");
        return config.table === "VO_Items" ? rows : [{ vo_id: "VO-TestbyZoneIdea", project_id: "P-1" }];
      },
    },
    "@/lib/variationOrders": { numberValue: Number },
  }, ["getVoRows"]);
  assert.equal((await api.getVoRows(context, "Variation_Orders"))[0].vo_id, "VO-TestbyZoneIdea");
  for (const description of ["Before TestbyZoneIdea", "After TestbyZoneIdea"]) {
    rows[1].description = description;
    const items = await api.getVoRows(context, "VO_Items");
    assert.equal(items.length, 2);
    assert.equal(items[1].row_type, "detail");
    assert.equal(items[1].parent_item_no, items[0].item_no);
    assert.equal(items[1].description, description);
  }
});

test("site overview and project progress retain Supabase task counts when Sheets is unavailable", async () => {
  let batches = 0;
  let sheetReads = 0;
  const tasks = [
    { project_id: "P-1", task_id: "TASK-1", name: "Work", percent_done: "50", task_type: "subtask" },
    { project_id: "OTHER", task_id: "TASK-2", percent_done: "100" },
  ];
  const deps = {
    "@/lib/supabaseRest": rest(),
    "@/lib/projectLifecycle": loadTs("src/lib/projectLifecycle.ts"),
    "@/lib/siteContext": { getProjectContext: async () => ({ sheetId: project.site_sheet_id }) },
    "@/lib/sheetsSetup": { ensureSchema: async () => { sheetReads++; throw new Error("Missing sheet"); } },
    "@/lib/sheetsCrud": {
      findAllBatch: async () => { batches++; return { Tasks: tasks }; },
      findAllRaw: async () => { sheetReads++; throw new Error("Requested entity was not found."); },
    },
  };
  const overview = loadTs("src/app/dashboard/sites/[projectId]/overviewData.ts", deps, ["getDashboardData"]);
  const projects = loadTs("src/app/api/projects/route.ts", deps, ["enrichProjectWithHealth"]);
  const dashboard = await overview.getDashboardData(project);
  assert.equal(dashboard.error, "");
  assert.equal(dashboard.planning.workTaskCount, 1);
  assert.equal(dashboard.planning.averageProgress, 50);
  const health = await projects.enrichProjectWithHealth(project);
  assert.equal(health.tasks_count, "1");
  assert.equal(health.percent_done, "50");
  assert.equal(health.progress_source, "tasks");
  assert.equal(batches, 2);
  assert.equal(sheetReads, 0);
});

for (const backend of ["supabase", "sheets"]) {
  test(`public VO approval uses ${backend} items and still validates token and project`, async () => {
    const calls = { schema: 0, raw: 0 };
    const vo = { project_id: "P-1", vo_id: "VO-1", _rowIndex: "VO-1", approval_token: "valid-token" };
    const items = [
      { project_id: "P-1", vo_id: "VO-1", item_id: "ITEM-2", item_no: 2 },
      { project_id: "OTHER", vo_id: "VO-1", item_id: "OTHER", item_no: 0 },
      { project_id: "P-1", vo_id: "VO-1", item_id: "ITEM-1", item_no: 1 },
    ];
    const ensure = async () => {
      calls.schema++;
      if (backend === "supabase") throw new Error("Requested entity was not found.");
      return { success: true };
    };
    const route = loadTs("src/app/api/variation-order-approval/[projectId]/[token]/route.ts", {
      "@/lib/supabaseRest": rest(backend),
      "@/lib/sheetsSetup": { ensureSchema: ensure, ensureMasterSchema: ensure },
      "@/lib/variationOrders": { numberValue: (value) => Number(value || 0) },
      "@/lib/sheetsCrud": {
        findAllMaster: async () => [project],
        findAll: async (table) => table === "Variation_Orders" ? [vo] : table === "VO_Items" ? items : [],
        findAllRaw: async () => {
          calls.raw++;
          if (backend === "supabase") throw new Error("Requested entity was not found.");
          return items;
        },
      },
    }, ["getPublicContext"]);
    const result = await route.getPublicContext("P-1", "valid-token");
    assert.equal(result.error, undefined);
    assert.deepEqual(Array.from(result.items, (item) => item.item_id), ["ITEM-1", "ITEM-2"]);
    assert.equal(calls.schema, backend === "supabase" ? 0 : 2);
    assert.equal(calls.raw, backend === "supabase" ? 0 : 1);
    const denied = await route.getPublicContext("P-1", "invalid-token");
    assert.equal(denied.status, 404);
    if (backend === "supabase") {
      items.length = 0;
      const empty = await route.getPublicContext("P-1", "valid-token");
      assert.equal(empty.error, undefined);
      assert.equal(empty.items.length, 0);
      assert.equal(calls.schema, 0);
      assert.equal(calls.raw, 0);
    }
  });
}

test("VO list skips Tasks and the protected plan view returns only selector fields", async () => {
  const reads = [];
  let canPlan = true;
  const api = loadTs("src/app/api/sites/[projectId]/variation-orders/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, headers: new Headers(), status: options?.status || 200 }) } },
    "@/lib/siteApi": { getSiteApiContext: async () => context, getErrorMessage: (error) => error.message },
    "@/lib/permissions": { hasPermission: () => canPlan, permissionDeniedMessage: () => "Denied" },
    "@/lib/supabaseRest": rest("sheets"),
    "@/lib/sheetsCrud": {
      findAllMaster: async (_table, reportSource) => { reportSource("sheets"); return []; },
      findAllRaw: async (table) => {
        reads.push(table);
        return table === "Tasks" ? [
          { project_id: "P-1", task_id: "T1", name: "Heading", task_type: "heading", parent_task_id: "", order_index: "1", notes: "unused" },
          { project_id: "OTHER", task_id: "T2" },
        ] : [];
      },
    },
  });
  const request = (suffix = "") => api.GET({ url: `http://localhost/api/vo${suffix}` }, { params: Promise.resolve({ projectId: "P-1" }) });
  const list = await request();
  assert.equal(list.status, 200);
  assert.equal(Object.hasOwn(list.body, "tasks"), false);
  assert.equal(reads.includes("Tasks"), false);
  assert.match(list.headers.get("Server-Timing"), /audit_logs;dur=.*desc="sheets"/);
  canPlan = false;
  assert.equal((await request("?view=plan-tasks")).status, 403);
  assert.equal(reads.includes("Tasks"), false);
  canPlan = true;
  const options = await request("?view=plan-tasks");
  assert.equal(options.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(options.body.data)), [
    { task_id: "T1", name: "Heading", task_type: "heading", parent_task_id: "", order_index: "1" },
  ]);
  assert.match(options.headers.get("Server-Timing"), /tasks;dur=.*desc="sheets"/);
});

test("Defect reads only authorized site data and does not read master Audit Logs", async () => {
  let allowed = false;
  const reads = [];
  const route = loadTs("src/app/api/sites/[projectId]/defects/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, headers: new Headers(), status: options?.status || 200 }) } },
    "@/lib/siteApi": { getSiteApiContext: async () => allowed ? context : { error: "Forbidden", status: 403 } },
    "@/lib/sheetsCrud": {
      findAllBatch: async (tables, sheet, options) => {
        assert.equal(sheet, project.site_sheet_id);
        assert.equal(options.projectId, project.project_id);
        reads.push(...tables);
        for (const table of tables) options.onSource(table, "sheets");
        return { Defect_Rounds: [{ project_id: "P-1" }, { project_id: "OTHER" }] };
      },
      findAllMaster: () => { throw new Error("Unexpected Audit Logs read"); },
    },
  });

  const get = () => route.GET({}, { params: Promise.resolve({ projectId: "P-1" }) });
  assert.equal((await get()).status, 403);
  assert.equal(reads.length, 0);

  allowed = true;
  const result = await get();
  assert.equal(result.status, 200);
  assert.equal(result.body.rounds.length, 1);
  assert.equal(Object.hasOwn(result.body, "audit_logs"), false);
  assert.deepEqual(reads, ["Defect_Rounds", "Defect_Items", "Defect_Evidence"]);
  assert.match(result.headers.get("Server-Timing"), /site_context;.*defect_read;.*Defect_Rounds=sheets.*prepare;.*total;/);
});

test("a blocked Drive response confirms the reserved document without sending the PDF again", async () => {
  const calls = [];
  const reserved = "DriveTestbyZoneIdea";
  let completeAttempts = 0;
  const client = loadTs("src/lib/directDriveDocumentUpload.ts", {
    "@/lib/directDriveNoteUpload": {
      uploadDriveFile: async () => {
        calls.push("drive_put");
        throw new Error("CORS");
      },
    },
    "@/lib/attachmentUpload": { validateAttachmentRequest: () => assert.fail("Unexpected fallback upload") },
  }, [], {}, {
    fetch: async (_url, request) => {
      const body = JSON.parse(request.body);
      calls.push(body.action);
      assert.equal(body.verify_upload, true);
      if (body.action === "create_upload_session") return {
        ok: true, json: async () => ({ data: { upload_url: "https://example.invalid/upload", drive_file_id: reserved } }),
      };
      assert.equal(body.drive_file_id, reserved);
      assert.equal(body.drive_url, undefined);
      completeAttempts++;
      return completeAttempts === 1
        ? { ok: false, json: async () => ({ error: "Not visible yet" }) }
        : { ok: true, json: async () => ({ data: { document_id: "DOC-TestbyZoneIdea" } }) };
    },
  });
  let retry;
  const input = {
    endpoint: "/test", category: "report", title: "TestbyZoneIdea", notes: "",
    file: { name: "TestbyZoneIdea.pdf", type: "application/pdf", size: 5_100_000 },
    onProgress() {}, onConfirmReady(confirm) { retry = confirm; },
  };
  const preparedSession = client.prepareDocumentUpload(input, true);
  await preparedSession;
  assert.deepEqual(calls, ["create_upload_session"]);
  await assert.rejects(client.uploadProjectDocumentDirectly({ ...input, preparedSession }), /Not visible yet/);
  assert.equal((await retry()).document_id, "DOC-TestbyZoneIdea");
  assert.deepEqual(calls, ["create_upload_session", "drive_put", "complete_upload", "complete_upload"]);
});
