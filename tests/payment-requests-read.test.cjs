const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let allowed = true, schemas = 0;
  const calls = [];
  const cache = new Map();
  const rows = [
    { request_id: '1', project_id: 'TestbyZoneIdea', title: 'TestbyZoneIdea', payee_name: 'TestbyZoneIdea', updated_at: '2026-11-25', attachments_json: '[]' },
    { request_id: '2', project_id: 'Other', title: 'Other', payee_name: '', updated_at: '2026-11-24' },
  ];
  const imports = {
    sharp: { default: { cache() {}, concurrency() {} } },
    '@/lib/menuDataCache': { readMasterMenuData: async (table, read) => {
      if (!cache.has(table)) cache.set(table, await read());
      return cache.get(table);
    } },
    '@/lib/siteApi': {
      getSiteApiContext: async (_id, _admin, options) => {
        assert.equal(options.readOnly, true);
        return allowed ? { project: { project_id: 'TestbyZoneIdea' }, siteSheetId: 'test-sheet' } : { error: 'Forbidden', status: 403 };
      },
      getErrorMessage: (error) => error.message,
    },
    '@/lib/sheetsSetup': { ensureMasterSchema: async () => { schemas++; return { success: true }; } },
    '@/lib/sheetsCrud': { findAllMaster: async (table, _source, options) => {
      calls.push(table);
      assert.equal(options.fresh, true);
      if (table === 'PaymentRequests') return rows;
      return [{ active: 'TRUE' }, { active: 'FALSE' }];
    } },
    '@/lib/paymentRequests': { parsePaymentAttachments: (value) => JSON.parse(value || '[]') },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers }) } },
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync('src/app/api/sites/[projectId]/payment-requests/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, performance, console, URL, process,
    require: (id) => imports[id] || {},
  });
  return { rows, calls, cache, schemas: () => schemas, deny: () => { allowed = false; }, get: (view = '') => module.exports.GET(
    { url: `https://preview.invalid/api/sites/TestbyZoneIdea/payment-requests${view ? `?view=${view}` : ''}` },
    { params: Promise.resolve({ projectId: 'TestbyZoneIdea' }) },
  ) };
}

test('initial list skips contractor/rate reads and schema initialization', async () => {
  const h = harness();
  const response = await h.get('list');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].request_id, '1');
  assert.deepEqual(h.calls, ['PaymentRequests']);
  assert.equal(h.schemas(), 0);
  assert.equal(response.body.payees, undefined);
  assert.match(response.headers['Server-Timing'], /payment_read;dur=/);
});

test('references load on demand and legacy full response still includes all fields', async () => {
  const h = harness();
  await h.get('list');
  const references = await h.get('references');
  assert.deepEqual(h.calls, ['PaymentRequests', 'Contractors', 'LaborRates']);
  assert.equal(references.body.data, undefined);
  assert.equal(references.body.payees[0].name, 'TestbyZoneIdea');
  assert.equal(references.body.contractors.length, 1);
  assert.equal(references.body.labor_rates.length, 1);
  const legacy = await h.get();
  assert.equal(legacy.body.data.length, 1);
  assert.equal(legacy.body.payees.length, 1);
  assert.equal(legacy.body.contractors.length, 1);
  assert.equal(legacy.body.labor_rates.length, 1);
});

test('site access is checked before returning a warmed payment cache', async () => {
  const h = harness();
  await h.get('list');
  h.deny();
  assert.equal((await h.get('list')).status, 403);
  assert.deepEqual(h.calls, ['PaymentRequests']);
});
