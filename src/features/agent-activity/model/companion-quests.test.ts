import {expect,it} from 'vitest';
import {actCompanionGame,newCompanionGame,parseCompanionGame} from './companion-game';
import {QUESTS,forgeLimit,observeQuestEvidence,questReady,type QuestEvidence} from './companion-quests';
import type {AcpWorkReceipt} from '@/shared/lib/acp-work-receipt';
import type {VaultDoc} from '@/entities/docs-vault';
const uid='442d74e4-ea20-4229-8fe3-2b8a98743aa4',project='00000000-0000-4000-8000-000000000001';
const docs=[{slug:'project',title:'Project',frontmatter:{kind:'project',uid:project}},{slug:'capabilities/test',title:'Test',frontmatter:{kind:'capability',uid,path:'src/test.ts'}}] as unknown as VaultDoc[];
const receipt=(changes:Partial<AcpWorkReceipt>={}):AcpWorkReceipt=>({v:1,id:'s:t',at:'2026-09-25T00:00:00Z',updatedAt:'2026-09-25T00:00:00Z',agent:'codex-acp',request:'Inspect existing evidence',tool:'patch_concept',decision:'allowed',result:'completed',items:[{target:'capabilities/test',operation:'update',relation:null,fields:['body']}],origin:{vaultId:'/vault',sessionGeneration:1,sessionId:'s',userEventId:'u',requestId:1,toolCallId:'t'},writerCorrelation:{status:'verified',server:'atlas-vault',tool:'patch_concept',toolCall:'structured-mcp',approval:'structured-mcp',terminal:'completed'},...changes});
const observe=(receipts:AcpWorkReceipt[],loaded=true)=>observeQuestEvidence({docs,counts:{concepts:1,relations:0,implementation:1,wiki:0,detail:0},growth:{version:1,entries:[]},root:'/vault',loaded,receipts,locale:'en'});
it('requires a fully correlated current-root completed writer and unique current target',()=>{
 expect(observe([receipt(),receipt()]).counts.acp).toBe(1);
 for(const bad of [receipt({result:'pending'}),receipt({result:'failed'}),receipt({decision:'rejected'}),receipt({writerCorrelation:undefined}),receipt({origin:undefined}),receipt({origin:{...receipt().origin!,vaultId:'/elsewhere'}}),receipt({writerCorrelation:{...receipt().writerCorrelation!,tool:'add_concept'}}),receipt({items:[{...receipt().items[0],operation:'write'}]}),receipt({items:[{...receipt().items[0],target:'missing'}]}),receipt({tool:'delete_concept'})])expect(observe([bad]).counts.acp).toBe(0);
 expect(observe([receipt()],false)).toMatchObject({ready:false,counts:{acp:0}});
 expect(observe([]).acp).toBe('unavailable');expect(questReady('partner',observe([receipt()]))).toBe(true);
});
it('claims a completed quest once and commits its materials and unlock together',()=>{
 const evidence={...observe([]),targets:{...observe([]).targets,relations:{uid,slug:'capabilities/test',title:'Test'}},counts:{...observe([]).counts,concepts:10,relations:15,implementation:3}} as QuestEvidence;
 let game=newCompanionGame(1000);game=actCompanionGame(game,{type:'claim-quest',id:'roots'},1000,evidence);
 expect(game.relics).toBe(1);expect(game.questClaims.roots).toMatchObject({at:1000,count:10});expect(actCompanionGame(game,{type:'claim-quest',id:'roots'},1000,evidence)).toBe(game);
 game=actCompanionGame(game,{type:'claim-quest',id:'links'},1000,evidence);expect(forgeLimit(game.questClaims)).toBe(10);
 expect(actCompanionGame(game,{type:'claim-quest',id:'partner'},1000,evidence)).toBe(game);
});
it('every forge tier has a complete non-ACP route',()=>{
 const claims=Object.fromEntries(QUESTS.filter(q=>q.source!=='acp').map(q=>[q.id,{at:1,count:q.goal,targetUid:null,targetSlug:null}]));expect(Object.keys(claims)).toHaveLength(9);expect(forgeLimit(claims)).toBe(20);
});
it('distinguishes unavailable, pending, failed and rejected evidence without granting completion',()=>{
 const pending=receipt({result:'pending',writerCorrelation:{...receipt().writerCorrelation!,terminal:'pending'}});expect(observe([pending]).acp).toBe('pending');
 const failed=receipt({result:'failed',writerCorrelation:{...receipt().writerCorrelation!,terminal:'failed'}});expect(observe([failed]).acp).toBe('failed');
 const rejected=receipt({decision:'rejected',result:'not-run',writerCorrelation:{...receipt().writerCorrelation!,terminal:'not-observed'}});expect(observe([rejected]).acp).toBe('rejected');
 for(const value of [pending,failed,rejected])expect(questReady('partner',observe([value]))).toBe(false);
 expect(observe([receipt({items:[{...receipt().items[0],fields:['frontmatter']} ]})]).counts.acp).toBe(0);
});
it('treats uncertain and corrected reflection as equal activity and retains historical rewards after removal',()=>{
 const base=observe([]);const growth={version:1 as const,entries:[{kind:'reflected' as const,target:{uid,slug:'capabilities/test',title:'Test'},at:1,note:'I need more evidence.',reflection:'uncertain' as const}]};
 const input={docs,counts:{concepts:1,relations:0,implementation:1,wiki:0,detail:0},growth,root:'/vault',loaded:true,receipts:[],locale:'en'};
 const uncertain=observeQuestEvidence(input);const corrected=observeQuestEvidence({...input,growth:{...growth,entries:[{...growth.entries[0],reflection:'corrected'}]}});
 expect(uncertain.counts.reflected).toBe(1);expect(corrected.counts.reflected).toBe(1);
 const rewarded=actCompanionGame(newCompanionGame(1000),{type:'claim-quest',id:'reflection'},1000,uncertain);expect(rewarded.relics).toBe(2);
 const removed=observeQuestEvidence({...input,docs:docs.slice(0,1),counts:{...input.counts,concepts:0,implementation:0}});expect(questReady('reflection',removed)).toBe(false);expect(actCompanionGame(rewarded,{type:'claim-quest',id:'reflection'},1000,removed).relics).toBe(2);
 expect(base.ready).toBe(true);
});
it('rejects ambiguous target identities and missing relation witnesses at claim time',()=>{
 const input={docs,counts:{concepts:1,relations:5,implementation:1,wiki:0,detail:0},growth:{version:1 as const,entries:[]},root:'/vault',loaded:true,receipts:[receipt()],locale:'en'};
 const ambiguous=observeQuestEvidence({...input,docs:[...docs,{...docs[1],slug:'capabilities/duplicate'}]});expect(ambiguous.counts.acp).toBe(0);expect(questReady('partner',ambiguous)).toBe(false);
 expect(questReady('links',observeQuestEvidence({...input,relationSlug:'capabilities/test'}))).toBe(true);
 expect(questReady('links',observeQuestEvidence({...input,relationSlug:null}))).toBe(false);
 expect(observeQuestEvidence({...input,root:'/other-vault'}).counts.acp).toBe(0);
});
it('preserves valid quest history across reload and fails closed on corrupt claims',()=>{
 const completed=actCompanionGame(newCompanionGame(1000),{type:'claim-quest',id:'partner'},1000,observe([receipt()]));expect(parseCompanionGame(JSON.stringify(completed))).toEqual(completed);
 const {questClaims:_claims,...legacy}=newCompanionGame(1000);expect(parseCompanionGame(JSON.stringify(legacy))?.questClaims).toEqual({});
 for(const questClaims of [{partner:{...completed.questClaims.partner,count:0}},{partner:{...completed.questClaims.partner,at:-1}},{unknown:completed.questClaims.partner}])expect(parseCompanionGame(JSON.stringify({...completed,questClaims}))).toBeNull();
});
