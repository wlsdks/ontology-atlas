import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, readdirSync, lstatSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withSourceSnapshot } from './confined-source-fs.mjs';
import { inferImports as infer } from './infer-imports.mjs';

function capture(root){
  const entries=[];
  const walk=(path,relative)=>{const info=lstatSync(path);const kind=info.isSymbolicLink()?'symlink':info.isDirectory()?'directory':'file';const row={path:relative,kind,size:info.size};entries.push(row);if(kind==='directory'){row.children=readdirSync(path).filter(n=>!n.startsWith('.'));for(const name of row.children)walk(join(path,name),relative==='.'?name:`${relative}/${name}`);}else if(kind==='file')row.text=readFileSync(path,'utf8');};
  walk(root,'.');return {contract:'confinedSourceSnapshot:v1',rootPath:root,truncated:false,entries};
}
function inferImports(root,options){return withSourceSnapshot(capture(root),()=>infer(root,options));}
function fixture(fn){const base=realpathSync(mkdtempSync(join(tmpdir(),'atlas-confined-')));const root=join(base,'repo');mkdirSync(join(root,'src'),{recursive:true});try{fn(root,base);}finally{rmSync(base,{recursive:true,force:true});}}
test('the actual scanner refuses an authored source-root symlink and never emits its outside edge',()=>fixture((root,base)=>{
  const outside=join(base,'outside');mkdirSync(outside);writeFileSync(join(outside,'a.ts'),"import './b';");writeFileSync(join(outside,'b.ts'),'export const b=1;');symlinkSync(outside,join(root,'linked'));
  assert.throws(()=>inferImports(root,{sourceFolders:['linked'],maxFiles:20}),/Confined source read refused/);
}));
test('a symlinked resolver config and outside alias probes fail closed even when parsing catches errors',()=>fixture((root,base)=>{
  writeFileSync(join(root,'src','a.ts'),"import { policy } from 'policy';");writeFileSync(join(base,'config.json'),'{"compilerOptions":{"paths":{"policy":["src/old.ts"]}}}');symlinkSync(join(base,'config.json'),join(root,'tsconfig.json'));
  assert.throws(()=>inferImports(root,{sourceFolders:['src']}),/Confined source read refused/);
}));
test('alias-only changes alter both the actual edge and its bound config bytes',()=>fixture(root=>{
  writeFileSync(join(root,'src','a.ts'),"import { policy } from 'policy';");writeFileSync(join(root,'src','old.ts'),'export const policy=1;');writeFileSync(join(root,'src','new.ts'),'export const policy=2;');
  const config=target=>JSON.stringify({compilerOptions:{baseUrl:'.',paths:{policy:[`src/${target}.ts`]}}});writeFileSync(join(root,'tsconfig.json'),config('old'));
  const before=inferImports(root,{sourceFolders:['src']});writeFileSync(join(root,'tsconfig.json'),config('new'));const after=inferImports(root,{sourceFolders:['src']});
  assert(before.edges.some(e=>e.to==='src/old.ts'));assert(after.edges.some(e=>e.to==='src/new.ts'));
  assert.notEqual(before.readBoundary.files.find(f=>f.path==='tsconfig.json').sha256,after.readBoundary.files.find(f=>f.path==='tsconfig.json').sha256);
  assert(before.readBoundary.lookups.some(f=>f.state==='missing'));assert(before.readBoundary.directories.some(f=>f.path==='src'));
}));
test('an absolute or climbing import cannot probe outside the approved root',()=>fixture((root,base)=>{
  writeFileSync(join(root,'src','a.ts'),"import '../../outside';");writeFileSync(join(base,'outside.ts'),'export const value=1;');
  assert.throws(()=>inferImports(root,{sourceFolders:['src']}),/Confined source read refused/);
}));
test('the scanner consumes captured bytes even if original files are replaced after capture',()=>fixture((root,base)=>{
  writeFileSync(join(root,'src','a.ts'),"import './old';");writeFileSync(join(root,'src','old.ts'),'export const old=1;');const snapshot=capture(root);
  rmSync(join(root,'src'),{recursive:true});const outside=join(base,'outside');mkdirSync(outside);writeFileSync(join(outside,'a.ts'),"import './private';");writeFileSync(join(outside,'private.ts'),'outside sentinel');symlinkSync(outside,join(root,'src'));
  const result=withSourceSnapshot(snapshot,()=>infer(root,{sourceFolders:['src']}));assert(result.edges.some(e=>e.to==='src/old.ts'));assert(!JSON.stringify(result).includes('outside sentinel'));assert(!result.edges.some(e=>e.to.includes('private')));
}));
test('missing resolver bytes and incomplete census cannot silently become a successful fallback',()=>fixture(root=>{
  writeFileSync(join(root,'src','a.ts'),"import 'policy';");writeFileSync(join(root,'tsconfig.json'),'{}');const snapshot=capture(root);delete snapshot.entries.find(e=>e.path==='tsconfig.json').text;
  assert.throws(()=>withSourceSnapshot(snapshot,()=>infer(root,{sourceFolders:['src']})),/Confined source read refused/);
  snapshot.truncated=true;assert.throws(()=>withSourceSnapshot(snapshot,()=>infer(root,{sourceFolders:['src']})),/incomplete/);
}));
test('the private empty namespace has no original files for an older unconfined reader to consume',()=>fixture((root,base)=>{
  writeFileSync(join(root,'src','a.ts'),"import './b';");writeFileSync(join(root,'src','b.ts'),'export const b=1;');const snapshot=capture(root);
  const empty=join(base,'empty-namespace');mkdirSync(empty);snapshot.rootPath=empty;
  assert.equal(infer(empty,{sourceFolders:['src']}).filesScanned,0);
  const bound=withSourceSnapshot(snapshot,()=>infer(empty,{sourceFolders:['src']}));assert(bound.edges.some(e=>e.from==='src/a.ts'&&e.to==='src/b.ts'));
}));
test('confined scopes resolve workspace metadata without scanning unrelated package source',()=>fixture(root=>{
  mkdirSync(join(root,'packages','policy'),{recursive:true});writeFileSync(join(root,'package.json'),JSON.stringify({workspaces:['packages/*']}));writeFileSync(join(root,'packages','policy','package.json'),JSON.stringify({name:'policy',main:'index.ts'}));writeFileSync(join(root,'packages','policy','index.ts'),'export const policy=true;');writeFileSync(join(root,'src','a.ts'),"import { policy } from 'policy';");
  const snapshot=capture(root);delete snapshot.entries.find(e=>e.path==='packages/policy/index.ts').text;
  const result=withSourceSnapshot(snapshot,()=>infer(root,{sourceFolders:['src']}));assert.equal(result.filesScanned,1);assert(result.edges.some(e=>e.to==='packages/policy/index.ts'));assert(result.readBoundary.files.some(e=>e.path==='packages/policy/package.json'));assert(!result.readBoundary.files.some(e=>e.path==='packages/policy/index.ts'));
}));
