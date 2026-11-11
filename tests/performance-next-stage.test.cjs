/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const sharp = require('sharp');
function load(file, deps = {}, expose = []) {
  const mod = { exports: {} };
  const input = fs.readFileSync(file, 'utf8') + (expose.length ? `\nexport {${expose.join(',')}};` : '');
  const code = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Response, URL, console, process: { env: {} }, require: name => deps[name] || (name.startsWith('react') ? require(name) : {}) });
  return mod.exports;
}

test('file reads bypass failed Sheets setup, but writes and authorization remain protected', async () => {
  let setups = 0, allowed = true, authenticated = true;
  const api = load('src/lib/siteApi.ts', {
    'next-auth': { getServerSession: async () => authenticated ? { user: {} } : null },
    '@/lib/authz': { canAccessProject: async () => allowed, isAdminRole: () => true },
    '@/lib/sheetsCrud': { findAllMaster: async () => [{ project_id: 'P2', site_sheet_id: 'sheet', drive_folder_id: 'folder' }] },
    '@/lib/sheetsSetup': { ensureSchema: async () => { setups++; return { success: false }; } },
    '@/lib/supabaseRest': { isSupabaseBackend: () => false },
    '@/lib/supabaseSchema': { isSupabaseSiteSchemaMode: () => false },
  });
  assert.equal((await api.getSiteApiContext('P2', false, { readOnly: true })).siteSheetId, 'sheet');
  assert.equal((await api.getSiteApiContext('P2', false, { readOnly: true, driveOnly: true })).project.drive_folder_id, 'folder');
  assert.equal(setups, 0);
  assert.equal((await api.getSiteApiContext('P2')).status, 503);
  assert.equal(setups, 1);
  allowed = false; assert.equal((await api.getSiteApiContext('P2', false, { driveOnly: true })).status, 403);
  authenticated = false; assert.equal((await api.getSiteApiContext('P2', false, { readOnly: true })).status, 401);
});

test('initial server list excludes inactive and inaccessible projects without reading health', async () => {
  let reads = 0;
  const { readInitialProjects } = load('src/lib/initialProjects.ts', {
    '@/lib/projectListCache': { readCachedProjectList: fn => fn() },
    '@/lib/supabaseRest': { isSupabaseReadEnabled: () => true, isSupabaseBackend: () => true, readWithSheetsFallback: (_, fn) => fn() },
    '@/lib/supabaseReadModel': { getSupabaseProjects: async () => { reads++; return [{ project_id: 'allowed', name: 'Allowed' }, { project_id: 'hidden' }, { project_id: 'disabled', active: 'FALSE' }]; } },
    '@/lib/authz': { filterProjectsForUser: async rows => rows.filter(p => p.project_id !== 'hidden') },
    '@/lib/supabaseSchema': { isSupabaseSiteSchemaMode: () => true, getSupabaseSiteSchemaName: id => 'site_' + id },
  });
  const rows = await readInitialProjects({ role: 'Staff' });
  assert.equal(reads, 1); assert.equal(rows.length, 1); assert.equal(rows[0].project_id, 'allowed'); assert.equal(rows[0].site_schema_name, 'site_allowed');
});

test('health request queue bounds concurrency and continues after a rejected site', async () => {
  let active = 0, peak = 0;
  const jobs = [];
  const { fetchProjectHealth } = load('src/lib/projectHealthQueue.ts', {
    '@/lib/fetcher': { fetcher: url => new Promise((resolve, reject) => { active++; peak = Math.max(peak, active); jobs.push({ url, resolve: value => { active--; resolve(value); }, reject: error => { active--; reject(error); } }); }) },
  });
  const promises = Array.from({ length: 8 }, (_, i) => fetchProjectHealth('site-' + i));
  const done = Promise.allSettled(promises);
  await new Promise(setImmediate); assert.equal(jobs.length, 3);
  jobs[0].reject(new Error('Site unavailable')); await new Promise(setImmediate); assert.equal(jobs.length, 4);
  for (let i = 1; i < 8; i++) { jobs[i].resolve({ data: jobs[i].url }); await new Promise(setImmediate); }
  const results = await done;
  assert.equal(peak, 3); assert.equal(results.filter(r => r.status === 'fulfilled').length, 7);
});

