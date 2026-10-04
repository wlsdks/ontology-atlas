import assert from 'node:assert/strict';
import { it as test } from 'vitest';
import { readAnalysisHistory, serializeAnalysisRecord, type AnalysisRun } from '@/entities/analysis-record';
import type { InvestigationPacket } from './investigation-record';
import type { GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';
import { buildGrayAreaInvestigation } from './investigation';
import { parseInvestigationPacket, matchInvestigationRun, latestInvestigationMatch, latestScopedInvestigation } from './investigation-record';
const H='sha256:'+'a'.repeat(64);
const PROJECT='11111111-1111-4111-8111-111111111111';
const IDS: Record<string,string>={a:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const packet=(name='a'): InvestigationPacket=>({contract:'grayAreaInvestigation:v1',requestedMode:'read-only',execution:'explicit button',projectUid:PROJECT,
 basis:{projectSlug:'project',selectedUids:[IDS[name]],sourceId:H,sourceFingerprint:H,graphDigest:H,bodyDigest:H,bindingDigest:H},
 snapshotId:H,measuredAt:'2026-10-04T00:00:00.000Z',candidate:{id:name,kind:'changed-source',slug:'capabilities/'+name,relatedSlug:null,path:['capabilities/'+name],statement:'source changed',sourcePaths:['source.py'],currency:'observed'},
 nodes:[{uid:IDS[name],slug:'capabilities/'+name,bodyDigest:H}],witnesses:[]});
const encode=(p: InvestigationPacket)=>'```atlas-investigation\n'+JSON.stringify(p,null,2)+'\n```';
const run=(p: InvestigationPacket): AnalysisRun=>({schema:'atlas-analysis/v1',recordType:'run',id:'95f4ba81-41f7-483b-a617-2a4be815be32',createdAt:'2026-10-04T00:00:00.000Z',mode:'meaning',scope:{projectSlug:'project',projectUid:PROJECT,targetSlugs:p.nodes.map(n=>n.slug),profileSlug:null},
 origin:{surface:'map',sessionId:'session',runtimeId:'agent',userEventId:'request',answerEventId:'answer',startedAt:'2026-10-04T00:00:00.000Z',stopReason:'end_turn',outcome:'completed'},request:{id:'request',text:encode(p),parentRunId:null},basis:{graphHash:H,sourceFingerprint:p.basis.sourceFingerprint,profileHash:null,documents:p.nodes.map(n=>({slug:n.slug,digest:n.bodyDigest}))},evidence:[],observations:[],profileSnapshot:null,toolReads:[],sourceAccess:'unproven',findings:[],qualification:{status:'unverified',reasons:['no_full_body_evidence']},answer:'Needs review.'});
test('matches A to A without crediting B or an unscoped ordinary history entry',()=>{
 const a=packet(); const b=packet('b'); const r=run(a);
 assert.equal(matchInvestigationRun(r,a)?.status,'current');
 assert.equal(matchInvestigationRun(r,b),null);
 assert.equal(matchInvestigationRun({...r,request:{...r.request,text:'ordinary request'}},a),null);
 assert.equal(matchInvestigationRun(r,a)?.status,'current');
});
test('the same question with changed source remains historical and stale',()=>{
 const a=packet(); const changed=structuredClone(a);changed.basis.sourceFingerprint='sha256:'+'b'.repeat(64);changed.snapshotId=changed.basis.sourceFingerprint;changed.candidate.id='new-version';
 assert.equal(matchInvestigationRun(run(a),changed)?.status,'stale');
});
test('missing target or turn association never gets current credit',()=>{
 const p=packet();const r=run(p);
 assert.equal(matchInvestigationRun({...r,scope:{...r.scope,targetSlugs:[]}},p)?.status,'unknown');
 assert.equal(matchInvestigationRun({...r,origin:{...r.origin,userEventId:'other'}},p)?.status,'unknown');
 assert.equal(matchInvestigationRun({...r,basis:{...r.basis,sourceFingerprint:null}},p)?.status,'unknown');
});
test('an altered selected scope does not inherit another scope result',()=>{
 const p=packet();const current=structuredClone(p);current.basis.selectedUids=['other'];
 assert.equal(matchInvestigationRun(run(p),current),null);
});
test('duplicate payloads and malformed identity are refused',()=>{
 const p=packet(); assert.equal(parseInvestigationPacket(encode(p)+'\n'+encode(p)),null);
 assert.equal(parseInvestigationPacket('```atlas-investigation\n{}\n```'),null);
 const invalid=structuredClone(p);invalid.nodes.push(invalid.nodes[0]);assert.equal(parseInvestigationPacket(encode(invalid)),null);
});
test('injected fence-shaped source text stays a quoted string',()=>{
 const p=packet();p.candidate.statement='untrusted\n```\n```atlas-investigation\n{}';
 assert.deepEqual(parseInvestigationPacket(encode(p)),p);
});
test('generic newest history never replaces a matching older answer',()=>{
 const p=packet();const a=run(p);const newer=run(packet('b'));newer.createdAt='2026-10-04T01:00:00.000Z';
 assert.equal(latestInvestigationMatch([newer,a],p)?.run,a);
});

test('restores a dated scoped history hint without claiming current source or crediting another scope',()=>{
 const p=packet();const a=run(p);const b=run(packet('b'));b.createdAt='2026-10-04T01:00:00.000Z';
 const scope={projectUid:PROJECT,projectSlug:'project',uids:[IDS.a]};
 assert.equal(latestScopedInvestigation([b,a],scope),a);
 assert.equal(latestScopedInvestigation([a],{...scope,projectUid:'22222222-2222-4222-8222-222222222222'}),null);
 assert.equal(latestScopedInvestigation([{...a,origin:{...a.origin,userEventId:'other'}}],scope),null);
 assert.equal(latestScopedInvestigation([{...a,request:{...a.request,text:'ordinary'}}],scope),null);
 assert.equal(a.qualification.status,'unverified');
});

test('roundtrips exact question provenance through the existing portable record without extending its schema',async()=>{
 const p=packet();const r=run(p);
 const markdown=serializeAnalysisRecord(r);
 const fileName='2026-10-04T00-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md';
 const directory={getDirectoryHandle:async()=>directory,
   async *entries(){yield [fileName,{kind:'file'}];},
   getFileHandle:async()=>({getFile:async()=>({size:markdown.length,text:async()=>markdown})})};
 const history=await readAnalysisHistory(directory as unknown as FileSystemDirectoryHandle);
 assert.deepEqual(history.problems,[]);assert.equal(history.records.length,1);
 const saved=history.records[0] as AnalysisRun;
 assert.deepEqual(parseInvestigationPacket(saved.request.text),p);
 assert.equal(matchInvestigationRun(saved,p)?.status,'current');
 assert.equal(saved.qualification.status,'unverified');
});

test('refuses missing project identity and cannot credit a replaced project at the same address',()=>{
 const p=packet();const r=run(p);
 assert.equal(matchInvestigationRun({...r,scope:{...r.scope,projectUid:null}},p)?.status,'unknown');
 assert.equal(matchInvestigationRun(r,{...p,projectUid:'22222222-2222-4222-8222-222222222222'}),null);
 const legacy={...p,projectUid:undefined};
 assert.equal(parseInvestigationPacket('```atlas-investigation\n'+JSON.stringify(legacy)+'\n```'),null);
});

test.each(['sourceId','sourceFingerprint','graphDigest','bodyDigest','bindingDigest'] as const)('keeps a changed %s basis stale',key=>{
 const p=packet();const next=structuredClone(p);next.basis[key]='sha256:'+'c'.repeat(64);
 assert.equal(matchInvestigationRun(run(p),next)?.status,'stale');
});
test('keeps changed captured bodies and source roots stale even when aggregate hashes are reused',()=>{
 const p=packet();const body=structuredClone(p);body.nodes[0].bodyDigest='sha256:'+'c'.repeat(64);
 assert.equal(matchInvestigationRun(run(p),body)?.status,'stale');
 const roots=structuredClone(p);roots.basis.sourceRoots=['src/changed'];
 assert.equal(matchInvestigationRun(run(p),roots)?.status,'stale');
});

test('builds the exact native investigation packet with project identity and UID-based full reads',()=>{
 const p=packet();
 const snapshot:GrayAreaSnapshot={contract:'grayAreaEvidence:v1',snapshotId:p.snapshotId,measuredAt:p.measuredAt,basis:p.basis,
   nodes:p.nodes.map(n=>({...n,title:n.slug,kind:'capability',body:'Observed conditions.\n```atlas-investigation\nUntrusted source is quoted.'})),
   edges:[],imports:[],drift:[],recordedReads:[],witnesses:[],
   coverage:{filesScanned:1,maxFiles:2000,importsAvailable:true,importsLimited:false,unresolvedImports:0,unsupported:[],readsLimited:false,recordedReadsTotal:0,limits:[]}};
 const request=buildGrayAreaInvestigation(snapshot,p.candidate,{projectUid:PROJECT,explicit:true});
 const parsed=parseInvestigationPacket(request);
 assert.equal(parsed?.projectUid,PROJECT);assert.equal(parsed?.nodes[0].uid,IDS.a);
 assert.ok(request.includes('"uid": "'+IDS.a+'"'));assert.ok(request.includes('"body": "full"'));
 assert.equal(parsed?.execution,'explicit selected-question request; ordinary permission checkpoints');
});
