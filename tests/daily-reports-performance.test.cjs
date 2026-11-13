/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const PROJECT = 'PMC-20261113-TestbyZoneIdea';
const OTHER = 'Other-TestbyZoneIdea';
const SHEET = 'Sheet-TestbyZoneIdea';
const report = {
  report_id: 'Report-TestbyZoneIdea', project_id: PROJECT, date: '2026-11-13',
  report_date: '2026-11-13', weather: 'Weather TestbyZoneIdea', workers: '5',
  document_no: 'DR-TestbyZoneIdea', prepared_by_name: 'Author TestbyZoneIdea',
  photos_folder_id: 'legacy-photos-TestbyZoneIdea', photos_month_folder_id: 'photos-TestbyZoneIdea',
  pdf_url: 'https://example.com/PDF-TestbyZoneIdea', line_status: 'failed', line_error: 'Failure TestbyZoneIdea',
  work_done: 'Work TestbyZoneIdea', personnel: [{ role: 'Personnel TestbyZoneIdea', qty: '5' }],
  photos: ['Photo TestbyZoneIdea '.repeat(10000)], solutions: 'Solution TestbyZoneIdea',
};
function loader(overrides = {}) {
  const modules = new Map();
  return function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const mod = { exports: {} }; modules.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, console, process: { env: {} }, URL, URLSearchParams, Date, Response, Request, FormData,
      ...overrides.$globals,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('@/') || name.startsWith('.')) {
          const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
          return load([base + '.ts', base + '.tsx'].find(fs.existsSync));
        }
        return require(name);
      },
    }, { filename: file });
    return mod.exports;
  };
}
const json = value => JSON.parse(JSON.stringify(value));
function dataFixture({ backend = true, dbFails = false, fallback = true, dbEmpty = false } = {}) {
  const calls = []; let sheetReads = 0;
  const load = loader({
    '@/lib/supabaseRest': {
      isSupabaseBackend: () => backend,
      readWithSheetsFallback: async (_, primary, secondary) => { try { return await primary(); } catch (error) { if (!fallback) throw error; return secondary(); } },
      supabaseSelect: async (table, params, options) => {
        calls.push({ table, params, options });
        if (dbFails) throw new Error('DB failure TestbyZoneIdea');
        const rows = dbEmpty ? [] : [{ ...report }, { ...report, report_id: 'Older-TestbyZoneIdea', report_date: '2026-10-01' }];
        return params.select ? rows.map(row => Object.fromEntries(params.select.split(',').map(key => [key, row[key]]))) : rows;
      },
    },
    '@/lib/supabaseSchema': { getSupabaseSiteSchema: async id => { assert.equal(id, PROJECT); return 'site_testbyzoneidea'; } },
    '@/lib/sheetsCrud': { findAllRaw: async (table, id) => { sheetReads++; assert.equal(table, 'Daily_Reports'); assert.equal(id, SHEET); return [{ ...report }, { ...report, report_id: 'Older-TestbyZoneIdea', date: '2026-10-01' }, { ...report, project_id: OTHER }]; } },
  });
  return { load, calls, sheetReads: () => sheetReads };
}

test('Supabase dashboard selects only visible fields, preserves all rows/order, links and counts', async () => {
  const f = dataFixture();
  const rows = await f.load('src/lib/dailyReportDashboard.ts').readDailyReportDashboard(PROJECT, SHEET);
  assert.equal(rows.length, 2); assert.equal(rows[0].date, '2026-11-13');
  for (const field of ['workers', 'weather', 'line_status', 'line_error', 'pdf_url', 'photos_month_folder_id', 'prepared_by_name']) assert.equal(rows[0][field], report[field]);
  assert.equal(f.calls[0].params.project_id, `eq.${PROJECT}`);
  assert.equal(f.calls[0].options.schema, 'site_testbyzoneidea');
  assert.equal(f.calls[0].params.order, 'report_date.desc');
  for (const field of ['photos', 'personnel', 'machinery', 'materials', 'work_done', 'solutions']) assert.ok(!f.calls[0].params.select.split(',').includes(field));
  assert.equal(f.sheetReads(), 0); assert.ok(!('photos_json' in rows[0]));
  const full = await f.load('src/lib/supabaseReadModel.ts').getSupabaseDailyReports(PROJECT);
  assert.ok(!('select' in f.calls[1].params)); assert.ok(full[0].photos_json.includes('Photo TestbyZoneIdea'));
  assert.ok(full[0].personnel_json.includes('Personnel TestbyZoneIdea')); assert.equal(full[0].work_done, report.work_done);
  assert.ok(JSON.stringify(rows).length < JSON.stringify(full).length / 10);
});
for (const backend of [false, true]) test(`${backend ? 'configured fallback' : 'Sheets'} dashboard filters other projects and preserves the same response`, async () => {
  const f = dataFixture({ backend, dbFails: backend });
  const rows = await f.load('src/lib/dailyReportDashboard.ts').readDailyReportDashboard(PROJECT, SHEET);
  assert.equal(f.sheetReads(), 1); assert.equal(rows.length, 2); assert.ok(rows.every(row => row.project_id === PROJECT));
  assert.equal(rows[0].date, '2026-11-13'); assert.equal(rows[0].pdf_url, report.pdf_url);
});
test('empty Supabase results do not consult Sheets, and disabled fallback propagates errors', async () => {
  const empty = dataFixture({ dbEmpty: true });
  assert.equal((await empty.load('src/lib/dailyReportDashboard.ts').readDailyReportDashboard(PROJECT, SHEET)).length, 0); assert.equal(empty.sheetReads(), 0);
  const failed = dataFixture({ dbFails: true, fallback: false });
  await assert.rejects(() => failed.load('src/lib/dailyReportDashboard.ts').readDailyReportDashboard(PROJECT, SHEET), /DB failure/); assert.equal(failed.sheetReads(), 0);
});

