/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, URL, Error, SyntaxError });
  return exports;
}
const helpers = load("src/lib/scheduleTemplates.ts");
const builtin = load("src/lib/scheduleTemplateData.ts");
const root = { id: "r", name: "หัวข้อใหม่", notes: "", parentId: "", type: "heading" };
const child = { id: "c", name: "รายการงาน", notes: "ตรวจแบบ", parentId: "r", type: "subtask" };
const snapshot = (value) => JSON.parse(JSON.stringify(value));

test("standard template can be edited, validated and stored within the Sheets cell limit", () => {
  const items = builtin.SCHEDULE_TEMPLATE_TASKS.map((t) => ({ id: t.templateId, name: t.name, notes: t.notes, parentId: t.parentTemplateId, type: t.taskType }));
  const validated = helpers.validateTemplateItems(items);
  const encoded = helpers.encodeTemplateItems(validated);
  assert.ok(encoded.length < 45000);
  assert.deepEqual(snapshot(helpers.decodeTemplateItems(encoded)), snapshot(validated));
});

test("custom template preserves nested order, renames categories and removes whole subtrees", () => {
  const nested = { id: "nested", name: "หัวข้อย่อย", notes: "", parentId: "r", type: "heading" };
  const items = helpers.validateTemplateItems([{ ...child, parentId: "nested" }, root, nested]);
  const structure = helpers.templateStructure(items);
  assert.deepEqual(snapshot(structure.tasks.map((t) => t.templateId)), ["r", "nested", "c"]);
  assert.equal(structure.categories[0].name, root.name);
  assert.equal(structure.categories[0].taskCount, 3);
  assert.deepEqual(snapshot(helpers.removeTemplateBranch(items, "nested")), [root]);
});

test("rejects empty names, duplicates, cycles and missing or non-heading parents", () => {
  for (const invalid of [[], [{ ...root, name: " " }], [root, root],
    [root, { ...child, parentId: "missing" }],
    [{ ...root, parentId: "r" }], [root, child, { ...root, id: "x", parentId: "c" }]]) {
    assert.throws(() => helpers.validateTemplateItems(invalid));
  }
});

test("capturing a project excludes progress, dates, assignments and project identifiers", () => {
  const captured = helpers.projectTemplateItems([{ task_id: "r", name: "Group", task_type: "heading" }, {
    task_id: "c", name: "Task", parent_task_id: "r", notes: "Note", project_id: "private-project", percent_done: "80", start: "2026-10-01", assignee: "Someone",
  }]);
  assert.deepEqual(Object.keys(captured[1]).sort(), ["id", "name", "notes", "parentId", "type"].sort());
  assert.equal(captured[1].parentId, "r");
});

function apiFixture() {
  const saved = [];
  let session = { user: { email: "test@example.com" } };
  const json = (body, opts) => ({ body, status: opts?.status || 200 });
  const api = load("src/app/api/schedule-templates/route.ts", {
    "node:crypto": require("node:crypto"), "next/server": { NextResponse: { json } },
    "next-auth": { getServerSession: async () => session }, "@/lib/authOptions": { authOptions: {} },
    "@/lib/scheduleTemplates": helpers,
    "@/lib/scheduleTemplateStore": { listSavedScheduleTemplates: async () => saved, saveScheduleTemplate: async (t) => saved.push(t) },
  });
  return { api, saved, json, logout: () => { session = null; } };
}

test("save, reload and save-as preserve the original template; unauthorized and invalid saves do not write", async () => {
  const f = apiFixture();
  const request = (items, name = "บ้าน 2 ชั้น") => ({ json: async () => ({ name, items }) });
  const created = await f.api.POST(request([root, child]));
  assert.equal(created.status, 201);
  const changed = await f.api.POST(request([{ ...root, name: "เปลี่ยนชื่อ" }, child]));
  assert.notEqual(changed.body.data.id, created.body.data.id);
  const reloaded = await f.api.GET();
  assert.equal(reloaded.body.data[0].items[0].name, root.name);
  assert.equal(reloaded.body.data.length, 2);
  assert.equal((await f.api.POST(request([root], " "))).status, 400);
  f.logout();
  assert.equal((await f.api.GET()).status, 401);
  assert.equal((await f.api.POST(request([root]))).status, 401);
  assert.equal(f.saved.length, 2);
});

test("saved template imports into another project with fresh IDs and clean progress; repeat import reuses it", async () => {
  const f = apiFixture();
  const created = await f.api.POST({ json: async () => ({ name: "Custom", items: [root, child, { ...child, id: "duplicate-name" }] }) });
  const rows = [];
  let forbidden = false;
  const api = load("src/app/api/tasks/template/route.ts", {
    "node:crypto": require("node:crypto"), "next/server": { NextResponse: { json: f.json } },
    "@/lib/siteApi": { getSiteApiContext: async () => forbidden ? { error: "Forbidden", status: 403 } : {} },
    "@/lib/sheetsCrud": { findAllRaw: async () => rows, insertMany: async (_table, added) => { rows.push(...added); return { inserted: added }; } },
    "@/lib/sheetsSetup": { ensureSchema: async () => {} }, "@/lib/siteContext": { getProjectContext: async () => ({ sheetId: "test" }) },
    "@/lib/scheduleTemplateData": builtin, "@/lib/scheduleTemplates": helpers,
    "@/lib/scheduleTemplateStore": { listSavedScheduleTemplates: async () => f.saved },
    "@/lib/supabaseRest": { isSupabaseBackend: () => false, isSupabaseReadEnabled: () => false },
    "@/lib/supabaseReadModel": {},
  });
  const req = (templateId = created.body.data.id) => ({ json: async () => ({ project_id: "NEW-PROJECT", template_id: templateId, category_ids: ["r", "r"] }) });
  assert.equal((await api.POST(req())).body.count, 3);
  assert.equal(rows[1].parent_task_id, rows[0].task_id);
  assert.notEqual(rows[0].task_id, "r");
  assert.equal(rows[1].category, root.name);
  assert.equal(rows[1].start, "");
  assert.equal(rows[1].percent_done, "0");
  assert.equal(rows[1].project_id, "NEW-PROJECT");
  assert.equal((await api.POST(req())).body.count, 0);
  assert.notEqual(rows[1].task_id, rows[2].task_id);
  assert.equal((await api.POST(req("unknown"))).status, 404);
  forbidden = true;
  assert.equal((await api.POST(req())).status, 403);
  assert.equal(rows.length, 3);
});
