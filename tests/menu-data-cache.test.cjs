const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Offline harness: no real database/Drive calls or production writes.
function loadTs(path, imports, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, process, console, performance,
    require: (id) => imports[id] ?? (id.startsWith('node:') ? require(id) : {}),
    ...globals,
  }, { filename: path });
  return module.exports;
}

function cacheHarness() {
  const entries = new Map();
  let now = 1000;
  class Clock extends Date { static now() { return now; } }
  const nextCache = {
    unstable_cache: (fn, key, options) => async () => {
      const id = JSON.stringify([key, fn.toString()]);
      // Deliberately return stale entries too, exercising the grant expiry guard.
      if (entries.has(id)) return structuredClone(entries.get(id).value);
      const value = await fn();
      entries.set(id, { value: structuredClone(value), tags: options.tags });
      return structuredClone(value);
    },
    revalidateTag: (tag, profile) => {
      assert.equal(profile.expire, 0);
      for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
    },
  };
  return {
    api: loadTs('src/lib/menuDataCache.ts', { 'next/cache': nextCache }, { Date: Clock }),
    advance: (ms) => { now += ms; },
  };
}
const site = (id) => ({ project: { project_id: id }, siteSheetId: `sheet-${id}` });

test('site cache isolates sites/views and invalidates only the changed site', async () => {
  const { api } = cacheHarness();
  let a = 1, b = 2, loads = 0;
  const readA = () => api.readSiteMenuData(site('A'), 'notes', async () => { loads++; return { value: a }; });
  const readB = () => api.readSiteMenuData(site('B'), 'notes', async () => { loads++; return { value: b }; });
  assert.equal((await readA()).value, 1);
  assert.equal((await readB()).value, 2);
  a = 3; b = 4;
  assert.equal((await readA()).value, 1);
  assert.equal(loads, 2);
  api.invalidateMenuDataForWrite('Site_Notes', ['sheet-A']);
  assert.equal((await readA()).value, 3);
  assert.equal((await readB()).value, 2);
  api.invalidateMenuDataForWrite('site_notes', ['B']);
  assert.equal((await readB()).value, 4);
  assert.equal(await api.readSiteMenuData(site('A'), 'qc', async () => 9), 9);
});

test('Supabase master table aliases invalidate Sheets-named cache entries', async () => {
  const { api } = cacheHarness();
  let value = 1;
  const read = () => api.readMasterMenuData('Team', async () => value);
  assert.equal(await read(), 1);
  value = 2;
  api.invalidateMenuDataForWrite('team_members');
  assert.equal(await read(), 2);
});

test('grants isolate users, reject stale grants and refresh after shared revocation', async () => {
  const { api, advance } = cacheHarness();
  let granted = true;
  const read = (user) => api.readCachedAuthorization(user, async () => new Set(granted ? ['A'] : []));
  assert.equal((await read('alice')).has('A'), true);
  granted = false;
  assert.equal((await read('bob')).has('A'), false);
  assert.equal((await read('alice')).has('A'), true);
  advance(60_001);
  assert.equal((await read('alice')).has('A'), false);
  api.invalidateMenuDataForWrite('user_project_access');
  assert.equal((await read('alice')).size, 0);
});

test('errors do not poison cache and a saved project invalidates dependent snapshots', async () => {
  const { api } = cacheHarness();
  let failing = true;
  const read = () => api.readSiteMenuData(site('A'), 'overview', async () => {
    if (failing) throw new Error('temporary read error');
    return 'fresh';
  });
  await assert.rejects(read, /temporary read error/);
  failing = false;
  assert.equal(await read(), 'fresh');
  let title = 'before';
  const details = () => api.readSiteMenuData(site('A'), 'details', async () => title);
  assert.equal(await details(), 'before');
  title = 'after';
  api.invalidateMenuDataForWrite('Projects');
  assert.equal(await details(), 'after');
});

test('revoked site access blocks a warmed API cache; saved notes become visible', async () => {
  const { api } = cacheHarness();
  let sessionReads = 0, allow = true, rows = [{ note_id: '1', project_id: 'A', title: 'before' }];
  const session = { user: { email: 'test@example.com', role: 'Staff' } };
  const siteApi = loadTs('src/lib/siteApi.ts', {
    'next-auth': { getServerSession: async () => { sessionReads++; return session; } },
    './projectCatalog': { readProjectCatalog: async () => [{ project_id: 'A', site_sheet_id: 'sheet-A' }] },
    '@/lib/authz': { canAccessProject: async () => allow, isAdminRole: (role) => role === 'Admin' },
    '@/lib/sheetsSetup': { ensureSchema: async () => { throw new Error('read attempted schema mutation'); } },
    '@/lib/supabaseRest': { isSupabaseBackend: () => false },
  });
  const route = loadTs('src/app/api/sites/[projectId]/notes/route.ts', {
    '@/lib/menuDataCache': api,
    '@/lib/siteApi': siteApi,
    '@/lib/sheetsCrud': { findAll: async () => rows },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  });
  const request = () => route.GET({}, { params: Promise.resolve({ projectId: 'A' }) });
  assert.equal((await request()).body.data[0].title, 'before');
  allow = false;
  assert.equal((await request()).status, 403);
  allow = true;
  rows = [{ note_id: '1', project_id: 'A', title: 'after' }];
  api.invalidateMenuDataForWrite('Site_Notes', ['sheet-A']);
  assert.equal((await request()).body.data[0].title, 'after');
  const count = sessionReads;
  assert.equal((await siteApi.getSiteApiContext('A', false, { readOnly: true, session })).project.project_id, 'A');
  assert.equal(sessionReads, count);
  assert.equal((await siteApi.getSiteApiContext('A', false, { readOnly: true, session: null })).status, 401);
});

test('login timestamp updates keep site/grant caches; role edits invalidate both', async () => {
  const { api } = cacheHarness();
  let value = 1, allowed = true;
  const read = () => api.readSiteMenuData(site('A'), 'notes', async () => value);
  const grant = () => api.readCachedAuthorization('alice', async () => new Set(allowed ? ['A'] : []));
  await read(); await grant();
  value = 2; allowed = false;
  api.invalidateMenuDataForWrite('team_members', [], ['last_login_at', 'updated_at']);
  assert.equal(await read(), 1);
  assert.equal((await grant()).has('A'), true);
  api.invalidateMenuDataForWrite('team_members', [], ['role']);
  assert.equal(await read(), 2);
  assert.equal((await grant()).has('A'), false);
});

test('payment writes invalidate cached history across workspaces', async () => {
  const { api } = cacheHarness();
  let version = 1;
  const read = () => api.readMasterMenuData('PaymentRequests', async () => ({ version }));
  assert.equal((await read()).version, 1);
  version = 2;
  api.invalidateMenuDataForWrite('PaymentRequests');
  assert.equal((await read()).version, 2);
});
