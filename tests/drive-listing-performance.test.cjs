/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const FOLDER = "application/vnd.google-apps.folder";

function loadDrive(tree) {
  const calls = [];
  const drive = { files: { list: async ({ q }) => {
    calls.push(q);
    const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((match) => match[1]);
    const files = parents.flatMap((parent) => (tree[parent] || []).map((file) => ({ ...file, parents: [parent] })));
    return { data: { files } };
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
  return { listDriveFolderFiles, calls };
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

test("Drive requests scale with folder depth, not folder count", async () => {
  const { listDriveFolderFiles, calls } = loadDrive(buildTree(40));
  const files = await listDriveFolderFiles("root", { maxFiles: 500 });
  // 43 folders used to cost 43 sequential requests: root, 1 for level two, 2 chunks of 20 day folders.
  assert.equal(calls.length, 4);
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
