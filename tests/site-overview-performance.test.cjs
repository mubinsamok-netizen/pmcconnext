/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const base = 'src/app/dashboard/sites/[projectId]/';
const project = { project_id: 'P-1', name: 'Site TestbyZoneIdea', status: 'In Progress', start_date: '2026-01-01', end_date: '2030-12-31', site_sheet_id: 'site_p_1' };
function loader(overrides = {}) {
  const modules = new Map();
  return function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const mod = { exports: {} }; modules.set(file, mod);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { module: mod, exports: mod.exports, console, Date, URL, URLSearchParams, setTimeout, clearTimeout,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('@/') || name.startsWith('.')) {
          const stem = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
          return load([`${stem}.ts`, `${stem}.tsx`].find(fs.existsSync));
        }
        return require(name);
      },
    }, { filename: file });
    return mod.exports;
  };
}
const functionTables = {
  Tasks: 'tasks', Milestones: 'milestones', Issues: 'issues', Materials: 'materials', DailyReports: 'daily_reports', WeeklyReports: 'weekly_reports', MonthlyReports: 'monthly_reports', SiteNotes: 'site_notes', SiteMemos: 'site_memos', ProjectDocuments: 'project_documents', DefectRounds: 'defect_rounds', DefectItems: 'defect_items', QcChecklists: 'qc_checklists', CustomerDecisions: 'customer_decisions', VariationOrders: 'variation_orders', VoFinanceLedger: 'vo_finance_ledger', ProjectLifecycle: 'project_lifecycle', ProjectWarranty: 'project_warranty',
};
const logicalTables = { Tasks:'Tasks', Milestones:'Milestones', Issues:'Issues', Materials:'Materials', DailyReports:'Daily_Reports', WeeklyReports:'Weekly_Reports', MonthlyReports:'Monthly_Reports', SiteNotes:'Site_Notes', SiteMemos:'Site_Memos', ProjectDocuments:'Project_Documents', DefectRounds:'Defect_Rounds', DefectItems:'Defect_Items', QcChecklists:'QC_Checklists', CustomerDecisions:'Customer_Decisions', VariationOrders:'Variation_Orders', VoFinanceLedger:'VO_Finance_Ledger', ProjectLifecycle:'Project_Lifecycle', ProjectWarranty:'Project_Warranty' };
function fixtures() {
  const heavy = 'TestbyZoneIdea '.repeat(1000);
  const row = { project_id:'P-1', name:'Name TestbyZoneIdea', title:'Title TestbyZoneIdea', description:'Description TestbyZoneIdea', summary:'Summary TestbyZoneIdea', document_no:'DOC-TestbyZoneIdea', ref_no:'REF-TestbyZoneIdea', created_at:'2026-01-01T00:00:00Z', updated_at:'2026-02-01T00:00:00Z', status:'In Progress', priority:'high', active:true, date:'2026-01-01', due_date:'2030-01-01', body:heavy, detail:heavy, notes:heavy, photos:[heavy], attachments:[heavy], snapshot:{ large:heavy }, evidence_files:[heavy], items:[heavy], personnel:[heavy], progress:[heavy], work_quantities:[heavy], supporting_docs:heavy, revision_history:[heavy], task_type:'subtask', percent_done:50, start_date:'2026-01-01', end_date:'2030-01-01', planned_start:'2026-01-01', planned_end:'2030-01-01', assignee:'SE TestbyZoneIdea', weather:'Sunny', work_done:'Work TestbyZoneIdea', report_date:'2026-02-01', week_start:'2026-01-01', week_end:'2026-01-07', month:'2026-01', month_start:'2026-01-01', month_end:'2026-01-31', follow_up_date:'2030-01-01', pinned:true, archived:false, event_date:'2026-01-01', issue_date:'2026-01-01', requires_customer_ack:true, has_time_impact:true, extension_days:2, acknowledged_by:'Customer TestbyZoneIdea', acknowledged_date:'2026-02-01', mime_type:'image/jpeg', inspection_date:'2026-01-01', notified_at:'2026-01-01T00:00:00Z', decided_at:'2026-02-01T00:00:00Z', customer_approved_at:'2026-02-01T00:00:00Z', grand_total:500, balance:100, entry_date:'2026-01-01', order_date:'2026-01-01', delivery_date:'2026-01-02' };
  const db = Object.fromEntries(Object.values(functionTables).map(table => [table,[{...row}]]));
  for (const [table, id] of Object.entries({tasks:'task_id',milestones:'milestone_id',issues:'issue_id',materials:'material_id',daily_reports:'report_id',weekly_reports:'report_id',monthly_reports:'report_id',site_notes:'note_id',site_memos:'memo_id',project_documents:'document_id',defect_rounds:'round_id',defect_items:'item_id',qc_checklists:'qc_id',customer_decisions:'decision_id',variation_orders:'vo_id',vo_finance_ledger:'ledger_id'})) db[table][0][id] = `${id}-TestbyZoneIdea`;
  db.tasks.push({...db.tasks[0],task_id:'heading',task_type:'heading',percent_done:100});
  db.site_notes.push({...db.site_notes[0],note_id:'archived',archived:true});
  return db;
}

