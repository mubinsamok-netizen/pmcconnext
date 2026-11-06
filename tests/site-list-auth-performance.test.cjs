/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function loadTs(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports, URL, URLSearchParams, Error,
    console: { ...console, error() {}, warn() {} }, process: { env: {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return loaded.exports;
}

function projectRoute({ authenticated = true, backend = "supabase" } = {}) {
  const projects = Array.from({ length: 22 }, (_, index) => ({
    project_id: `P-${index + 1}`, site_sheet_id: `P-${index + 1}`, name: `Site ${index + 1}`, active: index === 21 ? "FALSE" : "TRUE",
  }));
  const reads = [];
  let projectReads = 0;
  const route = loadTs("src/app/api/projects/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "next-auth": { getServerSession: async () => authenticated ? { user: { role: "Staff" } } : null },
    "@/lib/authOptions": {},
    "@/lib/authz": { filterProjectsForUser: async (rows) => rows.filter((row) => row.project_id !== "P-21") },
    "@/lib/siteAccess": {}, "@/lib/drive": {}, "@/lib/google": {},
    "@/lib/siteContext": { getProjectContext: async () => { throw new Error("Must reuse the authorized project instead of reading master projects again"); } },
    "@/lib/projectLifecycle": loadTs("src/lib/projectLifecycle.ts"),
    "@/lib/supabaseRest": { isSupabaseBackend: () => backend === "supabase", isSupabaseReadEnabled: () => backend === "supabase", readWithSheetsFallback: async (_, read) => read() },
    "@/lib/supabaseReadModel": { getSupabaseProjects: async () => { projectReads++; return projects; } },
    "@/lib/supabaseSchema": { isSupabaseSiteSchemaMode: () => false },
    "@/lib/sheetsCrud": { findAllMaster: async () => { projectReads++; return projects; }, findAllBatch: async (tables, id, options) => {
      reads.push(id);
      assert.equal(options.projectId, id);
      assert.deepEqual(Array.from(tables), ["Tasks", "Daily_Reports", "Project_Lifecycle", "Project_Warranty"]);
      return { Tasks: [{ project_id: id, task_id: "T1", percent_done: 50 }] };
    } },
    "@/lib/sheetsSetup": { ensureMasterSchema: async () => { throw new Error("Read-only GET must not run schema setup"); } },
  });
  return { get: (query = "") => route.GET({ url: `https://app.invalid/api/projects${query}` }), reads, projectReads: () => projectReads };
}

test("basic project list returns accessible sites without any health reads", async () => {
  const fixture = projectRoute();
  const response = await fixture.get("?mode=basic");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 20);
  assert.equal(fixture.reads.length, 0);
});

test("Sheets list and health reuse existing project metadata without schema setup", async () => {
  const fixture = projectRoute({ backend: "sheets" });
  assert.equal((await fixture.get("?mode=basic")).status, 200);
  assert.equal(fixture.projectReads(), 1);
  const response = await fixture.get("?mode=health&projectId=P-1");
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].percent_done, "50");
  assert.equal(fixture.projectReads(), 2);
  assert.deepEqual(fixture.reads, ["P-1"]);
});

test("shared-schema health batches scope all four reads and keep legacy callers unchanged", async () => {
  const calls = [];
  const crud = loadTs("src/lib/sheetsCrud.ts", {
    "./google": { MASTER_SHEET_ID: "master", SHEET_ID: "default", sheets: {} },
    "./sheetsSetup": { MASTER_SCHEMA: {}, SITE_SCHEMA: {} },
    "./supabaseCrud": {
      getSupabaseSiteConfig: (table) => ({ table }),
      findAllSupabase: async (config, projectId) => {
        calls.push({ table: config.table, projectId });
        const rows = [{ project_id: "P-1" }, { project_id: "P-2" }];
        return projectId ? rows.filter((row) => row.project_id === projectId) : rows;
      },
    },
    "./supabaseRest": { isSupabaseBackend: () => true, shouldFallbackToSheets: () => false },
    "./supabaseSchema": { isSupabaseSiteSchemaMode: () => false },
  });
  const tables = ["Tasks", "Daily_Reports", "Project_Lifecycle", "Project_Warranty"];
  const rows = await crud.findAllBatch(tables, "existing-sheet", { projectId: "P-1" });
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.projectId === "P-1"));
  for (const table of tables) {
    assert.equal(rows[table].length, 1);
    assert.equal(rows[table][0].project_id, "P-1");
  }
  const legacy = await crud.findAllBatch(["Tasks"], "existing-sheet");
  assert.equal(calls.at(-1).projectId, "");
  assert.equal(legacy.Tasks.length, 2);
});

