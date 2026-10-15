/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (key) => dependencies[key], Error });
  return exports;
}
const templates = load("src/lib/scheduleTemplates.ts");
const editor = load("src/lib/scheduleTemplateEditor.ts", { "./scheduleTemplates": templates });
const row = (id, parentId = "", type = "subtask") => ({ id, name: id, parentId, type, notes: "" });
const original = [row("root", "", "heading"), row("a", "root", "heading"), row("a1", "a"), row("b", "root"), row("other", "", "heading")];
const plain = (value) => JSON.parse(JSON.stringify(value));
const ids = (items) => plain(items.map((item) => item.id));
function idFactory() { let counter = 0; return () => `new-${++counter}`; }

test("new row inherits sibling level and type, and is inserted after its entire subtree", () => {
  const added = editor.insertTemplateRow(original, "a", "sibling", idFactory());
  assert.deepEqual(ids(added.items), ["root", "a", "a1", "new-1", "b", "other"]);
  assert.equal(added.items[3].parentId, "root");
  assert.equal(added.items[3].type, "heading");
  const child = editor.insertTemplateRow(original, "a", "child", idFactory());
  assert.equal(child.items.find((item) => item.id === child.id).parentId, "a");
  assert.throws(() => editor.insertTemplateRow(original, "b", "child", idFactory()));
});

test("multi-row copy remaps nested parents and does not copy selected descendants twice", () => {
  const copied = editor.duplicateTemplateRows(original, ["a", "a1", "b"], idFactory());
  assert.equal(copied.ids.length, 3);
  const branch = copied.items.filter((item) => copied.ids.includes(item.id));
  assert.equal(branch[1].parentId, branch[0].id);
  assert.equal(branch[0].parentId, "root");
  assert.equal(branch[2].parentId, "root");
  assert.equal(new Set(copied.items.map((item) => item.id)).size, copied.items.length);
  templates.validateTemplateItems(copied.items);
  assert.deepEqual(ids(original), ["root", "a", "a1", "b", "other"]);
});

test("indent and outdent move the whole subtree without stealing later siblings", () => {
  const indented = editor.changeTemplateLevel(original, "b", "in");
  assert.equal(indented.find((item) => item.id === "b").parentId, "a");
  const outdented = editor.changeTemplateLevel(original, "a", "out");
  assert.deepEqual(ids(outdented), ["root", "b", "a", "a1", "other"]);
  assert.equal(outdented.find((item) => item.id === "a").parentId, "");
  assert.equal(outdented.find((item) => item.id === "a1").parentId, "a");
  templates.validateTemplateItems(outdented);
  assert.throws(() => editor.changeTemplateLevel(original, "root", "out"));
  assert.throws(() => editor.changeTemplateLevel(original, "a", "in"));
});

test("indent automatically promotes the preceding task to a heading", () => {
  const next = editor.changeTemplateLevel([row("a"), row("b")], "b", "in");
  assert.equal(next[0].type, "heading");
  assert.equal(next[1].parentId, "a");
  templates.validateTemplateItems(next);
});

test("Excel paste parses tab-delimited cells, quoted multiline notes and embedded quotes", () => {
  const parsed = editor.parseTemplateClipboard('งานแรก\t"หมายเหตุ\nบรรทัดสอง"\r\nงานสอง\t"ขนาด ""พิเศษ"""\r\n');
  assert.deepEqual(plain(parsed), [["งานแรก", "หมายเหตุ\nบรรทัดสอง"], ["งานสอง", 'ขนาด "พิเศษ"']]);
  assert.deepEqual(plain(editor.parseTemplateClipboard("งาน\t\n")), [["งาน", ""]]);
  assert.throws(() => editor.parseTemplateClipboard('"unfinished\n'));
});

test("paste updates visible rows only; overflow adds siblings with inherited structure", () => {
  const input = original.map((item) => ({ ...item }));
  const before = plain(input);
  const next = editor.pasteTemplateCells(input, ["root", "a", "b", "other"], "a", "name", [["แก้หัวข้อ", "note"], ["แก้งาน"]], idFactory());
  assert.equal(next.find((item) => item.id === "a1").name, "a1");
  assert.equal(next.find((item) => item.id === "b").name, "แก้งาน");
  assert.deepEqual(plain(input), before);
  const appended = editor.pasteTemplateCells([row("a", "", "heading")], ["a"], "a", "name", [["หนึ่ง"], ["สอง", "บันทึก"]], idFactory());
  assert.equal(appended.length, 2);
  assert.equal(appended[1].type, "heading");
  assert.equal(appended[1].parentId, "");
  assert.equal(appended[1].notes, "บันทึก");
  templates.validateTemplateItems(appended);
});

test("paste rejects extra columns and oversized values without changing the input", () => {
  const before = plain(original);
  assert.throws(() => editor.pasteTemplateCells(original, ids(original), "a", "notes", [["x", "y"]], idFactory()));
  assert.throws(() => editor.pasteTemplateCells(original, ids(original), "a", "name", [["x".repeat(301)]], idFactory()));
  assert.deepEqual(plain(original), before);
});

test("bulk delete includes descendants; insert, duplicate and paste respect 1,000-row limit", () => {
  assert.deepEqual([...editor.branchIds(original, ["a", "a1"])].sort(), ["a", "a1"]);
  const full = Array.from({ length: 1000 }, (_, index) => row(String(index)));
  assert.throws(() => editor.insertTemplateRow(full, "999", "sibling", idFactory()));
  assert.throws(() => editor.duplicateTemplateRows(full, ["0"], idFactory()));
  assert.throws(() => editor.pasteTemplateCells(full, ids(full), "999", "name", [["x"], ["y"]], idFactory()));
  assert.equal(full.length, 1000);
});