function routeFixture({ role = 'Admin', access = true, exists = true, readFails = false } = {}) {
  let schema = 0, reads = 0, master = 0, legacyContext = 0;
  const load = loader({
    'next/server': { NextResponse: Response }, 'next-auth': { getServerSession: async () => role ? { user: { role } } : null },
    '@/lib/authOptions': {}, '@/lib/authz': { isAdminRole: () => role === 'Admin', canAccessProject: async () => access },
    '@/lib/sheetsSetup': { ensureSchema: async () => { schema++; } },
    '@/lib/supabaseSchema': { isSupabaseSiteSchemaMode: () => false }, '@/lib/supabaseRest': { isSupabaseBackend: () => false },
    '@/lib/sheetsCrud': { findAllMaster: async () => { master++; return exists ? [{ project_id: PROJECT, site_sheet_id: SHEET }] : []; }, findAll: async () => [report, { ...report, project_id: OTHER }] },
    '@/lib/dailyReportDashboard': { readDailyReportDashboard: async (id, sheet) => { reads++; assert.equal(id, PROJECT); assert.equal(sheet, SHEET); if (readFails) throw new Error('Read failed TestbyZoneIdea'); return [report]; } },
    '@/lib/siteContext': { getProjectContext: async () => { legacyContext++; return { sheetId: SHEET }; } },
    '@/lib/dailyReports': {}, '@/lib/drive': {}, '@/lib/line': {}, '@/lib/masterProjects': {}, '@/lib/reportPdf': {},
  });
  return { api: load('src/app/api/reports/route.ts'), counters: () => ({ schema, reads, master, legacyContext }) };
}
const req = suffix => new Request(`https://test.invalid/api/reports?${suffix}`);
for (const role of ['Admin', 'Foreman']) test(`${role} dashboard reads authorize first and never initialize schema or invoke legacy context`, async () => {
  const f = routeFixture({ role }); const res = await f.api.GET(req(`project_id=${PROJECT}&view=dashboard`));
  assert.equal(res.status, 200); assert.equal((await res.json()).data[0].report_id, report.report_id);
  assert.deepEqual(f.counters(), { schema: 0, reads: 1, master: 1, legacyContext: 0 });
});
for (const config of [{ role: null, status: 401 }, { access: false, status: 403 }, { exists: false, status: 404 }]) test(`denied dashboard read returns ${config.status} without reading reports or schema`, async () => {
  const f = routeFixture(config); const res = await f.api.GET(req(`project_id=${PROJECT}&view=dashboard`));
  assert.equal(res.status, config.status); assert.equal(f.counters().reads, 0); assert.equal(f.counters().schema, 0);
});
test('missing IDs and read failures remain explicit errors; legacy GET still returns full reports and validates schema', async () => {
  const invalid = routeFixture(); assert.equal((await invalid.api.GET(req('view=dashboard'))).status, 400); assert.equal(invalid.counters().master, 0);
  const failed = routeFixture({ readFails: true }); assert.equal((await failed.api.GET(req(`project_id=${PROJECT}&view=dashboard`))).status, 500);
  const legacy = routeFixture(); const res = await legacy.api.GET(req(`project_id=${PROJECT}`)); const body = await res.json();
  assert.equal(body.data.length, 1); assert.equal(body.data[0].work_done, report.work_done); assert.equal(legacy.counters().schema, 1); assert.equal(legacy.counters().reads, 0);
});

