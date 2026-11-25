const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function compile(path, globals) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: () => ({}), console, ...globals });
  return module.exports;
}
const good = { success: true, data: [{ id: 'TestbyZoneIdea' }], nextCursor: null, complete: true };
function response(status, body, retryAfter = null) {
  return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, json: async () => body };
}

test('transient Drive failures resume automatically with bounded backoff', async () => {
  const delays = [], requests = [];
  const responses = [response(503, { error: 'Busy' }), response(429, { error: 'Throttled' }, '7'), response(200, good)];
  const api = compile('src/lib/driveListingLoading.ts', {
    fetch: async (_url, init) => { requests.push(init); return responses.shift(); },
    setTimeout: (run, delay) => { delays.push(delay); queueMicrotask(run); },
  });
  const result = await api.fetchDriveListingPage(['/api/sites/TestbyZoneIdea/drive-files', 0, 'cursor']);
  assert.equal(result.data[0].id, 'TestbyZoneIdea');
  assert.deepEqual(delays, [1000, 7000]);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].headers['X-PMC-No-Global-Loading'], '1');
  requests.forEach((request) => assert.equal(JSON.parse(request.body).cursor, 'cursor'));
});

test('permanent failures stop after three requests', async () => {
  let attempts = 0;
  const api = compile('src/lib/driveListingLoading.ts', {
    fetch: async () => { attempts++; return response(500, { error: 'Unavailable' }); },
    setTimeout: (run) => queueMicrotask(run),
  });
  await assert.rejects(() => api.fetchDriveListingPage(['/drive', 0, null]), /Unavailable/);
  assert.equal(attempts, 3);
});

test('denied access is not retried; only an expired Drive cursor requests a restart', async () => {
  for (const [status, message, restart] of [[403, 'Forbidden', false], [400, 'Invalid cursor type', false], [400, 'Invalid or expired Drive cursor; refresh the listing', true]]) {
    let attempts = 0;
    const api = compile('src/lib/driveListingLoading.ts', {
      fetch: async () => { attempts++; return response(status, { error: message }); },
      setTimeout: () => { throw new Error('Unexpected retry'); },
    });
    await assert.rejects(() => api.fetchDriveListingPage(['/drive', 0, 'cursor']), (error) => error.restart === restart && error.status === status);
    assert.equal(attempts, 1);
  }
});

test('continuation yields a paint, runs once, and cancels cleanly on navigation', () => {
  const frames = new Map(), timers = new Map();
  let id = 0, count = 0;
  const window = {
    requestAnimationFrame: (run) => { frames.set(++id, run); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (run) => { timers.set(++id, run); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const api = compile('src/lib/driveListingLoading.ts', { window });
  const frame = () => { const work = [...frames.values()]; frames.clear(); work.forEach((run) => run()); };
  api.afterDriveListingPaint(() => count++);
  assert.equal(count, 0); frame(); assert.equal(count, 0); frame(); assert.equal(count, 1);
  assert.equal(timers.size, 0);
  const cancel = api.afterDriveListingPaint(() => count++);
  cancel(); frame(); frame(); assert.equal(count, 1);
  api.afterDriveListingPaint(() => count++);
  [...timers.values()].forEach((run) => run()); frame(); frame(); assert.equal(count, 2);
});

function hookHarness() {
  const slots = [], pending = [], scheduled = [];
  let index = 0;
  const same = (a, b) => a && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useState: (initial) => {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo: (work, deps) => {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: work(), deps };
      return slots[i].value;
    },
    useEffect: (work, deps) => {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        pending.push(() => { slots[i].cleanup = work(); });
      }
    },
  };
  react.useCallback = (work, deps) => react.useMemo(() => work, deps);
  const state = { data: [{ data: [{ id: 'TestbyZoneIdea' }], nextCursor: 'next', complete: false }], error: undefined, isValidating: false };
  const sizes = [], mutations = [];
  const setSize = async (size) => { sizes.push(size); };
  const mutate = async (...args) => { mutations.push(args); };
  let refreshes = 0;
  const api = compile('src/lib/useDriveFiles.ts', {
    require: (id) => id === 'react' ? react : id === 'swr/infinite' ? { default: (getKey) => ({ ...(getKey(0, null) ? state : { data: undefined, error: undefined, isValidating: false }), setSize, mutate }) } : {
      afterDriveListingPaint: (run) => {
        const entry = { run, cancelled: false }; scheduled.push(entry);
        return () => { entry.cancelled = true; };
      },
    },
    fetch: async () => { refreshes++; return { ok: true }; },
  });
  return { state, sizes, mutations, refreshes: () => refreshes,
    render: () => { index = 0; const result = api.useDriveFiles('/api/sites/TestbyZoneIdea/drive-files'); pending.splice(0).forEach((run) => run()); return result; },
    paint: () => scheduled.splice(0).forEach((entry) => { if (!entry.cancelled) entry.run(); }),
  };
}

test('hook loads the next batch after render and retains files during an automatic cursor restart', async () => {
  const h = hookHarness();
  assert.equal(h.render().data.data.length, 0);
  assert.equal(h.sizes.length, 0);
  h.paint();
  assert.equal(h.render().data.data.length, 1);
  assert.equal(h.sizes.length, 0);
  h.paint(); assert.equal(h.sizes[0], 2);
  h.state.error = Object.assign(new Error('Expired cursor'), { restart: true });
  const failed = h.render();
  assert.equal(failed.error, undefined);
  assert.equal(failed.isLoading, true);
  h.paint();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.refreshes(), 1);
  h.state.error = undefined; h.state.data = undefined; h.state.isValidating = true;
  const restarting = h.render();
  assert.equal(restarting.data.data[0].id, 'TestbyZoneIdea');
  assert.equal(restarting.isLoading, true);
});

test('repeated cursor failures stop after two automatic restarts', async () => {
  const h = hookHarness();
  h.render(); h.paint();
  h.state.error = Object.assign(new Error('Expired'), { restart: true });
  for (let i = 0; i < 2; i++) {
    assert.equal(h.render().error, undefined);
    h.paint();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(h.render().error.message, 'Expired');
  h.paint(); assert.equal(h.refreshes(), 2);
});

test('manual continuation keeps successful cached pages and completion schedules no extra request', () => {
  const h = hookHarness();
  h.render(); h.paint();
  h.state.error = Object.assign(new Error('Unavailable'), { status: 503 });
  h.render().retry();
  const revalidate = h.mutations[0][1].revalidate;
  assert.equal(revalidate(h.state.data[0], ['/drive', 0, null]), false);
  assert.equal(revalidate(undefined, ['/drive', 0, 'next']), true);
  h.state.error = undefined;
  h.state.data = [{ data: [{ id: 'TestbyZoneIdea' }], nextCursor: null, complete: true }];
  assert.equal(h.render().isLoading, false);
  h.paint(); assert.equal(h.sizes.length, 0);
});
