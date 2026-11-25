/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function renderProjects(unavailable) {
  const requests = [];
  const projects = Array.from({ length: 21 }, (_, index) => ({
    project_id: `P-${index + 1}`, name: `Site ${index + 1} TestbyZoneIdea`, status: "In Progress",
  }));
  const overrides = {
    "next-auth/react": { useSession: () => ({ data: { user: { role: "Admin" } } }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    swr: { default: (key) => {
      if (!key) return {};
      requests.push(key);
      if (key === "/api/projects?mode=basic") return { data: { success: true, data: projects } };
      const params = new URL(key, "https://test.invalid").searchParams;
      if (params.getAll("projectId").length !== 1) return { error: new Error("504: combined response blocked by a slow site") };
      const id = params.get("projectId");
      if (id === "P-3") {
        if (unavailable === "pending") return { isLoading: true };
        if (unavailable === "missing") return { data: { success: true, data: [] } };
        return { error: new Error("504") };
      }
      return { data: { success: true, data: [{ project_id: id, percent_done: "50", tasks_count: "10", completed_tasks: "5", overdue_tasks: "0" }] } };
    } },
  };
  const cache = new Map();
  function loadFile(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    }).outputText;
    vm.runInNewContext(source, {
      module: loaded, exports: loaded.exports, console, URL, URLSearchParams,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith("@/")) {
          const base = path.resolve(__dirname, "../src", name.slice(2));
          return loadFile([`${base}.ts`, `${base}.tsx`].find((file) => fs.existsSync(file)));
        }
        return require(name);
      },
    }, { filename });
    return loaded.exports;
  }
  const Page = loadFile(path.resolve(__dirname, "../src/app/dashboard/projects/ProjectsWorkspace.tsx")).default;
  return { html: renderToStaticMarkup(React.createElement(Page)), requests };
}

test("nine cards render health immediately even while one site never responds", () => {
  const { html, requests } = renderProjects("pending");
  assert.equal((html.match(/>50%</g) || []).length, 9);
  assert.equal((html.match(/aria-label="กำลังเตรียมความคืบหน้า"/g) || []).length, 1);
  const health = requests.filter((url) => url.includes("mode=health"));
  assert.equal(health.length, 10);
  assert.ok(health.every((url) => new URL(url, "https://test.invalid").searchParams.getAll("projectId").length === 1));
  assert.ok(!health.some((url) => url.includes("projectId=P-11")));
  assert.ok(!requests.includes("/api/team"));
});

for (const reason of ["failed", "missing"]) {
  test(`one ${reason} health result only affects its own card`, () => {
    const { html } = renderProjects(reason);
    assert.equal((html.match(/>50%</g) || []).length, 9);
    assert.equal((html.match(/role="alert"/g) || []).length, 1);
    assert.equal((html.match(/ลองโหลดความคืบหน้าอีกครั้ง/g) || []).length, 1);
    assert.equal((html.match(/aria-label="กำลังเตรียมความคืบหน้า"/g) || []).length, 0);
    assert.ok(html.includes("Site 3 TestbyZoneIdea"));
  });
}
