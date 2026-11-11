/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
function fixture({ denied, folder = 'root', invalidate = true } = {}) {
  const calls = [];
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({body, status: options?.status || 200}) } },
    '@/lib/driveFilesCache': {
      readDriveFolderFiles: async (id, fresh) => {calls.push(['read',id,fresh]);return Array.from({length:500},(_,i)=>({id:String(i)}));},
      invalidateDriveFilesCache: (id) => {calls.push(['expire',id]);return invalidate;},
    },
    '@/lib/siteApi': {getSiteApiContext: async () => denied || ({project:{drive_folder_id:folder}}),getErrorMessage:(e)=>e.message},
  };
  const loaded={exports:{}};
  const code=ts.transpileModule(fs.readFileSync('src/app/api/sites/[projectId]/drive-files/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{module:loaded,exports:loaded.exports,URL,require:(id)=>{assert.ok(dependencies[id],id);return dependencies[id];}});
  return {calls,run:(method,query='')=>loaded.exports[method]({url:'https://example.invalid/api'+query},{params:Promise.resolve({projectId:'P-1'})})};
}
for(const method of ['GET','POST'])for(const status of [401,403])test(`${method} retains ${status} and never reads or expires a forbidden folder`,async()=>{
 const f=fixture({denied:{error:'Denied',status}});assert.equal((await f.run(method)).status,status);assert.equal(f.calls.length,0);
});
test('GET reports the limit and preserves the legacy fresh parameter',async()=>{
 const f=fixture();assert.equal((await f.run('GET','?fresh=1')).body.limitReached,true);assert.deepEqual(f.calls[0],['read','root',true]);
});
test('POST expires cache without reading Drive, with a subsequent normal GET',async()=>{
 const f=fixture();assert.equal((await f.run('POST')).status,200);assert.deepEqual(f.calls,[['expire','root']]);await f.run('GET');assert.deepEqual(f.calls[1],['read','root',false]);
});
test('sites without Drive skip reads and invalidation',async()=>{
 const f=fixture({folder:''});assert.equal((await f.run('GET')).body.data.length,0);assert.equal((await f.run('POST')).status,200);assert.equal(f.calls.length,0);
});
test('failed expiration returns an error instead of claiming a successful refresh',async()=>{
 const f=fixture({invalidate:false});assert.equal((await f.run('POST')).status,503);assert.equal(f.calls.length,1);
});