const base = 'src/app/dashboard/sites/[projectId]/reports/';
function workspaceFixture({ tab = 'dashboard', data, error, isLoading = false, refreshFails = false } = {}) {
  let cursor = 0, resets = 0, mutations = 0; const updates = []; const lazy = []; const requests = [];
  const load = loader({
    react: { ...React, useMemo: fn => fn(), useState: initial => { const i = cursor++; return [i === 0 ? tab : typeof initial === 'function' ? initial() : initial, value => updates.push({ i, value })]; } },
    'next/dynamic': loader => function LazyPanel() { lazy.push(loader); return React.createElement('div', null, 'Deferred panel TestbyZoneIdea'); },
    swr: (key) => { assert.ok(key.includes(`project_id=${PROJECT}&view=dashboard`)); return { data, error, isLoading, mutate: async () => { mutations++; if (refreshFails) throw new Error('Refresh failure TestbyZoneIdea'); } }; },
    $globals: { FormData: class { set() {} get() { return ''; } }, fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => JSON.stringify({ data: { document_no: 'DR-TestbyZoneIdea', line_status: 'disabled' } }) }; } },
  });
  const Component = load(base + 'DailyReportsWorkspace.tsx').DailyReportsWorkspace;
  return { render: props => { cursor = 0; return Component({ project: { project_id: PROJECT, name: 'Project TestbyZoneIdea' }, ...props }); }, lazy, updates, requests, form: { reset: () => { resets++; } }, resets: () => resets, mutations: () => mutations };
}
function find(node, predicate) { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const result = find(child, predicate); if (result) return result; } return null; }
test('loading dashboard renders a skeleton without false empty reports or loading-text table; advanced tabs stay deferred', () => {
  const f = workspaceFixture({ isLoading: true }); const html = renderToStaticMarkup(f.render());
  assert.ok(html.includes('กำลังเตรียมรายงาน')); assert.ok(!html.includes('ยังไม่มีรายงาน')); assert.ok(!html.includes('กำลังโหลดข้อมูล...')); assert.equal(f.lazy.length, 0);
});
test('read failures expose retry rather than a successful empty dashboard', async () => {
  const f = workspaceFixture({ error: new Error('Failure TestbyZoneIdea') }); const tree = f.render();
  const retry = find(tree, node => node.type === 'button' && node.props.children === 'ลองโหลดรายงานอีกครั้ง');
  assert.ok(retry); retry.props.onClick(); assert.equal(f.mutations(), 1);
  const html = renderToStaticMarkup(tree); assert.ok(!html.includes('ยังไม่มีรายงานประจำวันของไซต์นี้'));
});
test('populated dashboard preserves report PDF/photo links, worker counts and LINE failure details', () => {
  const f = workspaceFixture({ data: { data: [report] } }); const html = renderToStaticMarkup(f.render());
  for (const text of [report.document_no, report.weather, report.prepared_by_name, report.line_error, report.pdf_url, report.photos_month_folder_id]) assert.ok(html.includes(text), text);
  assert.equal(f.lazy.length, 0);
});
for (const tab of ['weekly', 'monthly']) test(`${tab} panel loads only when selected, and remains hidden for Foreman`, () => {
  const f = workspaceFixture({ tab, data: { data: [] } }); renderToStaticMarkup(f.render()); assert.equal(f.lazy.length, 1);
  const restricted = workspaceFixture({ tab: 'dashboard', data: { data: [] } }); const html = renderToStaticMarkup(restricted.render({ allowAdvancedReports: false }));
  assert.equal(restricted.lazy.length, 0); assert.ok(!html.includes('Weekly Report')); assert.ok(!html.includes('Monthly Report'));
});
test('successful save resets the original form after React clears currentTarget, refreshes and returns to dashboard', async () => {
  const f = workspaceFixture({ tab: 'form', data: { data: [] } }); const tree = f.render(); const form = find(tree, node => node.type === 'form');
  const event = { preventDefault() {}, currentTarget: f.form }; const pending = form.props.onSubmit(event); event.currentTarget = null; await pending;
  assert.equal(f.resets(), 1); assert.equal(f.mutations(), 1); assert.equal(f.requests[0].url, '/api/reports'); assert.equal(f.requests[0].options.method, 'POST');
  assert.ok(f.updates.some(update => update.i === 0 && update.value === 'dashboard'));
  assert.ok(!f.updates.some(update => update.i === 11 && /reset/.test(String(update.value))));
});


