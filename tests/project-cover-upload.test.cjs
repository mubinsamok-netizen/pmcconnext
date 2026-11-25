/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const sharp=require('sharp');
const ORIGINAL='1originalTestbyZoneIdea1234567890';const PREVIEW='2previewTestbyZoneIdea1234567890';const OLD='3oldTestbyZoneIdea12345678901234';
const PROJECT='P-TestbyZoneIdea';const FOLDER='folder-TestbyZoneIdea';
function loader(overrides={}){
 const modules=new Map();return function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file).exports;
  const mod={exports:{}};modules.set(file,mod);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,console:{...console,warn(){}},Buffer,File,FormData,Request,Response,URL,Date,require(name){
   if(Object.hasOwn(overrides,name))return overrides[name];
   if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);return load([`${base}.ts`,`${base}.tsx`].find(fs.existsSync));}
   return require(name);
  }},{filename:file});return mod.exports;
 };
}
async function imageFile(){const bytes=await sharp({create:{width:2000,height:1200,channels:3,background:'#b3521d'}}).jpeg().withMetadata({orientation:6}).toBuffer();return new File([bytes],'cover-TestbyZoneIdea.jpg',{type:'image/jpeg'});}
function fixture({failPreview=false,failOriginal=false,role='Admin',existing=true}={}){
 const uploads=[];const writes=[];let reads=0;
 const current={_rowIndex:PROJECT,project_id:PROJECT,name:'Site TestbyZoneIdea',drive_folder_id:FOLDER,site_sheet_id:'site_TestbyZoneIdea',cover_file_id:OLD,cover_url:`/api/drive/files/oldPreviewTestbyZoneIdea123456?coverPreview=1&source=${OLD}`};
 const deps={
  'next/server':{NextResponse:Response},'next-auth':{getServerSession:async()=>role?{user:{role}}:null},'@/lib/authOptions':{},
  '@/lib/authz':{clearProjectAccessCache(){}},'@/lib/siteAccess':{isForemanRole:role=>role==='Foreman'},
  '@/lib/drive':{findOrCreateFolder:async()=>({id:FOLDER}),setupProjectFolders:async()=>{throw new Error('Should reuse the supplied test folder');},uploadFile:async(name,mimeType,bytes,parentId)=>{
    uploads.push({name,mimeType,bytes:Buffer.from(bytes),parentId});
    if((uploads.length===1&&failOriginal)||(uploads.length===2&&failPreview))throw new Error('storageQuotaExceeded TestbyZoneIdea');
    const id=uploads.length===1?ORIGINAL:PREVIEW;
    return{id,webViewLink:`https://drive.google.com/file/d/${id}/view`};
  }},
  '@/lib/google':{DRIVE_ROOT_FOLDER_ID:'ROOT'},'@/lib/supabaseRest':{isSupabaseBackend:()=>true},'@/lib/supabaseReadModel':{},
  '@/lib/supabaseSchema':{isSupabaseSiteSchemaMode:()=>false},'@/lib/projectListCache':{},'@/lib/sheetsSetup':{},
  '@/lib/sheetsCrud':{findAllMaster:async()=>{reads++;return existing?[current]:[];},insertMaster:async(table,data)=>{writes.push({table,data});return{inserted:data};},updateMaster:async(table,key,data)=>{writes.push({table,key,data});}},
 };
 const load=loader(deps);return{load,uploads,writes,current,reads:()=>reads};
}
function request(method,file){const body=new FormData();for(const [key,value] of Object.entries({project_id:PROJECT,name:'Site TestbyZoneIdea',site_sheet_id:'site_TestbyZoneIdea',drive_folder_id:FOLDER,line_notify_enabled:'FALSE'}))body.set(key,value);if(file)body.set('cover',file);return new Request('https://test.invalid/api/projects',{method,body});}

test('upload preserves original bytes/EXIF and creates a separate small auto-oriented WebP',async()=>{
 const f=fixture();const file=await imageFile();const result=await f.load('src/lib/uploadProjectCover.ts').uploadProjectCoverFiles(file,PROJECT,FOLDER);
 assert.equal(f.uploads.length,2);assert.deepEqual(f.uploads[0].bytes,Buffer.from(await file.arrayBuffer()));assert.equal(result.id,ORIGINAL);assert.equal(result.previewFileId,PREVIEW);
 const originalMeta=await sharp(f.uploads[0].bytes).metadata();const previewMeta=await sharp(f.uploads[1].bytes).metadata();
 assert.equal(originalMeta.orientation,6);assert.equal(previewMeta.orientation,undefined);assert.equal(previewMeta.format,'webp');assert.ok(previewMeta.width<=760&&previewMeta.height<=460);assert.ok(f.uploads[1].bytes.length<f.uploads[0].bytes.length);
 assert.equal(f.uploads[1].mimeType,'image/webp');assert.ok(f.uploads.every(upload=>upload.parentId===FOLDER));assert.match(f.uploads[1].name,/TestbyZoneIdea\.webp$/);
 const sources=f.load('src/lib/projectCover.ts').getProjectCoverSources({cover_file_id:result.id,cover_url:result.previewUrl});
 assert.equal(sources[0],`/api/drive/files/${PREVIEW}?coverPreview=1&source=${ORIGINAL}`);assert.equal(sources[1],`/api/drive/files/${ORIGINAL}?thumbnail=card`);
});

