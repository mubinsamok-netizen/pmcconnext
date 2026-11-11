/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function renderFiles({documentsReady=true, defectsReady=false, hasDrive=true}={}) {
 const requests=[];
 const overrides={
  "@/lib/useDriveFiles":{useDriveFiles:(key)=>{if(key)requests.push(key);return {data:{data:[],complete:!key},isLoading:Boolean(key)};}},
  "next/image":{default:()=>null},
  "@/lib/directDriveDocumentUpload":{},
  swr:{default:(key)=>{
   if(!key)return {};
   requests.push(key);
   if(key.endsWith('/documents'))return documentsReady?{data:{data:[{document_id:'D1',title:'Ready document TestbyZoneIdea',file_name:'ready.pdf'}]}}:{isLoading:true};
   if(key.endsWith('/defects'))return defectsReady?{data:{rounds:[{round_id:'R1',title:'Ready defect TestbyZoneIdea',pdf_url:'https://example.invalid/defect.pdf'}]}}:{isLoading:true};
   return {isLoading:true};
  }}
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
  const Page = loadFile(path.resolve(__dirname, "../src/app/dashboard/sites/[projectId]/files/FilesWorkspace.tsx")).FilesWorkspace;
  return { html: renderToStaticMarkup(React.createElement(Page, {project:{project_id:"P1",name:"QA TestbyZoneIdea",drive_folder_id:hasDrive ? "qa-folder" : ""}})), requests };
}

test("documents render while Defect and Drive remain pending",()=>{
 const {html}=renderFiles();
 assert.ok(html.includes('Ready document TestbyZoneIdea'));
 assert.ok(html.includes('กำลังโหลดไฟล์ Defect'));
 assert.ok(html.includes('แบ่งหน้าไฟล์'));
});
test("Defect files render while documents and Drive remain pending",()=>{
 const {html}=renderFiles({documentsReady:false,defectsReady:true});
 assert.ok(html.includes('Ready defect TestbyZoneIdea'));
 assert.ok(html.includes('กำลังโหลดเอกสารอัปโหลด'));
 assert.ok(html.includes('แบ่งหน้าไฟล์'));
});
test("sites without a Drive folder do not start a Drive listing",()=>{
 const {requests}=renderFiles({hasDrive:false});
 assert.equal(requests.filter(x=>x.endsWith('/drive-files')).length,0);
});
