/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const FOLDER = "application/vnd.google-apps.folder";

function loadDrive(tree, { omitParents = false, singleParentOnly = false } = {}) {
  const calls = [];
  let metadataRows = 0;
  const drive = { files: { list: async ({ q, pageSize = 100, pageToken }) => {
    calls.push(q);
    const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((match) => match[1]);
    if (singleParentOnly && parents.length > 1) return { data: { files: [] } };
    const all = parents.flatMap((parent) => (tree[parent] || []).map((file) => ({ ...file, ...(!omitParents ? { parents: [parent] } : {}) })));
    const start = Number(pageToken || 0);
    const files = all.slice(start, start + pageSize);
    metadataRows += files.length;
    return { data: { files, nextPageToken: start + pageSize < all.length ? String(start + pageSize) : undefined } };
  } } };
  const filename = path.resolve(__dirname, "../src/lib/drive.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports, console, Map, Set, Intl, Promise,
    require: (name) => (name === "./google" ? { auth: {}, drive, DRIVE_ROOT_FOLDER_ID: "root" } : require(name)),
  }, { filename });
  // Copy into this realm so deepEqual compares plain arrays.
  const listDriveFolderFiles = async (...args) => Array.from(await loaded.exports.listDriveFolderFiles(...args));
  return { listDriveFolderFiles, calls, metadataRows: () => metadataRows };
}

function buildTree(dayFolders) {
  const tree = {
    root: [
      { id: "photos", name: "Photos", mimeType: FOLDER },
      { id: "drawings", name: "Drawings", mimeType: FOLDER },
      { id: "readme", name: "readme.pdf", mimeType: "application/pdf" },
    ],
    drawings: [{ id: "d1", name: "plan.pdf", mimeType: "application/pdf" }],
    photos: [],
  };
  for (let day = 1; day <= dayFolders; day += 1) {
    tree.photos.push({ id: `day-${day}`, name: `Day ${day}`, mimeType: FOLDER });
    tree[`day-${day}`] = [{ id: `img-${day}`, name: `photo-${day}.jpg`, mimeType: "image/jpeg" }];
  }
  return tree;
}

test("sparse folders retain a separate query for every folder", async () => {
  const { listDriveFolderFiles, calls } = loadDrive(buildTree(40));
  const files = await listDriveFolderFiles("root", { maxFiles: 500 });
  // Single-folder queries keep file association reliable; traversal runs in bounded waves.
  assert.equal(calls.length, 43);
  assert.equal(files.length, 3 + 1 + 40 + 40);
});

test("results keep folder-walk order and folder paths", async () => {
  const { listDriveFolderFiles } = loadDrive(buildTree(11));
  const files = await listDriveFolderFiles("root");
  assert.deepEqual(files.slice(0, 5).map((file) => file.id), ["drawings", "d1", "photos", "day-1", "img-1"]);
  // Natural order: Day 2 before Day 10.
  const days = files.filter((file) => file.id.startsWith("day-")).map((file) => file.name);
  assert.deepEqual(days.slice(0, 3), ["Day 1", "Day 2", "Day 3"]);
  assert.equal(files.find((file) => file.id === "img-10").folderPath, "Photos / Day 10");
  assert.equal(files.at(-1).id, "readme");
});

test("maxFiles and maxDepth still bound the listing", async () => {
  const capped = loadDrive(buildTree(40));
  assert.equal((await capped.listDriveFolderFiles("root", { maxFiles: 10 })).length, 10);
  const shallow = loadDrive(buildTree(5));
  const files = await shallow.listDriveFolderFiles("root", { maxDepth: 0 });
  assert.deepEqual(files.map((file) => file.id), ["drawings", "photos", "readme"]);
  assert.equal(shallow.calls.length, 1);
});

test("parallel full pages share a strict metadata budget", async () => {
  const tree = { root: [] };
  for (let i = 0; i < 100; i++) {
    tree.root.push({ id: `d-${i}`, name: `Day ${i}`, mimeType: FOLDER });
    tree[`d-${i}`] = Array.from({ length: 500 }, (_, j) => ({ id: `f-${i}-${j}`, name: `Photo ${j}`, mimeType: "image/jpeg" }));
  }
  const fixture = loadDrive(tree);
  const files = await fixture.listDriveFolderFiles("root", { pageSize: 500, maxFiles: 500 });
  assert.equal(files.length, 500);
  assert.equal(fixture.metadataRows(), 500); // Previously read 2,600 to return 500.
  assert.ok(fixture.calls.length <= 5);
});

test("Google nextPageToken is followed until the complete listing or budget is reached", async () => {
  const fixture = loadDrive({ root: Array.from({ length: 240 }, (_, i) => ({ id: `f-${i}`, name: `Photo ${i}`, mimeType: "image/jpeg" })) });
  const files = await fixture.listDriveFolderFiles("root", { pageSize: 30, maxFiles: 500 });
  assert.equal(files.length, 240);
  assert.equal(new Set(files.map((file) => file.id)).size, 240);
  assert.equal(fixture.calls.length, 8);
});

test("legacy listing retains all nested files without relying on returned parents or grouped queries", async () => {
  const f = loadDrive(buildTree(40), { omitParents: true, singleParentOnly: true });
  const files = await f.listDriveFolderFiles("root", { maxDepth: Infinity, maxFiles: Infinity });
  assert.equal(files.length, 84);
  assert.equal(files.find(file => file.id === "img-39").folderPath, "Photos / Day 39");
});
