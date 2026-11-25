/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const {test}=require('node:test');
const FOLDER='application/vnd.google-apps.folder';
function fixture(tree,{omitParents=false,singleParentOnly=false}={}){
 let calls=0,rows=0,fail=false,now=Date.now();
 class Clock extends Date{static now(){return now;}}
 const drive={files:{list:async({q,pageSize,pageToken})=>{
  calls++;if(fail)throw new Error('Drive unavailable');
  const parents=[...q.matchAll(/'([^']+)' in parents/g)].map(x=>x[1]);
  if(singleParentOnly&&parents.length>1)return {data:{files:[]}};
  const all=parents.flatMap(id=>(tree[id]||[]).map(f=>({...f,...(!omitParents?{parents:[id]}:{})})));
  const offset=Number(pageToken||0);const files=all.slice(offset,offset+pageSize);rows+=files.length;
  return {data:{files,nextPageToken:offset+pageSize<all.length?String(offset+pageSize):undefined}};
 }}};
 const deps={'node:crypto':require('node:crypto'),'node:zlib':require('node:zlib'),'next/cache':{unstable_cache:fn=>fn},'./google':{drive},'./driveFilesCache':{driveFilesCacheTag:id=>'qa-'+id}};
 const loaded={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('src/lib/driveListingPages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(source,{module:loaded,exports:loaded.exports,Buffer,Date:Clock,process:{env:{NEXTAUTH_SECRET:'synthetic-test-only-secret'}},require:id=>{assert.ok(deps[id],id);return deps[id];}});
 return {read:loaded.exports.readDriveListingPage,stats:()=>({calls,rows}),fail:value=>{fail=value;},advance:ms=>{now+=ms;}};
}
function treeWithReports(){
 const tree={root:[{id:'photos',name:'Photos',mimeType:FOLDER},{id:'reports',name:'Daily Reports',mimeType:FOLDER}],photos:Array.from({length:1234},(_,i)=>({id:'photo-'+i,name:'Photo '+i,mimeType:'image/jpeg'}))};
 let parent='reports';for(let d=0;d<8;d++){const id='deep-'+d;tree[parent]=[{id,name:'Level '+d,mimeType:FOLDER}];parent=id;}
 tree[parent]=[{id:'daily-pdf',name:'Daily Report TestbyZoneIdea.pdf',mimeType:'application/pdf'}];return tree;
}
test('progressive listing returns every file beyond 500 and Daily Report beyond depth four',async()=>{
 const f=fixture(treeWithReports());let cursor,all=[],batches=0;
 do{const before=f.stats();const page=await f.read('root',cursor);const after=f.stats();assert.ok(after.calls-before.calls<=3);assert.ok(after.rows-before.rows<=200);assert.ok(page.data.length<=200);all.push(...page.data);cursor=page.nextCursor;batches++;assert.ok(batches<50);}while(cursor);
 const files=all.filter(x=>!x.isFolder);assert.equal(files.length,1235);assert.equal(new Set(files.map(x=>x.id)).size,1235);
 const report=files.find(x=>x.id==='daily-pdf');assert.ok(report.folderPath.startsWith('Daily Reports / Level 0'));assert.ok(report.folderPath.endsWith('Level 7'));assert.ok(batches>1);
});
test('signed continuation cannot be changed or reused for a different site',async()=>{
 const f=fixture(treeWithReports());const first=await f.read('root');assert.ok(first.nextCursor);
 const before=f.stats().calls;
 assert.throws(()=>f.read('another-site',first.nextCursor),/Invalid or expired/);
 const token=first.nextCursor;const i=Math.floor(token.length/2);const changed=token.slice(0,i)+(token[i]==='A'?'B':'A')+token.slice(i+1);
 assert.throws(()=>f.read('root',changed),/Invalid or expired/);assert.equal(f.stats().calls,before);
});
test('expired continuation fails explicitly instead of reporting an incomplete list as complete',async()=>{
 const f=fixture(treeWithReports());const first=await f.read('root');f.advance(3600001);assert.throws(()=>f.read('root',first.nextCursor),/Invalid or expired/);
});
test('a failed page can retry the same continuation without losing pending folders',async()=>{
 const f=fixture(treeWithReports());const first=await f.read('root');f.fail(true);await assert.rejects(f.read('root',first.nextCursor),/Drive unavailable/);f.fail(false);const page=await f.read('root',first.nextCursor);assert.ok(page.data.length);assert.equal(first.complete,false);
});
test('empty folders and cycles terminate without a depth or file cap',async()=>{
 const f=fixture({root:[{id:'empty',name:'Empty',mimeType:FOLDER},{id:'loop',name:'Loop',mimeType:FOLDER}],empty:[],loop:[{id:'root',name:'Root',mimeType:FOLDER}]});let cursor;let pages=0;do{const p=await f.read('root',cursor);cursor=p.nextCursor;assert.ok(++pages<5);}while(cursor);
});

test('single-folder queries retain nested reports even when parent metadata is absent',async()=>{
 const f=fixture(treeWithReports(),{omitParents:true,singleParentOnly:true});let cursor;const all=[];
 do{const page=await f.read('root',cursor);all.push(...page.data);cursor=page.nextCursor;}while(cursor);
 assert.equal(all.filter(x=>!x.isFolder).length,1235);
 assert.ok(all.find(x=>x.id==='daily-pdf')?.folderPath.startsWith('Daily Reports'));
});
