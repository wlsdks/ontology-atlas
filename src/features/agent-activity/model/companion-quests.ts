import {selectWikiPages,type VaultDoc} from '@/entities/docs-vault';
import type {AcpWorkReceipt} from '@/shared/lib/acp-work-receipt';
import {growthProjectKey,growthTargets,type CompanionGrowth,type GrowthTarget} from './companion-growth';
import type {ConstructionCounts} from './companion-construction';

export const QUESTS=[
 {id:'roots',source:'concepts',goal:3,relics:1},
 {id:'links',source:'relations',goal:5,relics:1},
 {id:'traces',source:'implementation',goal:3,relics:1},
 {id:'builder',source:'concepts',goal:10,relics:2},
 {id:'weaver',source:'relations',goal:15,relics:2},
 {id:'archive',source:'wiki',goal:1,relics:2},
 {id:'explorer',source:'explored',goal:1,relics:1},
 {id:'reflection',source:'reflected',goal:1,relics:2},
 {id:'scholar',source:'reflected',goal:3,relics:3},
 {id:'partner',source:'acp',goal:1,relics:2},
 {id:'workshop',source:'acp',goal:3,relics:3},
 {id:'companions',source:'acp',goal:5,relics:4},
] as const;
export type QuestId=typeof QUESTS[number]['id'];
type QuestSource=typeof QUESTS[number]['source'];
export type QuestTarget={uid:string|null;slug:string;title:string};
type QuestClaim={at:number;count:number;targetUid:string|null;targetSlug:string|null};
export type QuestClaims=Partial<Record<QuestId,QuestClaim>>;
export type QuestEvidence={project:string|null;ready:boolean;counts:Record<QuestSource,number>;targets:Record<QuestSource,QuestTarget|null>;acp:'verified'|'pending'|'failed'|'rejected'|'unavailable';byUid:ReadonlyMap<string,QuestTarget>;bySlug:ReadonlyMap<string,QuestTarget>};
const questById=new Map(QUESTS.map(quest=>[quest.id,quest]));
export const questDefinition=(id:QuestId)=>questById.get(id);
export const questCount=(claims:QuestClaims)=>Object.keys(claims).length;
export const forgeLimit=(claims:QuestClaims)=>questCount(claims)>=6?20:questCount(claims)>=4?15:questCount(claims)>=2?10:5;
const rootKey=(root:string)=>root.replace(/[\\/]+$/,'');
const WRITERS:Record<string,string>={add_concept:'create',add_concepts:'create',patch_concept:'update'};