test('projected overview reads preserve every summary and calendar event while omitting heavy detail payloads', async () => {
  const db = fixtures(); const calls = [];
  const load = loader({ '@/lib/supabaseRest': { isSupabaseBackend: () => true, supabaseSelect: async (table, params) => {
    calls.push({table,params});
    if (params.select) return db[table].map(row => Object.fromEntries(params.select.split(',').map(key => [key,row[key]])));
    return db[table];
  } }, '@/lib/supabaseSchema': { getSupabaseSiteSchema: async () => 'site_p_1' }, '@/lib/sheetsCrud': {}, '@/lib/sheetsSetup': {}, '@/lib/siteContext': {} });
  const model = load('src/lib/supabaseReadModel.ts');
  const all = {}, projected = {};
  for (const name of Object.keys(functionTables)) {
    all[logicalTables[name]] = await model[`getSupabase${name}`]('P-1');
    projected[logicalTables[name]] = await model[`getSupabase${name}`]('P-1',false,true);
  }
  const data = load(base+'overviewData.ts');
  const normal = await data.getDashboardData(project,Promise.resolve(all));
  const reduced = await data.getDashboardData(project,Promise.resolve(projected));
  assert.deepEqual(JSON.parse(JSON.stringify(reduced)),JSON.parse(JSON.stringify(normal)));
  assert.equal(reduced.error,'');
  assert.equal(reduced.planning.workTaskCount,1);
  assert.equal(reduced.planning.averageProgress,50);
  assert.equal(reduced.notes.activeCount,1);
  assert.equal(reduced.commercial.voAmount,500);
  assert.ok(reduced.calendarEvents.length > 10);
  const projectedCalls = calls.filter(call => call.params.select);
  assert.equal(projectedCalls.length,16);
  assert.ok(projectedCalls.every(call => call.params.project_id === 'eq.P-1'));
  assert.ok(projectedCalls.every(call => !('limit' in call.params)));
  const daily = projectedCalls.find(call => call.table==='daily_reports').params.select.split(',');
  assert.ok(!daily.includes('photos') && !daily.includes('personnel'));
  assert.ok(JSON.stringify(projected).length < JSON.stringify(all).length / 5);
});