test("health reads only the requested accessible current-page projects", async () => {
  const fixture = projectRoute();
  const query = new URLSearchParams({ mode: "health" });
  for (let index = 1; index <= 10; index++) query.append("projectId", `P-${index}`);
  const response = await fixture.get(`?${query}`);
  assert.equal(response.body.data.length, 10);
  assert.equal(fixture.reads.length, 10);
  assert.ok(response.body.data.every((row) => row.percent_done === "50"));
  assert.ok(response.body.data.every((row) => row.name === undefined && row.site_sheet_id === undefined));
});

test("health omits forbidden, inactive and unknown sites and deduplicates IDs", async () => {
  const fixture = projectRoute();
  const response = await fixture.get("?mode=health&projectId=P-1&projectId=P-1&projectId=P-21&projectId=P-22&projectId=unknown");
  assert.deepEqual(Array.from(response.body.data, (row) => row.project_id), ["P-1"]);
  assert.deepEqual(fixture.reads, ["P-1"]);
});

test("health rejects oversized batches and skips data reads for empty batches", async () => {
  const fixture = projectRoute();
  assert.equal((await fixture.get("?mode=health")).body.data.length, 0);
  assert.equal(fixture.projectReads(), 0);
  const query = new URLSearchParams({ mode: "health" });
  for (let index = 1; index <= 11; index++) query.append("projectId", `P-${index}`);
  assert.equal((await fixture.get(`?${query}`)).status, 400);
  assert.equal(fixture.projectReads(), 0);
});

test("both list stages require a session, while legacy full reads remain unchanged", async () => {
  const denied = projectRoute({ authenticated: false });
  for (const query of ["?mode=basic", "?mode=health&projectId=P-1", ""]) {
    assert.equal((await denied.get(query)).status, 401);
  }
  assert.equal(denied.projectReads(), 0);
  const legacy = projectRoute();
  const legacyResponse = await legacy.get();
  assert.equal(legacyResponse.body.data.length, 20);
  assert.equal(legacyResponse.body.data[0].name, "Site 1");
  assert.equal(legacy.reads.length, 20);
});

const account = () => ({ member_id: "M1", _rowIndex: "M1", name: "Test", email: "test@example.invalid", password: "test-password", role: "Engineer", active: "TRUE", avatar_url: "avatar", google_sub: "G1", auth_provider: "credentials" });
function authFixture({ supabase = true, user = account(), stamp = async () => {} } = {}) {
  const calls = { credentials: [], masterReads: 0, rawReads: 0, stamps: 0, schemaSetups: 0 };
  const options = loadTs("src/lib/authOptions.ts", {
    "next-auth/providers/credentials": { default: (config) => ({ ...config, id: "credentials" }) },
    "next-auth/providers/google": { default: (config) => ({ ...config, id: "google" }) },
    "@/lib/roles": loadTs("src/lib/roles.ts"),
    "@/lib/supabaseRest": { isSupabaseBackend: () => supabase },
    "@/lib/sheetsSetup": { ensureMasterSchema: async () => { calls.schemaSetups++; } },
    "@/lib/sheetsCrud": {
      findAllMaster: async () => { calls.masterReads++; return user ? [user] : []; },
      findAllMasterRaw: async () => { calls.rawReads++; return user ? [user] : []; },
      updateMaster: async () => { calls.stamps++; await stamp(); }, insertMaster: async () => {},
    },
    "@/lib/supabaseReadModel": { getSupabaseTeamMemberCredentials: async (email) => { calls.credentials.push(email); return user ? [user] : []; } },
  }).authOptions;
  return { options, calls, authorize: (credentials) => options.providers.find((provider) => provider.id === "credentials").authorize(credentials) };
}