/** Uses existing provider receipts; never polls, parses chat, or treats approval as completion. */
export function observeQuestEvidence({docs,counts,growth,receipts,root,loaded,locale,relationSlug=null}:{docs:readonly VaultDoc[];counts:ConstructionCounts;growth:CompanionGrowth;receipts:readonly AcpWorkReceipt[];root:string|null;loaded:boolean;locale:string;relationSlug?:string|null}):QuestEvidence{
 const docsBySlug=new Map(docs.map(doc=>[doc.slug,doc]));const targets=growthTargets(docs,locale);const byUid=new Map(targets.map(target=>[target.uid,target]));const bySlug=new Map(targets.map(target=>[target.slug,target]));
 const readings=new Map<string,GrowthTarget>(),reflections=new Map<string,GrowthTarget>();
 for(const entry of growth.entries){const target=byUid.get(entry.target.uid);if(target)(entry.kind==='explored'?readings:reflections).set(target.uid,target);}
 const implementations=targets.filter(target=>{const doc=docsBySlug.get(target.slug);return typeof doc?.frontmatter.path==='string'&&doc.frontmatter.path.trim();});
 const slugCounts=new Map<string,number>();for(const target of targets)slugCounts.set(target.slug,(slugCounts.get(target.slug)??0)+1);
 const wiki=selectWikiPages(docs);const written=new Map<string,GrowthTarget>();let acpState:QuestEvidence['acp']='unavailable';
 if(loaded&&root)for(const receipt of receipts){
  const correlation=receipt.writerCorrelation,origin=receipt.origin;
  if(!origin||typeof origin.vaultId!=='string'||!origin.sessionId||!origin.userEventId||!origin.toolCallId||!Number.isInteger(origin.sessionGeneration)||origin.sessionGeneration<0||(typeof origin.requestId!=='number'&&typeof origin.requestId!=='string')||rootKey(origin.vaultId)!==rootKey(root)||!correlation||correlation.status!=='verified'||correlation.tool!==receipt.tool||correlation.toolCall!=='structured-mcp'||correlation.approval!=='structured-mcp'||!WRITERS[receipt.tool])continue;
  if(receipt.decision==='rejected'){if(receipt.result==='not-run'&&correlation.terminal==='not-observed')acpState='rejected';continue;}
  if(receipt.result==='pending'&&correlation.terminal==='pending')acpState='pending';
  if((receipt.result==='failed'||receipt.result==='cancelled')&&correlation.terminal===receipt.result)acpState='failed';
  if(receipt.result!=='completed'||correlation.terminal!=='completed')continue;
  acpState='unavailable';
  for(const item of receipt.items){if(item.operation!==WRITERS[receipt.tool]||item.relation||!item.target||(receipt.tool==='patch_concept'&&!item.fields.includes('body')))continue;const slugTarget=bySlug.get(item.target),uidTarget=byUid.get(item.target);const target=slugTarget??uidTarget;if(target&&slugCounts.get(target.slug)===1&&(!slugTarget||!uidTarget||slugTarget.uid===uidTarget.uid))written.set(target.uid,target);}
 }
 const first=(items:Iterable<GrowthTarget>)=>Array.from(items)[0]??null;
 const evidenceBySlug=new Map<string,QuestTarget>(bySlug);for(const page of wiki){const doc=docsBySlug.get(page.slug);if(doc)evidenceBySlug.set(doc.slug,{uid:null,slug:doc.slug,title:doc.title});}
 const page=wiki[0];const wikiDoc=page?docsBySlug.get(page.slug):null;
 const values={concepts:counts.concepts,relations:counts.relations,implementation:implementations.length,wiki:counts.wiki,explored:readings.size,reflected:reflections.size,acp:written.size};
 return {byUid,bySlug:evidenceBySlug,project:growthProjectKey(docs),ready:loaded,counts:loaded?values:{concepts:0,relations:0,implementation:0,wiki:0,explored:0,reflected:0,acp:0},targets:{concepts:targets[0]??null,relations:relationSlug?bySlug.get(relationSlug)??null:null,implementation:implementations[0]??null,wiki:wikiDoc?{uid:null,slug:wikiDoc.slug,title:wikiDoc.title}:null,explored:first(readings.values()),reflected:first(reflections.values()),acp:first(written.values())},acp:written.size?'verified':acpState};
}
export function questReady(id:QuestId,evidence:QuestEvidence|null):boolean{const quest=questDefinition(id);return Boolean(quest&&evidence?.ready&&evidence.project&&evidence.counts[quest.source]>=quest.goal&&evidence.targets[quest.source]);}
export function parseQuestClaims(value:unknown):QuestClaims|null{
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>QUESTS.length)return null;
 const claims:QuestClaims={};for(const [id,raw] of Object.entries(value)){const claim=raw as QuestClaim;if(!questDefinition(id as QuestId)||!claim||!Number.isSafeInteger(claim.at)||claim.at<0||!Number.isSafeInteger(claim.count)||claim.count<(questDefinition(id as QuestId)?.goal??Infinity)||claim.count>100000)return null;for(const key of ['targetUid','targetSlug'] as const)if(claim[key]!==null&&(typeof claim[key]!=='string'||!claim[key]||claim[key]!.length>160))return null;claims[id as QuestId]={at:claim.at,count:claim.count,targetUid:claim.targetUid,targetSlug:claim.targetSlug};}return claims;
}