test('main cards and progress finish while secondary data is still pending; every source table is read once', async () => {
  const calls=[]; let release; let contextCalls=0;
  const load = loader({ '@/lib/supabaseRest': { isSupabaseBackend: () => true }, '@/lib/sheetsSetup': {},
    '@/lib/siteContext': { getProjectContext: async () => { contextCalls++; return {sheetId:'site_p_1'}; } },
    '@/lib/sheetsCrud': { findAllBatch: async (tables,sheetId,options) => {
      calls.push({tables,sheetId,options});
      if(tables.includes('Materials')) return new Promise(resolve => { release=resolve; });
      return tables.includes('Tasks') ? {Tasks:[{project_id:'P-1',task_type:'subtask',percent_done:50}]} : {};
    } }
  });
  const streams = load(base+'overviewLoading.ts').createOverviewStreams(project);
  let complete=false; void streams.complete.then(()=>{complete=true;});
  const progress=await streams.tasks;
  const primary=await streams.primary;
  assert.equal(progress.Tasks[0].percent_done,50);
  assert.equal(primary.planning.averageProgress,50);
  assert.equal(primary.calendarEvents.length,0);
  assert.equal(complete,false);
  const tables=calls.flatMap(call=>call.tables);
  assert.equal(tables.length,18); assert.equal(new Set(tables).size,18);
  assert.equal(contextCalls,1);
  assert.ok(calls.every(call=>call.options.projectId==='P-1' && call.options.overviewOnly===true));
  release({}); await streams.complete;
  assert.equal(complete,true);
});

test('authorized page returns the shell and separate Suspense boundaries without awaiting any data stream', async () => {
  let started=false;
  const never=new Promise(()=>{});
  const load=loader({ '@/lib/sheetsCrud': {}, '@/lib/sheetsSetup': {}, '@/lib/siteContext': {}, '@/lib/supabaseRest': { isSupabaseBackend: () => true }, '@/lib/currentSession':{getCurrentSession:async()=>({user:{role:'Admin'}})}, '@/lib/masterProjects':{getMasterProject:async()=>project},
    './overviewLoading':{createOverviewStreams:()=>{started=true;return {tasks:never,primary:never,complete:never};}} });
  const Page=load(base+'page.tsx').default;
  const element=await Page({params:Promise.resolve({projectId:'P-1'})});
  assert.equal(started,true);
  const children=React.Children.toArray(element.props.children);
  assert.equal(children.filter(child=>child.type===React.Suspense).length,2);
  assert.equal(children[0].props.project.name,project.name);
});

test('project denial prevents all overview data streams from starting', async () => {
  let started=false;
  const load=loader({ '@/lib/sheetsCrud': {}, '@/lib/sheetsSetup': {}, '@/lib/siteContext': {}, '@/lib/supabaseRest': { isSupabaseBackend: () => true },
    '@/lib/currentSession': {getCurrentSession:async()=>({user:{role:'Staff'}})},
    '@/lib/masterProjects': {getMasterProject:async()=>{throw new Error('DENIED');}},
    './overviewLoading':{createOverviewStreams:()=>{started=true;}} });
  const Page=load(base+'page.tsx').default;
  await assert.rejects(()=>Page({params:Promise.resolve({projectId:'FORBIDDEN'})}),/DENIED/);
  assert.equal(started,false);
});

test('streamed secondary view preserves Foreman calendar visibility', async () => {
  const load=loader({ '@/lib/sheetsCrud': {}, '@/lib/sheetsSetup': {}, '@/lib/siteContext': {}, '@/lib/supabaseRest': {} });
  const Secondary=load(base+'OverviewSecondary.tsx').default;
  const data={actions:[],recent:[],calendarEvents:[
    {id:'allowed',href:'/dashboard/sites/P-1/schedule'},
    {id:'defect',href:'/dashboard/sites/P-1/defects'},
    {id:'finance',href:'/dashboard/sites/P-1/variation-orders'},
  ],planning:{},defects:{},commercial:{},memos:{},notes:{},files:{},reports:{}};
  const element=await Secondary({project,data:Promise.resolve(data),isForeman:true});
  const calendar=React.Children.toArray(element.props.children)[0];
  assert.deepEqual(Array.from(calendar.props.events, event=>event.id),['allowed']);
});
