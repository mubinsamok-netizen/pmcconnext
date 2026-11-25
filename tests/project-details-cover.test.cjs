/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const sharp=require('sharp');
function loader(overrides={}){
 const loaded=new Map();
 return function load(file){
  file=path.resolve(file);if(loaded.has(file))return loaded.get(file).exports;
  const mod={exports:{}};loaded.set(file,mod);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,console,Response,Buffer,URL,Date,require(name){
   if(Object.hasOwn(overrides,name))return overrides[name];
   if(name.startsWith('@/')||name.startsWith('.')){const stem=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);return load([`${stem}.ts`,`${stem}.tsx`].find(fs.existsSync));}
   return require(name);
  }},{filename:file});return mod.exports;
 };
}
const id='1TestbyZoneIdea1234567890';const backup='2TestbyZoneIdea1234567890';
const route=(value)=>`/api/drive/files/${value}?thumbnail=card`;

test('details cover accepts trimmed IDs, full Drive links stored as IDs, and legacy Drive URLs',()=>{
 const sources=loader()('src/lib/projectCover.ts').getProjectCoverSources;
 for(const cover_file_id of [` ${id} `,`https://drive.google.com/file/d/${id}/view?usp=sharing`,`https://drive.google.com/open?id=${id}`,`/api/drive/files/${id}`])assert.deepEqual(Array.from(sources({cover_file_id})),[route(id)]);
 assert.deepEqual(Array.from(sources({cover_file_id:'invalid',cover_url:`https://drive.google.com/uc?export=view&id=${id}`})),[route(id)]);
 assert.deepEqual(Array.from(sources({cover_file_id:id,cover_url:`https://drive.google.com/file/d/${id}/view`})),[route(id)]);
 assert.deepEqual(Array.from(sources({cover_file_id:id,cover_url:`https://drive.google.com/file/d/${backup}/view`})),[route(id),route(backup)]);
});

test('external covers remain direct, unsafe/invalid values do not become image requests',()=>{
 const sources=loader()('src/lib/projectCover.ts').getProjectCoverSources;
 assert.deepEqual(Array.from(sources({cover_url:'https://example.com/d/photo.jpg'})),['https://example.com/d/photo.jpg']);
 assert.deepEqual(Array.from(sources({cover_url:'/images/cover.jpg'})),['/images/cover.jpg']);
 for(const cover_url of ['javascript:alert(1)','//example.com/image.jpg','not a file','   '])assert.equal(sources({cover_url}).length,0);
});

test('cover failure advances once to its backup, then shows a readable fallback instead of a broken image',()=>{
 const states=[];let cursor=0;
 const load=loader({react:{useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];}}});
 const Cover=load('src/app/dashboard/sites/[projectId]/details/ProjectDetailsCover.tsx').default;
 const render=()=>{cursor=0;return Cover({sources:['/first','/backup'],name:'TestbyZoneIdea'});};
 const image=tree=>React.Children.toArray(tree.props.children).find(child=>child.type==='img');
 let node=render();const first=image(node);
 assert.equal(first.props.loading,'eager');assert.equal(first.props.fetchPriority,'high');
 first.props.onError();first.props.onError();node=render();
 assert.equal(image(node).props.src,'/backup');
 image(node).props.onLoad();node=render();assert.equal(React.Children.toArray(node.props.children).length,1);
 image(node).props.onError();node=render();assert.equal(node.props.role,'status');
 assert.ok(React.Children.toArray(node.props.children).some(child=>child.props?.children==='ไม่สามารถโหลดรูปโครงการได้'));
});

test('details render existing fields and a thumbnail without reading other site modules or Drive on the server',async()=>{
 let reads=0;
 const project={project_id:'P-TestbyZoneIdea',name:'Site TestbyZoneIdea',client:'Client TestbyZoneIdea',cover_file_id:`https://drive.google.com/file/d/${id}/view`,budget:'1000',start_date:'2026-01-01',end_date:'2026-12-31',se_name:'SE TestbyZoneIdea'};
 const load=loader({'@/lib/masterProjects':{getMasterProject:async projectId=>{reads++;assert.equal(projectId,project.project_id);return project;}},'@/lib/supabaseRest':{isSupabaseBackend:()=>true},'@/lib/supabaseSchema':{isSupabaseSiteSchemaMode:()=>true,getSupabaseSiteSchemaName:()=> 'site_test'}});
 const Page=load('src/app/dashboard/sites/[projectId]/details/page.tsx').default;
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({projectId:project.project_id})}));
 assert.equal(reads,1);assert.ok(html.includes(route(id)));assert.ok(html.includes(project.client));assert.ok(html.includes(project.se_name));assert.ok(html.includes('2026-12-31'));assert.ok(html.includes('site_test'));assert.ok(!html.includes(encodeURIComponent('https://drive.google.com')));
});

test('existing Drive card mode serves smaller images, reuses its cache, and leaves original downloads unchanged',async()=>{
 const original=await sharp({create:{width:2000,height:1200,channels:3,background:'#c95418'}}).png().toBuffer();let calls=0;
 const load=loader({'@/lib/google':{drive:{files:{get:async args=>{calls++;return args.alt==='media'?{data:original}:{data:{mimeType:'image/png',name:'Cover TestbyZoneIdea.png'}};}}}}});
 const GET=load('src/app/api/drive/files/[fileId]/route.ts').GET;
 const ctx={params:Promise.resolve({fileId:id})};
 const thumbnail=await GET(new Request('https://test.invalid/api/drive/files/'+id+'?thumbnail=card'),ctx);
 assert.equal(thumbnail.status,200);const buffer=Buffer.from(await thumbnail.arrayBuffer());
 const meta=await sharp(buffer).metadata();assert.ok(meta.width<=760&&meta.height<=460);assert.ok(buffer.length<original.length);assert.equal(calls,2);
 assert.equal(thumbnail.headers.get('cache-control'),'private, max-age=3600');
 await GET(new Request('https://test.invalid/api/drive/files/'+id+'?thumbnail=card'),ctx);assert.equal(calls,2);
 const download=await GET(new Request('https://test.invalid/api/drive/files/'+id),ctx);
 assert.deepEqual(Buffer.from(await download.arrayBuffer()),original);assert.equal(calls,4);
});
