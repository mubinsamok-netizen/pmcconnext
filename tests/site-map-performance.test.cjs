/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loader(overrides = {}) {
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const mod = { exports: {} };
    modules.set(file, mod);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { module: mod, exports: mod.exports, console, URLSearchParams, AbortController, Date, setTimeout, clearTimeout,
      fetch: overrides.fetch || fetch,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('.') || name.startsWith('@/')) {
          const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
          return load([`${base}.ts`, `${base}.tsx`].find(fs.existsSync));
        }
        return require(name);
      },
    }, { filename: file });
    return mod.exports;
  }
  return load;
}

const projects = [1, 2].map(id => ({ project_id: `P-${id}`, name: `Site ${id} TestbyZoneIdea`, site_link: `https://maps.google.com/?q=13.${id},100.${id}`, status: 'In Progress', percent_done: '99' }));

test('initial map requests basic sites only; unrequested health is never shown as 0% or normal', () => {
  const requests = [];
  const load = loader({ swr: { default(key) { if (key) requests.push(key); return key?.includes('mode=basic') ? { data: { success: true, data: projects } } : {}; } },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) } });
  const Page = load('src/app/dashboard/site-map/SiteMapWorkspace.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page, { tileUrl: 'https://example.com/{z}/{x}/{y}.png' }));
  assert.deepEqual(requests, ['/api/projects?mode=basic']);
  assert.ok(html.includes('Site 1 TestbyZoneIdea'));
  assert.ok(html.includes('ยังไม่ได้โหลดรายละเอียด'));
  assert.ok(!html.includes('>0%<'));
  assert.ok(!html.includes('>99%<'));
  assert.ok(!/<span[^>]*>ปกติ<\/span>/.test(html));
});

test('only an explicitly selected authorized site requests health and merges its result', () => {
  const requests = [];
  const load = loader({ swr: { default(key) {
    if (key) requests.push(key);
    return { data: key ? { success: true, data: [{ project_id: 'P-2', percent_done: '42', overdue_tasks: '1' }] } : undefined };
  } } });
  const hook = load('src/app/dashboard/site-map/useSiteMapHealth.ts').useSiteMapHealth;
  function Probe({ id }) { const result = hook(projects, id); return React.createElement('pre', null, JSON.stringify(result.projects)); }
  const html = renderToStaticMarkup(React.createElement(Probe, { id: 'P-2' }));
  assert.deepEqual(requests, ['/api/projects?mode=health&projectId=P-2']);
  assert.ok(html.includes('&quot;percent_done&quot;:&quot;42&quot;'));
  requests.length = 0;
  renderToStaticMarkup(React.createElement(Probe, { id: 'NOT-ACCESSIBLE' }));
  assert.equal(requests.length, 0);
});

test('coordinate cache shares in-flight and successful resolutions, changed links miss, failures retry', async () => {
  const stored = new Map();
  const load = loader({ 'next/cache': { unstable_cache(fn, keyParts) {
    const key = JSON.stringify(keyParts);
    return async () => {
      if (stored.has(key)) return stored.get(key);
      const result = await fn(); stored.set(key, result); return result;
    } } } });
  const read = load('src/lib/mapCoordinatesCache.ts').readCachedMapCoordinates;
  let calls = 0;
  let release;
  const slow = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = read('https://maps.app.goo.gl/one', slow);
  const second = read('https://maps.app.goo.gl/one', slow);
  assert.equal(calls, 1);
  release({ lat: 13, lng: 100 });
  await Promise.all([first, second]);
  await read('https://maps.app.goo.gl/one', slow);
  assert.equal(calls, 1);
  await read('https://maps.app.goo.gl/two', async () => { calls++; return { lat: 14, lng: 101 }; });
  assert.equal(calls, 2);
  let failures = 0;
  for (let i = 0; i < 2; i++) assert.equal(await read('https://maps.app.goo.gl/missing', async () => { failures++; return null; }), null);
  assert.equal(failures, 2);
});

