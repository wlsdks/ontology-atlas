import {expect,it} from 'vitest';
import {companionSourcePages,readCompanionSource} from './companion-source';
const uid='442d74e4-ea20-4229-8fe3-2b8a98743aa4';
const handle=(raw:string,mtime=7,size=raw.length)=>({getFile:async()=>({lastModified:mtime,size,text:async()=>raw}) as File});
it('reads the full current body instead of the manifest excerpt',async()=>{
 const body='Actual responsibility.\n\n'+('Evidence and limitations. '.repeat(30));
 expect(await readCompanionSource(handle(`---\nuid: ${uid}\n---\n${body}`),{uid,mtime:7})).toBe(body.trim());
});
it('rejects changed snapshots and a different identity at the same slug',async()=>{
 await expect(readCompanionSource(handle(`---\nuid: ${uid}\n---\nCurrent`,8),{uid,mtime:7})).rejects.toThrow('changed');
 await expect(readCompanionSource(handle('---\nuid: other\n---\nForeign'),{uid,mtime:7})).rejects.toThrow('changed');
 await expect(readCompanionSource(handle(`---\nuid: ${uid}\ndependencies: [capabilities/new]\n---\nChanged assertion`),{uid,mtime:7,frontmatter:{uid,dependencies:['capabilities/old']}})).rejects.toThrow('changed');
});
it('can expose the original dependency declaration and rationale beside the full body',async()=>{
 const raw=`---\nuid: ${uid}\ndependencies: [capabilities/current]\nrelation_notes:\n  capabilities/current: Required validation result.\n---\nThe declared responsibility.`;
 const text=await readCompanionSource(handle(raw),{uid,mtime:7},true);expect(text).toContain('capabilities/current');expect(text).toContain('Required validation result.');expect(text).toContain('The declared responsibility.');
});
it('bounds file reading and propagates unavailable files without substituting stale text',async()=>{
 await expect(readCompanionSource(handle('large',7,512*1024+1),{uid:null,mtime:7})).rejects.toThrow('large');
 await expect(readCompanionSource({getFile:async()=>{throw new Error('missing');}},{uid,mtime:7})).rejects.toThrow('missing');
});
it('pages full Unicode text and newline-heavy bodies without dropping content',()=>{
 for(const limit of [80,120])for(const body of ['책임 🌿 관계 '.repeat(100),'one\ntwo\n\n'.repeat(80),'']){
  const pages=companionSourcePages(body,limit);expect(pages.join('')).toBe(body);for(const page of pages){expect(Array.from(page).length).toBeLessThanOrEqual(limit);expect(page.split('\n').length-1).toBeLessThanOrEqual(3);}
 }
});
it('keeps ordinary words together at page boundaries without losing spaces',()=>{
 const body='Returns validation issues with stable codes and evidence paths. '.repeat(10);
 const pages=companionSourcePages(body,80);expect(pages.join('')).toBe(body);
 for(let index=0;index<pages.length-1;index++)expect(/\s$/.test(pages[index])||/^\s/.test(pages[index+1])).toBe(true);
});
