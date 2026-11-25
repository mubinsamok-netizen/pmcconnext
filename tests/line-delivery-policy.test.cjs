const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, env, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, process: { env }, console: { error() {}, warn() {} },
    require: (id) => imports[id] || {}, ...globals,
  });
  return module.exports;
}
function harness(branch, extra = {}) {
  // Fake token/targets and mocked fetch only: never connects to LINE.
  const env = { PMC_BUILD_GIT_BRANCH: branch, LINE_CHANNEL_ACCESS_TOKEN: 'fake-test-token', LINE_GROUP_ID: 'fake-default-group', ...extra };
  let requests = 0;
  const policy = load('src/lib/lineDeliveryPolicy.ts', env);
  const line = load('src/lib/line.ts', env, { './lineDeliveryPolicy': policy }, {
    fetch: async () => { requests++; return { ok: true, json: async () => ({ accepted: true }) }; },
  });
  return { env, policy, line, requests: () => requests };
}

test('protected branch blocks every target and push/reply wrapper before any network request', async () => {
  const h = harness('zoneidea-upgrade-performance');
  const blocked = (error) => error.code === 'LINE_DELIVERY_DISABLED_FOR_BRANCH';
  for (const target of [undefined, 'fake-existing-customer', 'fake-new-site', 'fake-test-group']) {
    await assert.rejects(() => h.line.sendLineMessages([{ type: 'text', text: 'TestbyZoneIdea' }], target), blocked);
  }
  await assert.rejects(() => h.line.replyLineMessages([{ type: 'text', text: 'TestbyZoneIdea' }], 'fake-reply-token'), blocked);
  await assert.rejects(() => h.line.sendLineNotification('TestbyZoneIdea', 'fake-target'), blocked);
  assert.equal(h.requests(), 0);
});

test('main/other known branches keep existing delivery behavior using mocked transport', async () => {
  for (const branch of ['main', 'codex/platform-foundation', 'other-preview']) {
    const h = harness(branch);
    assert.equal(h.policy.isLineDeliveryDisabled(), false);
    await h.line.sendLineMessages([{ type: 'text', text: 'TestbyZoneIdea' }]);
    await h.line.replyLineMessages([{ type: 'text', text: 'TestbyZoneIdea' }], 'fake-reply');
    assert.equal(h.requests(), 2);
  }
});

test('promoted UAT builds remain blocked and unknown branch metadata fails closed', async () => {
  for (const h of [
    harness('zoneidea-upgrade-performance', { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }),
    harness('', { VERCEL_GIT_COMMIT_REF: 'refs/heads/zoneidea-upgrade-performance' }),
    harness(''),
  ]) {
    assert.equal(h.policy.isLineDeliveryDisabled(), true);
    await assert.rejects(() => h.line.sendLineMessages([]), (error) => error.code === 'LINE_DELIVERY_DISABLED_FOR_BRANCH');
    assert.equal(h.requests(), 0);
  }
});

test('branch lock runs even without configured LINE credentials', async () => {
  const h = harness('zoneidea-upgrade-performance', { LINE_CHANNEL_ACCESS_TOKEN: '', LINE_GROUP_ID: '' });
  await assert.rejects(() => h.line.sendLineMessages([]), (error) => error.code === 'LINE_DELIVERY_DISABLED_FOR_BRANCH');
  assert.equal(h.requests(), 0);
});

test('protected accounting webhook ignores events before reading the body or writing/downloading anything', async () => {
  const policy = harness('zoneidea-upgrade-performance').policy;
  let touched = 0;
  const webhook = load('src/app/api/accounting/line-webhook/route.ts', {}, {
    '@/lib/lineDeliveryPolicy': policy,
    'next/server': { NextResponse: { json: (body) => body } },
    '@/lib/accountingSlips': { appendAccountingTransaction: () => { touched++; } },
    '@/lib/drive': { uploadFile: () => { touched++; } },
    '@/lib/line': { replyLineMessages: () => { touched++; } },
  }, { fetch: () => { touched++; } });
  const response = await webhook.POST({ text: () => { touched++; throw new Error('Should not read event'); } });
  assert.equal(response.reason, 'LINE_DELIVERY_DISABLED_FOR_BRANCH');
  assert.equal(touched, 0);
  assert.equal((await webhook.GET()).status, 'disabled_for_branch');
});