// A small hook runner exercises asynchronous batches without a browser or real site writes.
function hookRunner(loadHook) {
  let states = [], deps = [], cursor = 0, effects = [], cleanups = [], result;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useMemo(fn, next) { const i = cursor++; if (!deps[i] || next.some((x, n) => x !== deps[i][n])) { states[i] = fn(); deps[i] = next; } return states[i]; },
    useEffect(fn, next) { const i = cursor++; if (!deps[i] || next.some((x, n) => x !== deps[i][n])) { deps[i] = next; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const hook = loadHook(hooks);
  return { render(input) { cursor = 0; result = hook(input); const pending = effects; effects = []; pending.forEach(fn => fn()); return result; }, unmount() { cleanups.forEach(fn => fn?.()); } };
}

test('coordinate batches publish ready pins before a slow batch, reuse cache and resolve changed links', async () => {
  const requests = [];
  let activeHooks;
  const delegated = Object.fromEntries(['useState', 'useMemo', 'useEffect'].map(name => [name, (...args) => activeHooks[name](...args)]));
  const runnerFactory = () => loader({ react: delegated, fetch: (_url, options) => new Promise(resolve => {
    requests.push({ options, items: JSON.parse(options.body).items, resolve });
  }) })('src/app/dashboard/site-map/useSiteMapCoordinates.ts').useSiteMapCoordinates;
  // Both mounted instances must share the same loaded module for its bounded memory cache.
  let savedHook;
  const factory = hooks => { activeHooks = hooks; savedHook ||= runnerFactory(); return savedHook; };
  const runner = hookRunner(factory);
  const input = Array.from({ length: 9 }, (_, i) => ({ project_id: `B-${i}`, site_link: `https://maps.app.goo.gl/batch-${i}` }));
  assert.equal(runner.render(input).isResolving, true);
  assert.equal(requests.length, 3);
  async function finish(request) {
    request.resolve({ ok: true, json: async () => ({ success: true, data: request.items.map(item => ({ project_id: item.project_id, coordinates: { lat: 13, lng: 100 } })) }) });
    await new Promise(resolve => setImmediate(resolve));
  }
  await finish(requests[0]);
  const partial = runner.render(input);
  assert.equal(Object.keys(partial.resolvedCoordinates).length, 4);
  assert.equal(partial.isResolving, true);
  await finish(requests[1]); await finish(requests[2]);
  assert.equal(runner.render(input).isResolving, false);
  assert.equal(Object.keys(runner.render(input).resolvedCoordinates).length, 9);
  // Health-only changes do not trigger another coordinate request.
  runner.render(input.map(p => ({ ...p, percent_done: '50' })));
  assert.equal(requests.length, 3);
  const changed = input.map((p, i) => i ? p : { ...p, site_link: 'https://maps.app.goo.gl/changed' });
  const before = runner.render(changed);
  assert.equal(requests.length, 4);
  assert.equal(before.resolvedCoordinates['B-0'], undefined);
  assert.equal(Object.keys(before.resolvedCoordinates).length, 8);
  await finish(requests[3]);
  assert.equal(Object.keys(runner.render(changed).resolvedCoordinates).length, 9);
  runner.unmount();
  const remounted = hookRunner(factory);
  assert.equal(Object.keys(remounted.render(changed).resolvedCoordinates).length, 9);
  assert.equal(requests.length, 4);
  remounted.unmount();
});

test('loading sites show skeletons instead of a false missing-coordinate state', () => {
  const load = loader({ swr: { default: key => key ? { isLoading: true } : {} },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) } });
  const Page = load('src/app/dashboard/site-map/SiteMapWorkspace.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Page, { tileUrl: 'https://example.com/{z}/{x}/{y}.png' }));
  assert.ok(html.includes('กำลังเตรียมแผนที่ไซต์งาน'));
  assert.ok(html.includes('กำลังเตรียมรายการไซต์งาน'));
  assert.ok(!html.includes('ไม่มีพิกัดในตัวกรองนี้'));
});

test('coordinate API rejects anonymous reads before consulting cached links', async () => {
  let reads = 0;
  const load = loader({ 'next/server': { NextResponse: Response },
    'next-auth': { getServerSession: async () => null }, '@/lib/authOptions': {},
    '@/lib/mapCoordinatesCache': { readCachedMapCoordinates: async () => { reads++; return { lat: 13, lng: 100 }; } } });
  const response = await load('src/app/api/maps/coordinates/route.ts').POST(new Request('https://test.invalid/api/maps/coordinates', { method: 'POST', body: JSON.stringify({ items: [{ project_id: 'P-1', site_link: 'https://maps.app.goo.gl/test' }] }) }));
  assert.equal(response.status, 401);
  assert.equal(reads, 0);
});
