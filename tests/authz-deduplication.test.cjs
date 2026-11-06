/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
function load(relative, dependencies = {}) {
  const file = path.resolve(__dirname, "..", relative);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(js, { module: loaded, exports: loaded.exports, console, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  } }, { filename: file });
  return loaded.exports;
}
const roles = load("src/lib/roles.ts");
const ids = load("src/lib/projectIds.ts");
const projects = [
  { project_id: "assigned", se_name: "Test User", pm_name: "Test User" },
  { project_id: "explicit" }, { project_id: "member-grant" },
  { project_id: "other", se_name: "Another User", pm_name: "Another User" },
  { project_id: "inactive", active: "FALSE", se_name: "Test User", pm_name: "Test User" },
];
function fixture({ backend = "sheets", memberRole = "Staff" } = {}) {
  const calls = [];
  let fail = false;
  const member = { name: "Test User", email: "test@example.invalid", google_sub: "G1", role: memberRole, project_ids: "member-grant" };
  const rows = {
    Projects: projects,
    Team: [member],
    UserSites: [
      { email: member.email, project_id: "explicit", active: "TRUE" },
      { email: member.email, project_id: "revoked", active: "FALSE" },
      { email: "someone@example.invalid", project_id: "other", active: "TRUE" },
    ],
  };
  const read = async (table) => { calls.push(table); if (fail) throw new Error("source unavailable"); return rows[table]; };
  const auth = load("src/lib/authz.ts", {
    "@/lib/sheetsCrud": { findAllMaster: read },
    "@/lib/roles": roles, "@/lib/projectIds": ids,
    "@/lib/supabaseRest": { isSupabaseReadEnabled: () => backend === "supabase", readWithSheetsFallback: async (_, db) => db() },
    "@/lib/supabaseReadModel": { getSupabaseTeamMembers: () => read("Team"), getSupabaseUserProjectAccess: () => read("UserSites") },
  });
  return { auth, calls, read, rows, member, setFail: (value) => { fail = value; }, user: { name: "Test User", email: member.email, googleSub: "G1", role: memberRole } };
}
for (const backend of ["sheets", "supabase"]) {
  for (const role of ["Staff", "Foreman", "Engineer", "Project Manager"]) {
    test(`${backend}: ${role} retains grants and assignment rules without rereading supplied projects`, async () => {
      const f = fixture({ backend, memberRole: role });
      const result = await f.auth.filterProjectsForUser(projects, f.user);
      const expected = ["explicit", "member-grant"];
      if (["Engineer", "Project Manager"].includes(role)) expected.push("assigned");
      assert.deepEqual(Array.from(result, (row) => row.project_id).sort(), expected.sort());
      assert.equal(f.calls.filter((table) => table === "Projects").length, 0);
      assert.equal(await f.auth.canAccessProject("other", f.user), false);
      assert.equal(await f.auth.canAccessProject("revoked", f.user), false);
    });
  }
}
test("Admin and anonymous access do not read authorization tables", async () => {
  const f = fixture();
  assert.equal(await f.auth.canAccessProject("assigned", { ...f.user, role: "Admin" }), true);
  assert.equal(await f.auth.canAccessProject("assigned", null), false);
  assert.deepEqual(f.calls, []);
});
test("Staff and Foreman do not load assignment projects without a supplied list", async () => {
  for (const role of ["Staff", "Foreman"]) {
    const f = fixture({ memberRole: role });
    assert.equal(await f.auth.canAccessProject("explicit", f.user), true);
    assert.deepEqual(f.calls.sort(), ["Team", "UserSites"]);
  }
});
test("the stored member role is respected even when the session role differs", async () => {
  const f = fixture({ memberRole: "Engineer" });
  assert.equal(await f.auth.canAccessProject("assigned", { ...f.user, role: "Staff" }), true);
  assert.equal(f.calls.filter((table) => table === "Projects").length, 1);
});
test("concurrent checks share reads; clearing existing access cache revokes grants", async () => {
  const f = fixture();
  const allowed = await Promise.all(Array.from({ length: 10 }, () => f.auth.canAccessProject("explicit", f.user)));
  assert.ok(allowed.every(Boolean));
  assert.equal(f.calls.length, 2);
  f.rows.UserSites[0].active = "FALSE";
  f.auth.clearProjectAccessCache();
  assert.equal(await f.auth.canAccessProject("explicit", f.user), false);
  assert.equal(f.calls.length, 4);
});
test("failed authorization reads reject without granting access and can retry", async () => {
  const f = fixture();
  f.setFail(true);
  await assert.rejects(f.auth.canAccessProject("explicit", f.user), /source unavailable/);
  f.setFail(false);
  assert.equal(await f.auth.canAccessProject("explicit", f.user), true);
});
test("Site API reuses exactly one project read and keeps session/admin checks", async () => {
  const f = fixture({ memberRole: "Engineer" });
  let user = f.user;
  const api = load("src/lib/siteApi.ts", {
    "next-auth": { getServerSession: async () => user ? { user } : null },
    "@/lib/authOptions": {}, "@/lib/authz": f.auth,
    "@/lib/sheetsCrud": { findAllMaster: f.read },
    "@/lib/sheetsSetup": { ensureSchema: async () => ({ success: true }) },
    "@/lib/supabaseRest": { isSupabaseBackend: () => true },
    "@/lib/supabaseSchema": { isSupabaseSiteSchemaMode: () => true, getSupabaseSiteSchemaName: (id) => `site_${id}` },
  });
  assert.equal((await api.getSiteApiContext("assigned")).siteSheetId, "site_assigned");
  assert.equal(f.calls.filter((table) => table === "Projects").length, 1);
  assert.equal((await api.getSiteApiContext("other")).status, 403);
  const beforeDenied = f.calls.length;
  assert.equal((await api.getSiteApiContext("assigned", true)).status, 403);
  assert.equal(f.calls.length, beforeDenied);
  user = null;
  assert.equal((await api.getSiteApiContext("assigned")).status, 401);
  assert.equal(f.calls.length, beforeDenied);
});