test('a failed refresh after a successful save does not become a false save failure', async () => {
  const f = workspaceFixture({ tab: 'form', data: { data: [] }, refreshFails: true });
  const form = find(f.render(), node => node.type === 'form');
  await form.props.onSubmit({ preventDefault() {}, currentTarget: f.form });
  assert.equal(f.resets(), 1); assert.equal(f.mutations(), 1);
  assert.ok(f.updates.some(update => update.i === 0 && update.value === 'dashboard'));
  assert.ok(f.updates.some(update => update.i === 12 && String(update.value).includes('สำเร็จ')));
  assert.ok(!f.updates.some(update => update.i === 11 && update.value));
});

for (const lineStatus of ['disabled', 'sent', 'failed']) test(`POST preserves PDF, report fields and LINE ${lineStatus} workflow with synthetic data`, async () => {
  const records = []; const folders = []; const pdfs = []; const messages = []; const patches = [];
  const load = loader({
    'next/server': { NextResponse: Response }, 'next-auth': { getServerSession: async () => ({ user: { role: 'Admin', name: 'Admin TestbyZoneIdea', email: 'testbyzoneidea@example.com' } }) },
    '@/lib/authOptions': {}, '@/lib/siteApi': {}, '@/lib/dailyReportDashboard': {},
    '@/lib/masterProjects': { getMasterProjects: async () => [{ project_id: PROJECT, name: 'Site TestbyZoneIdea', drive_folder_id: 'Drive-TestbyZoneIdea', line_notify_enabled: lineStatus === 'disabled' ? 'FALSE' : 'TRUE', line_group_id: 'LINE-TestbyZoneIdea' }] },
    '@/lib/siteContext': { getProjectContext: async () => ({ sheetId: SHEET, driveFolderId: 'Drive-TestbyZoneIdea' }) },
    '@/lib/supabaseRest': { isSupabaseBackend: () => false }, '@/lib/sheetsSetup': { ensureSchema: async id => assert.equal(id, SHEET) },
    '@/lib/drive': { findOrCreateFolder: async (name, parent) => { folders.push({ name, parent }); return { id: name + '-TestbyZoneIdea' }; } },
    '@/lib/reportPdf': { createPdfReportFile: async value => { pdfs.push(value); return { id: 'PDF-TestbyZoneIdea', webViewLink: 'https://example.com/PDF-TestbyZoneIdea' }; } },
    '@/lib/line': { sendLineMessages: async (value, target) => { messages.push({ value, target }); if (lineStatus === 'failed') throw new Error('LINE failure TestbyZoneIdea'); } },
    '@/lib/dailyReports': { parseJsonRows: value => JSON.parse(value || '[]'), stringifyRows: value => JSON.stringify(value), buildDailyReportHtml: payload => JSON.stringify(payload), buildDailyReportLineFlex: value => value },
    '@/lib/sheetsCrud': {
      findAll: async () => records,
      insert: async (table, record, sheet) => { assert.equal(table, 'Daily_Reports'); assert.equal(sheet, SHEET); records.push({ ...record, _rowIndex: 2 }); },
      update: async (_, key, patch) => patches.push({ key, patch }),
    },
    $globals: { console: { ...console, error() {} } },
  });
  const body = new FormData(); for (const [key, value] of Object.entries({ project_id: PROJECT, date: '2026-11-13', work_done: 'Work TestbyZoneIdea', issues: 'Issues TestbyZoneIdea', solutions: 'Solutions TestbyZoneIdea', personnel_json: JSON.stringify([{ role: 'Worker TestbyZoneIdea', qty: '5' }]) })) body.set(key, value);
  const res = await load('src/app/api/reports/route.ts').POST(new Request('https://test.invalid/api/reports', { method: 'POST', body }));
  const result = await res.json(); assert.equal(res.status, 200); assert.equal(result.data.line_status, lineStatus);
  assert.equal(records.length, 1); assert.equal(records[0].work_done, 'Work TestbyZoneIdea'); assert.equal(records[0].workers, '5');
  assert.equal(pdfs.length, 1); assert.ok(pdfs[0].html.includes('Worker TestbyZoneIdea')); assert.equal(folders.length, 4);
  assert.equal(messages.length, lineStatus === 'disabled' ? 0 : 1); assert.equal(patches.length, lineStatus === 'disabled' ? 0 : 1);
});
