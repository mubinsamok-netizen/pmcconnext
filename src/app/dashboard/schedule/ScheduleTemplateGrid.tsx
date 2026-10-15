"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Copy, IndentDecrease, IndentIncrease, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { templateStructure, type TemplateItem } from "@/lib/scheduleTemplates";
import { branchIds, changeTemplateLevel, duplicateTemplateRows, insertTemplateRow, parseTemplateClipboard,
  pasteTemplateCells, type TemplateColumn } from "@/lib/scheduleTemplateEditor";
import styles from "./schedule-template-grid.module.css";

const makeId = () => `item-${crypto.randomUUID()}`;
const columns: TemplateColumn[] = ["name", "notes"];

export default function ScheduleTemplateGrid({ items, disabled, onChange }: {
  items: TemplateItem[];
  disabled: boolean;
  onChange: (items: TemplateItem[]) => void;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id || "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<{ past: TemplateItem[][]; future: TemplateItem[][] }>({ past: [], future: [] });
  const [notice, setNotice] = useState("");
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const fields = useRef(new Map<string, HTMLInputElement>());
  const editGroup = useRef<string | null>(null);
  const selectionAnchor = useRef<string | null>(null);
  const shiftSelection = useRef(false);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const tasks = useMemo(() => templateStructure(items).tasks, [items]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const active = byId.get(activeId);
  const selected = selectedIds.filter((id) => byId.has(id));
  const targets = selected.length ? selected : active ? [active.id] : [];
  const visible = tasks.filter((task) => {
    let parent = byId.get(task.parentTemplateId);
    while (parent) {
      if (collapsed.has(parent.id)) return false;
      parent = byId.get(parent.parentId);
    }
    return true;
  });
  const visibleIds = visible.map((task) => task.templateId);
  const hasChildren = new Set(items.map((item) => item.parentId).filter(Boolean));
  const deleting = deleteIds ? branchIds(items, deleteIds) : new Set<string>();

  useEffect(() => {
    if (deleteIds) confirmRef.current?.showModal();
    else confirmRef.current?.close();
  }, [deleteIds]);

  function focus(id: string, column: TemplateColumn = "name") {
    setActiveId(id);
    requestAnimationFrame(() => {
      const field = fields.current.get(`${id}:${column}`);
      field?.focus();
      field?.select();
    });
  }

  function commit(next: TemplateItem[], group: string | null = null) {
    if (disabled || next === items) return;
    if (!group || editGroup.current !== group) {
      setHistory((current) => ({ past: [...current.past.slice(-49), items], future: [] }));
    } else setHistory((current) => ({ ...current, future: [] }));
    editGroup.current = group;
    onChange(next);
  }

  function undo(redo = false) {
    if (disabled) return;
    const source = redo ? history.future : history.past;
    const next = source.at(-1);
    if (!next) return;
    setHistory(redo ? { past: [...history.past, items], future: history.future.slice(0, -1) }
      : { past: history.past.slice(0, -1), future: [...history.future, items] });
    editGroup.current = null;
    onChange(next);
    setNotice(redo ? "ทำซ้ำแล้ว" : "ย้อนกลับแล้ว");
  }

  function action(run: () => void) {
    if (disabled) return;
    setNotice("");
    try { run(); } catch (error) { setNotice(error instanceof Error ? error.message : "ปรับรายการไม่สำเร็จ"); }
  }

  function add(mode: "sibling" | "child" | "root") {
    action(() => {
      const added = insertTemplateRow(items, activeId, mode, makeId);
      commit(added.items);
      if (mode === "child") setCollapsed((current) => { const next = new Set(current); next.delete(activeId); return next; });
      setSelectedIds([]);
      focus(added.id);
    });
  }

  function level(direction: "in" | "out") {
    action(() => {
      commit(changeTemplateLevel(items, activeId, direction));
      // Reveal a row after moving it under a previously collapsed heading.
      setCollapsed(new Set());
      focus(activeId);
    });
  }

  function selectRow(id: string, checked: boolean) {
    const from = selectionAnchor.current ? visibleIds.indexOf(selectionAnchor.current) : -1;
    const to = visibleIds.indexOf(id);
    const range = shiftSelection.current && from >= 0 ? visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
    setSelectedIds((current) => checked ? [...new Set([...current, ...range])] : current.filter((key) => !range.includes(key)));
    selectionAnchor.current = id;
    shiftSelection.current = false;
    setActiveId(id);
  }

  function cellKey(event: KeyboardEvent<HTMLInputElement>, id: string, column: TemplateColumn) {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
    const row = visibleIds.indexOf(id), col = columns.indexOf(column);
    let nextRow = row, nextCol = col;
    if (event.key === "Enter") nextRow += event.shiftKey ? -1 : 1;
    else if (event.key === "ArrowDown") nextRow++;
    else if (event.key === "ArrowUp") nextRow--;
    else if (event.key === "Tab") {
      nextCol += event.shiftKey ? -1 : 1;
      if (nextCol < 0) { nextRow--; nextCol = 1; }
      if (nextCol > 1) { nextRow++; nextCol = 0; }
    } else return;
    if (nextRow < 0 || nextRow >= visibleIds.length) {
      if (event.key !== "Tab") event.preventDefault();
      return;
    }
    event.preventDefault();
    focus(visibleIds[nextRow], columns[nextCol]);
  }

  function paste(event: ClipboardEvent<HTMLInputElement>, id: string, column: TemplateColumn) {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    action(() => {
      const cells = parseTemplateClipboard(text);
      const next = pasteTemplateCells(items, visibleIds, id, column, cells, makeId);
      commit(next);
      setNotice(`วาง ${cells.length} แถวแล้ว · ย้อนกลับได้ด้วย Ctrl+Z`);
    });
  }

  return <section className={styles.editor} aria-label="ตารางแก้ไขแม่แบบ" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || !(event.ctrlKey || event.metaKey) || deleteIds) return;
    if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") {
      event.preventDefault(); undo(event.shiftKey || event.key.toLowerCase() === "y");
    }
  }}>
    <div className={styles.toolbar}>
      <div className={styles.tools}>
        <button type="button" disabled={disabled || selected.length > 1} onClick={() => add("sibling")}><Plus size={15} /> เพิ่มแถว</button>
        <button type="button" disabled={disabled || active?.type !== "heading" || selected.length > 1} onClick={() => add("child")}>+ งานย่อย</button>
        <button type="button" disabled={disabled} onClick={() => add("root")}>+ หัวข้อหลัก</button>
        <span className={styles.divider} />
        <button type="button" disabled={disabled || !targets.length} onClick={() => action(() => {
          const result = duplicateTemplateRows(items, targets, makeId);
          commit(result.items); setSelectedIds(result.ids); setCollapsed(new Set()); focus(result.ids[0]);
          setNotice(`คัดลอก ${result.ids.length} แถวแล้ว รวมรายการย่อย`);
        })}><Copy size={15} /> คัดลอกแถว</button>
        <button type="button" disabled={disabled || !targets.length} onClick={() => setDeleteIds(targets)}><Trash2 size={15} /> ลบแถว</button>
        <span className={styles.divider} />
        <button type="button" disabled={disabled || !active || selected.length > 1} onClick={() => level("in")} title="ย้ายแถวพร้อมงานย่อยไปใต้แถวก่อนหน้า"><IndentIncrease size={15} /> เยื้องเข้า</button>
        <button type="button" disabled={disabled || !active?.parentId || selected.length > 1} onClick={() => level("out")}><IndentDecrease size={15} /> เยื้องออก</button>
        <button type="button" disabled={disabled || !active || selected.length > 1 || hasChildren.has(activeId)} onClick={() => action(() => {
          commit(items.map((item) => item.id === activeId ? { ...item, type: item.type === "heading" ? "subtask" : "heading" } : item));
        })}>{active?.type === "heading" ? "เปลี่ยนเป็นงาน" : "เปลี่ยนเป็นหัวข้อ"}</button>
      </div>
      <div className={styles.tools}>
        <button type="button" aria-label="ย้อนกลับ" title="ย้อนกลับ (Ctrl+Z)" disabled={disabled || !history.past.length} onClick={() => undo()}><Undo2 size={16} /></button>
        <button type="button" aria-label="ทำซ้ำ" title="ทำซ้ำ (Ctrl+Shift+Z)" disabled={disabled || !history.future.length} onClick={() => undo(true)}><Redo2 size={16} /></button>
        <button type="button" disabled={disabled} onClick={() => setCollapsed(new Set())}>ขยายทั้งหมด</button>
        <button type="button" disabled={disabled} onClick={() => setCollapsed(new Set(items.filter((item) => !item.parentId && item.type === "heading").map((item) => item.id)))}>ยุบทั้งหมด</button>
      </div>
    </div>
    <div className={styles.hint}>
      <span>คลิกเซลล์เพื่อแก้ · Tab ไปช่องถัดไป · Enter ลงแถวถัดไป · วางจาก Excel ได้ 2 คอลัมน์: ชื่อ / หมายเหตุ</span>
      <strong>{selected.length ? `เลือก ${selected.length} แถว` : `${items.length} รายการ`}</strong>
    </div>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    <div className={styles.scroll}>
      <table className={styles.table} aria-label="รายการในแม่แบบ">
        <colgroup><col style={{ width: 42 }} /><col style={{ width: 110 }} /><col /><col style={{ width: "27%" }} /><col style={{ width: 105 }} /></colgroup>
        <thead><tr>
          <th scope="col"><input type="checkbox" aria-label="เลือกทุกแถวที่แสดง" disabled={disabled || !visible.length}
            ref={(element) => { if (element) element.indeterminate = visibleIds.some((id) => selected.includes(id)) && !visibleIds.every((id) => selected.includes(id)); }}
            checked={visible.length > 0 && visibleIds.every((id) => selected.includes(id))}
            onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visibleIds.includes(id)))} /></th>
          <th scope="col">ลำดับ (WBS)</th><th scope="col">หัวข้อ / รายการงาน</th><th scope="col">หมายเหตุ</th><th scope="col">ประเภท</th>
        </tr></thead>
        <tbody>{visible.map((task) => {
          const id = task.templateId;
          const depth = task.wbs.split(".").length - 1;
          const heading = task.taskType === "heading";
          return <tr key={id} className={`${heading ? styles.heading : ""} ${depth === 0 ? styles.root : ""} ${selected.includes(id) ? styles.selected : ""} ${id === activeId ? styles.active : ""}`}>
            <td className={styles.check}><input type="checkbox" aria-label={`เลือกแถว ${task.wbs}`} disabled={disabled} checked={selected.includes(id)}
              onClick={(event) => { shiftSelection.current = event.shiftKey; }} onKeyDown={(event) => { shiftSelection.current = event.shiftKey; }}
              onChange={(event) => selectRow(id, event.target.checked)} /></td>
            <td className={styles.wbs}>{task.wbs}</td>
            <td><div className={styles.nameCell} style={{ paddingLeft: 8 + Math.min(depth, 6) * 16 }}>
              {hasChildren.has(id) ? <button type="button" disabled={disabled} aria-label={`${collapsed.has(id) ? "ขยาย" : "ยุบ"}หัวข้อ ${task.wbs}`} aria-expanded={!collapsed.has(id)}
                onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}>
                {collapsed.has(id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button> : <span className={styles.treeSpacer} />}
              <input aria-label={`ชื่อ ${task.wbs}`} value={task.name} disabled={disabled} maxLength={300} placeholder={heading ? "ชื่อหัวข้อ" : "ชื่อรายการงาน"}
                ref={(element) => { if (element) fields.current.set(`${id}:name`, element); else fields.current.delete(`${id}:name`); }}
                onFocus={() => setActiveId(id)} onBlur={() => { editGroup.current = null; }}
                onKeyDown={(event) => cellKey(event, id, "name")} onPaste={(event) => paste(event, id, "name")}
                onChange={(event) => commit(items.map((item) => item.id === id ? { ...item, name: event.target.value } : item), `${id}:name`)} />
            </div></td>
            <td><input className={styles.notes} aria-label={`หมายเหตุ ${task.wbs}`} value={task.notes} disabled={disabled} maxLength={2000} placeholder="—"
              ref={(element) => { if (element) fields.current.set(`${id}:notes`, element); else fields.current.delete(`${id}:notes`); }}
              onFocus={() => setActiveId(id)} onBlur={() => { editGroup.current = null; }}
              onKeyDown={(event) => cellKey(event, id, "notes")} onPaste={(event) => paste(event, id, "notes")}
              onChange={(event) => commit(items.map((item) => item.id === id ? { ...item, notes: event.target.value } : item), `${id}:notes`)} /></td>
            <td className={styles.type}>{heading ? depth === 0 ? "หัวข้อหลัก" : `หัวข้อ H${depth + 1}` : "งานย่อย"}</td>
          </tr>;
        })}</tbody>
      </table>
      {!items.length && <div className={styles.empty}>ยังไม่มีรายการ · กด “เพิ่มหัวข้อหลัก” เพื่อเริ่มต้น</div>}
    </div>
    <div className={styles.statusBar}><span>แสดง {visible.length} จาก {items.length} แถว</span><span>แก้ไขฉบับร่าง · เลขลำดับจัดให้อัตโนมัติ</span></div>
    <dialog ref={confirmRef} className={styles.confirm} aria-labelledby="template-delete-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setDeleteIds(null); }}>
      <h4 id="template-delete-title">ลบ {deleting.size} แถวจากร่างแม่แบบ?</h4>
      <p>รวมรายการย่อยใต้หัวข้อที่เลือก หลังลบสามารถกด “ย้อนกลับ” ได้</p>
      <div><button type="button" autoFocus onClick={() => setDeleteIds(null)}>ยกเลิก</button><button type="button" onClick={() => {
        const remaining = items.filter((item) => !deleting.has(item.id));
        commit(remaining); setSelectedIds([]); setDeleteIds(null);
        if (deleting.has(activeId)) setActiveId(remaining.at(-1)?.id || "");
        setNotice(`ลบ ${deleting.size} แถวแล้ว · ย้อนกลับได้ด้วย Ctrl+Z`);
      }}>ลบแถวที่เลือก</button></div>
    </dialog>
  </section>;
}