test('narrow health reads preserve calculated results and leave full entity reads unchanged', async () => {
  const db = {
    tasks: [{ task_id: 'h', project_id: 'P1', task_type: 'heading', percent_done: 0 }, { task_id: 't', project_id: 'P1', percent_done: 50, status: 'In Progress', end_date: '2025-01-01', notes: 'Large note excluded' }, { task_id: 'done', project_id: 'P1', status: 'Done', percent_done: 100 }],
    daily_reports: [{ report_id: 'R1', project_id: 'P1', report_date: '2026-10-01', work_done: 'Large text excluded' }, { report_id: 'bad', project_id: 'P1', report_date: 'invalid' }],
    project_lifecycle: [{ lifecycle_id: 'L1', project_id: 'P1', permit_submitted_date: '2026-01-01', temporary_water_expiry_date: '2026-02-01' }],
    project_warranty: [{ warranty_id: 'W1', project_id: 'P1', handover_date: '2020-01-01' }],
  };
  const calls = [];
  const model = load('src/lib/supabaseReadModel.ts', {
    '@/lib/supabaseRest': { supabaseSelect: async (table, params, options) => { calls.push({ table, params, options }); return db[table].map(row => params.select ? Object.fromEntries(params.select.split(',').map(k => [k, row[k]])) : row); } },
    '@/lib/supabaseSchema': { getSupabaseSiteSchema: async () => 'site_p1' },
  });
  const methods = ['getSupabaseTasks', 'getSupabaseDailyReports', 'getSupabaseProjectLifecycle', 'getSupabaseProjectWarranty'];
  const full = await Promise.all(methods.map(name => model[name]('P1')));
  assert.ok(calls.every(c => !c.params.select)); calls.length = 0;
  const narrow = await Promise.all(methods.map(name => model[name]('P1', true)));
  assert.ok(calls.every(c => c.params.select && c.params.select !== '*' && c.params.project_id === 'eq.P1' && c.options.schema === 'site_p1'));
  assert.ok(!calls[0].params.select.includes('notes'));
  const lifecycle = load('src/lib/projectLifecycle.ts');
  const calc = load('src/app/api/projects/route.ts', { '@/lib/projectLifecycle': lifecycle }, ['calculateProjectHealth', 'calculateDailyReportHealth', 'calculateLifecycleAlerts']);
  const project = { project_id: 'P1', status: 'In Progress', start_date: '2026-01-01' };
  const summarize = rows => JSON.stringify({ ...calc.calculateProjectHealth(project, rows[0]), ...calc.calculateDailyReportHealth(project, rows[1]), ...calc.calculateLifecycleAlerts('P1', rows[2][0], rows[3][0]) });
  assert.equal(summarize(narrow), summarize(full));
});

test('project cover thumbnail reduces bytes while original download remains identical', async () => {
  const original = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#fe6400' } }).png().toBuffer();
  let reads = 0;
  const route = load('src/app/api/drive/files/[fileId]/route.ts', {
    sharp: { default: sharp },
    '@/lib/google': { drive: { files: { get: async args => { reads++; return { data: args.alt ? original : { mimeType: 'image/png' } }; } } } },
  });
  const context = { params: Promise.resolve({ fileId: 'test-cover' }) };
  const thumb = await route.GET({ url: 'https://test.invalid/api/drive/files/test-cover?thumbnail=card' }, context);
  const bytes = Buffer.from(await thumb.arrayBuffer());
  assert.equal(thumb.headers.get('content-type'), 'image/webp'); assert.ok(bytes.length < original.length);
  const info = await sharp(bytes).metadata(); assert.ok(info.width <= 760 && info.height <= 460);
  await route.GET({ url: 'https://test.invalid/api/drive/files/test-cover?thumbnail=card' }, context); assert.equal(reads, 2);
  const full = await route.GET({ url: 'https://test.invalid/api/drive/files/test-cover' }, context);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), original); assert.equal(full.headers.get('content-type'), 'image/png');
});
