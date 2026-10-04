import { describe, expect, it } from 'vitest';
import { createConstructionExecutor, sourceCitation, type ConstructionSourcePort } from './construction-executor';
import type { ConstructionSourceRange } from '@/shared/lib/tauri-local-construction';
import type { VaultReadPort } from './vault-read-port';

const vault:VaultReadPort={nodes:[],edges:[],docs:[],readDocText:async()=>null};
const read:ConstructionSourceRange={path:'src/input.ts',startLine:1,endLine:1,text:'export const value = 1;\n',fullFileSha256:`sha256:${'a'.repeat(64)}`,bytes:24,nextLine:null,totalLines:1,fileComplete:true};
function source(overrides:Partial<ConstructionSourcePort>={}):ConstructionSourcePort{return {preview:{sourcePath:'/code',destinationPath:'/vault',fingerprint:'basis',files:[{path:read.path,bytes:24}],limited:false,excluded:[]},read:async()=>read,current:async()=>true,...overrides};}
const call=(name:string,args:unknown)=>({id:'call',name,args,argsInvalid:false});
describe('construction source evidence',()=>{
 it('keeps source reads separate from vault evidence and admits only matching grounded proposals',async()=>{
  const executor=createConstructionExecutor(vault,source());
  const seen=await executor.execute(call('read_source_text',{path:read.path}));
  expect(seen.isError).toBe(false);expect(seen.vaultChars).toBe(0);expect(executor.sourceBytes).toBe(24);
  const body=`Checks input. ${sourceCitation(read)}`;
  const proposed=await executor.execute(call('add_concept',{slug:'elements/input',kind:'element',title:'Input',path:read.path,body}));
  expect(proposed.outcome).toBe('blocked-write');expect(proposed.writeIntent).toBeDefined();
 });
 it('refuses invented citations, unlisted implementation paths and forbidden structural tools',async()=>{
  const executor=createConstructionExecutor(vault,source());await executor.execute(call('read_source_text',{path:read.path}));
  for(const args of [{slug:'elements/input',kind:'element',title:'Input',path:read.path,body:'A claim without a returned citation.'},{slug:'elements/input',kind:'element',title:'Input',path:'src/not-read.ts',body:sourceCitation(read)},{slug:' ../escape',kind:'element',title:'Input',path:read.path,body:sourceCitation(read)},{slug:' /tmp/escape',kind:'element',title:'Input',path:read.path,body:sourceCitation(read)},{slug:'../escape',kind:'element',title:'Input',path:read.path,body:sourceCitation(read)}])expect((await executor.execute(call('add_concept',args))).isError).toBe(true);
  expect((await executor.execute(call('delete_concept',{slug:'elements/input'}))).isError).toBe(true);
 });
 it('refuses reversed domain membership even when its citation is real',async()=>{
  const executor=createConstructionExecutor(vault,source());await executor.execute(call('read_source_text',{path:read.path}));
  await executor.execute(call('add_concepts',{concepts:[{slug:'domains/input',kind:'domain',title:'Input',body:sourceCitation(read)},{slug:'capabilities/check',kind:'capability',title:'Check',path:read.path,body:sourceCitation(read)}]}));
  expect((await executor.execute(call('add_relation',{from:'domains/input',to:'capabilities/check',type:'domain',why:sourceCitation(read)}))).isError).toBe(true);
  expect((await executor.execute(call('add_relation',{from:'domains/input',to:'capabilities/check',type:'capabilities',why:sourceCitation(read)}))).writeIntent).toBeDefined();
 });
 it('uses the canonical holder kinds for plural containment',async()=>{
  const executor=createConstructionExecutor(vault,source());await executor.execute(call('read_source_text',{path:read.path}));
  await executor.execute(call('add_concepts',{concepts:['capability','element'].map(kind=>({slug:kind==='capability'?'capabilities/a':'elements/a',kind,title:'Role',path:read.path,body:sourceCitation(read)}))}));
  for(const [slug,type] of [['capabilities/a','capabilities'],['elements/a','elements']])expect((await executor.execute(call('add_relation',{from:slug,to:slug,type,why:sourceCitation(read)}))).isError).toBe(true);
 });
 it('does not turn changed source or oversized response bytes into a writable intent',async()=>{
  const stale=createConstructionExecutor(vault,source({current:async()=>false}));await stale.execute(call('read_source_text',{path:read.path}));
  expect((await stale.execute(call('add_relation',{from:'elements/a',to:'elements/b',type:'depends_on',why:sourceCitation(read)}))).isError).toBe(true);
  const large=createConstructionExecutor(vault,source({read:async()=>({...read,text:'x'.repeat(8193),bytes:8193})}));
  expect((await large.execute(call('read_source_text',{path:read.path}))).isError).toBe(true);expect(large.reads).toHaveLength(0);
 });
});