test("credentials lookup targets normalized email and still waits for the login stamp", async () => {
  let release;
  const stamped = new Promise((resolve) => { release = resolve; });
  const fixture = authFixture({ stamp: () => stamped });
  let finished = false;
  const login = fixture.authorize({ email: " TEST@EXAMPLE.INVALID ", password: "test-password" }).then((user) => { finished = true; return user; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fixture.calls.credentials, ["test@example.invalid"]);
  assert.equal(finished, false);
  release();
  assert.equal((await login).role, "Engineer");
  assert.equal(fixture.calls.masterReads, 0);
  assert.equal(fixture.calls.stamps, 1);
});

for (const [label, user, password, expected] of [
  ["unknown user", null, "test-password", /User not found/],
  ["inactive user", { ...account(), active: "FALSE" }, "test-password", /บัญชีนี้ถูกปิด/],
  ["invalid password", account(), "wrong", /Invalid password/],
]) {
  test(`credentials still reject ${label} without recording a successful login`, async () => {
    const fixture = authFixture({ user });
    await assert.rejects(fixture.authorize({ email: "test@example.invalid", password }), expected);
    assert.equal(fixture.calls.stamps, 0);
  });
}

test("credentials are read fresh and the existing Sheets backend still works", async () => {
  const user = account();
  const fixture = authFixture({ user });
  await fixture.authorize({ email: user.email, password: user.password });
  user.active = "FALSE";
  await assert.rejects(fixture.authorize({ email: user.email, password: user.password }), /บัญชีนี้ถูกปิด/);
  assert.equal(fixture.calls.credentials.length, 2);
  const sheets = authFixture({ supabase: false });
  await sheets.authorize({ email: "test@example.invalid", password: "test-password" });
  assert.equal(sheets.calls.rawReads, 1);
  assert.equal(sheets.calls.credentials.length, 0);
  assert.equal(sheets.calls.schemaSetups, 0);
});

test("Sheets credentials stay fresh without schema work and still reject changed passwords", async () => {
  const user = account();
  const fixture = authFixture({ supabase: false, user });
  assert.equal((await fixture.authorize({ email: user.email, password: user.password })).id, "M1");
  user.password = "changed-password";
  await assert.rejects(fixture.authorize({ email: user.email, password: "test-password" }), /Invalid password/);
  user.active = "FALSE";
  await assert.rejects(fixture.authorize({ email: user.email, password: user.password }), /บัญชีนี้ถูกปิด/);
  assert.equal(fixture.calls.rawReads, 3);
  assert.equal(fixture.calls.stamps, 1);
  assert.equal(fixture.calls.schemaSetups, 0);
});

test("Google sign-in reuses the validated user for JWT and preserves session identity", async () => {
  const fixture = authFixture();
  const user = { email: "test@example.invalid", name: "Google", image: "google-avatar" };
  const google = { provider: "google", providerAccountId: "G1" };
  assert.equal(await fixture.options.callbacks.signIn({ user, account: google, profile: { email_verified: true } }), true);
  assert.equal(fixture.calls.masterReads, 1);
  const token = await fixture.options.callbacks.jwt({ token: { email: user.email }, user, account: google });
  assert.equal(fixture.calls.masterReads, 1);
  assert.equal(token.role, "Engineer");
  assert.equal(token.picture, "google-avatar");
  const session = await fixture.options.callbacks.session({ session: { user: {} }, token });
  assert.equal(session.user.id, "M1");
  assert.equal(session.user.authProvider, "google");
});

test("credentials query selects login fields and treats email punctuation as literal", async () => {
  const calls = [];
  const model = loadTs("src/lib/supabaseReadModel.ts", {
    "@/lib/supabaseRest": { supabaseSelect: async (table, params) => { calls.push({ table, params }); return []; } },
    "@/lib/supabaseSchema": { getSupabaseMasterSchema: () => "public" },
    "@/lib/projectIds": { serializeProjectIds: () => "" },
  });
  for (const email of [" TEST@EXAMPLE.INVALID ", "a+b_.*@example.invalid"]) {
    await model.getSupabaseTeamMemberCredentials(email);
    const { table, params } = calls.at(-1);
    assert.equal(table, "team_members");
    assert.equal(params.limit, "1");
    assert.ok(!params.select.includes("project_ids"));
    assert.ok(!params.select.includes("phone"));
    const regex = new RegExp(params.email.slice("imatch.".length).replaceAll("[[:space:]]", "\\s"), "i");
    assert.ok(regex.test(email));
    assert.ok(!regex.test(`other${email.trim()}`));
    if (email.includes("+")) assert.ok(!regex.test("aaaa+b_Xanything@example.invalid"));
  }
});