for(const method of ['POST','PUT'])test(`${method} stores original ID and the preview URL separately with no schema fields added`,async()=>{
 const f=fixture({existing:method==='PUT'});const response=await f.load('src/app/api/projects/route.ts')[method](request(method,await imageFile()));
 assert.equal(response.status,200);assert.equal(f.writes.length,1);const saved=f.writes[0].data;
 assert.equal(saved.cover_file_id,ORIGINAL);assert.equal(saved.cover_url,`/api/drive/files/${PREVIEW}?coverPreview=1&source=${ORIGINAL}`);assert.ok(!('cover_thumbnail_file_id' in saved));
 assert.equal(saved.project_id,PROJECT);assert.equal(f.uploads.length,2);
});

for(const method of ['POST','PUT'])test(`${method} still saves the new original if preview upload runs out of quota`,async()=>{
 const f=fixture({existing:method==='PUT',failPreview:true});const response=await f.load('src/app/api/projects/route.ts')[method](request(method,await imageFile()));
 assert.equal(response.status,200);const body=await response.json();assert.ok(body.warning.includes('รูปต้นฉบับ'));
 assert.equal(f.writes[0].data.cover_file_id,ORIGINAL);assert.equal(f.writes[0].data.cover_url,`https://drive.google.com/file/d/${ORIGINAL}/view`);
 assert.ok(!f.writes[0].data.cover_url.includes(OLD));
});

test('unsupported or empty image conversion still saves the original instead of failing the upload',async()=>{
 for(const bytes of [Buffer.from('unsupported TestbyZoneIdea'),Buffer.alloc(0)]){
  const f=fixture();const result=await f.load('src/lib/uploadProjectCover.ts').uploadProjectCoverFiles(new File([bytes],'invalid-TestbyZoneIdea.jpg',{type:'image/jpeg'}),PROJECT,FOLDER);
  assert.equal(result.id,ORIGINAL);assert.ok(result.previewWarning);assert.equal(f.uploads.length,1);assert.deepEqual(f.uploads[0].bytes,bytes);
 }
});

test('failed original upload never uploads a preview or writes project data',async()=>{
 const f=fixture({failOriginal:true});await assert.rejects(()=>f.load('src/lib/uploadProjectCover.ts').uploadProjectCoverFiles(new File(['bad'],'bad-TestbyZoneIdea.jpg'),PROJECT,FOLDER),/storageQuotaExceeded/);
 assert.equal(f.uploads.length,1);assert.equal(f.writes.length,0);
});

test('metadata-only updates retain both existing cover references and do not upload files',async()=>{
 const f=fixture();const response=await f.load('src/app/api/projects/route.ts').PUT(request('PUT'));
 assert.equal(response.status,200);assert.equal(f.uploads.length,0);assert.equal(f.writes[0].data.cover_file_id,f.current.cover_file_id);assert.equal(f.writes[0].data.cover_url,f.current.cover_url);
});

for(const role of [null,'Foreman'])test(`unauthorized ${role} cannot create or replace cover assets`,async()=>{
 const f=fixture({role});const api=f.load('src/app/api/projects/route.ts');
 for(const method of ['POST','PUT'])assert.equal((await api[method](request(method,await imageFile()))).status,role?403:401);
 assert.equal(f.uploads.length,0);assert.equal(f.writes.length,0);assert.equal(f.reads(),0);
});

test('stored preview URL is preferred, but mismatched/cleared references never show a stale thumbnail',()=>{
 const helpers=loader()('src/lib/projectCover.ts');const url=helpers.makeProjectCoverPreviewUrl(ORIGINAL,PREVIEW);
 assert.equal(helpers.getProjectCoverSources({cover_file_id:ORIGINAL,cover_url:url})[0],url);
 assert.deepEqual(Array.from(helpers.getProjectCoverSources({cover_file_id:OLD,cover_url:url})),[`/api/drive/files/${OLD}?thumbnail=card`]);
 assert.equal(helpers.getProjectCoverSources({cover_file_id:'',cover_url:url}).length,0);
});

test('reading a stored preview downloads only that file and does not resize or fetch the original',async()=>{
 const bytes=await sharp({create:{width:760,height:460,channels:3,background:'#db641f'}}).webp().toBuffer();const calls=[];
 const load=loader({'@/lib/google':{drive:{files:{get:async args=>{calls.push(args);return args.alt==='media'?{data:bytes}:{data:{mimeType:'image/webp',name:'preview-TestbyZoneIdea.webp'}};}}}},sharp:()=>{throw new Error('Stored previews must not be resized on read');}});
 const response=await load('src/app/api/drive/files/[fileId]/route.ts').GET(new Request(`https://test.invalid/api/drive/files/${PREVIEW}?coverPreview=1&source=${ORIGINAL}`),{params:Promise.resolve({fileId:PREVIEW})});
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.ok(calls.every(call=>call.fileId===PREVIEW));assert.equal(calls.length,2);
});
