import type {deriveOntologyFromVault,VaultDoc} from '@/entities/docs-vault';
import type {GrowthTarget,ReflectionKind} from './companion-growth';

type Graph=ReturnType<typeof deriveOntologyFromVault>;
export type LearningTopic={target:GrowthTarget;kind:string;signature:string;dependent:GrowthTarget|null;declaration:GrowthTarget|null;reason:string|null;options:GrowthTarget[]};
export type LearningDraft={uid:string|null;signature:string|null;step:'choose'|'read'|'relation'|'impact'|'reflect'|'done'|'recall';choice:string|null;checked:boolean;note:string;reflection:ReflectionKind};
export const emptyLearningDraft=():LearningDraft=>({uid:null,signature:null,step:'choose',choice:null,checked:false,note:'',reflection:'uncertain'});

/** Quote authored sections only; missing headings are a visible gap, not invented teaching text. */
export function learningPassage(body:string,section:'purpose'|'boundary'):string{
 const lines=body.split('\n');const heading=section==='boundary'?/^#{1,3}\s+(?:Excludes|Out of scope|제외|범위 밖)\s*$/i:/^#{1,3}\s+(?:Definition|정의)\s*$/i;
 const start=lines.findIndex(line=>heading.test(line.trim()));
 if(start>=0){const depth=lines[start].match(/^#+/)?.[0].length??2;let end=start+1;while(end<lines.length&&!new RegExp(`^#{1,${depth}}\\s`).test(lines[end]))end++;return lines.slice(start+1,end).join('\n').trim();}
 if(section==='boundary')return '';
 const preamble=body.split(/^##\s/m)[0];return preamble.split(/\n\s*\n/).find(paragraph=>paragraph.trim()&&!/^\s*(?:#|[-*+]\s|\d+\.\s|```)/.test(paragraph))?.trim()??'';
}

/** Recorded direct dependencies are review candidates, never a transitive runtime blast radius. */
export function buildLearningTopics(docs:readonly VaultDoc[],graph:Graph|undefined,targets:readonly GrowthTarget[]):LearningTopic[]{
 if(!graph)return [];
 const slugCounts=new Map<string,number>();for(const target of targets)slugCounts.set(target.slug,(slugCounts.get(target.slug)??0)+1);
 const valid=targets.filter(target=>slugCounts.get(target.slug)===1);const bySlug=new Map(valid.map(target=>[target.slug,target]));const documents=new Map(docs.map(doc=>[doc.slug,doc]));
 const byNode=new Map(graph.nodes.filter(node=>node.hasOwnDocument&&bySlug.has(node.sourceSlug)).map(node=>[node.id,bySlug.get(node.sourceSlug)!]));
 const incoming=new Map<string,{first:{target:GrowthTarget;id:string};ids:Set<string>}>();
 for(const edge of graph.edges){
  const from=byNode.get(edge.from),to=byNode.get(edge.to);
  if(edge.type!=='depends_on'||!from||!to||from.uid===to.uid||edge.sourceSlug!==from.slug)continue;
  const entry=incoming.get(to.uid);if(entry){entry.ids.add(from.uid);if(from.uid.localeCompare(entry.first.target.uid)<0)entry.first={target:from,id:edge.id};}else incoming.set(to.uid,{first:{target:from,id:edge.id},ids:new Set([from.uid])});
 }
 const pools=new Map<string,GrowthTarget[]>();for(const target of valid){const kind=String(documents.get(target.slug)?.frontmatter.kind);const pool=pools.get(kind)??[];if(pool.length<12||target.uid.localeCompare(pool[pool.length-1].uid)<0){pool.push(target);pool.sort((a,b)=>a.uid.localeCompare(b.uid));if(pool.length>12)pool.pop();}pools.set(kind,pool);}
 return valid.map(target=>{
  const doc=documents.get(target.slug)!;const links=incoming.get(target.uid);const witness=links?.first;const dependent=witness?.target??null;const declaration=dependent;const origin=declaration?documents.get(declaration.slug):null;
  const known=links?.ids??new Set<string>();const pool=dependent?pools.get(String(origin?.frontmatter.kind))??[]:[];
  const options=dependent?[dependent,...pool.filter(item=>item.uid!==target.uid&&!known.has(item.uid)).slice(0,2)].sort((a,b)=>a.title.localeCompare(b.title)):[];
  const notes=origin?.frontmatter.relation_notes;const note=notes&&typeof notes==='object'&&!Array.isArray(notes)?(notes as Record<string,unknown>)[target.slug]:null;
  return {target,kind:String(doc.frontmatter.kind),dependent,declaration,reason:typeof note==='string'&&note.trim()?note.trim():null,options,signature:JSON.stringify([target.uid,target.slug,doc.mtime??doc.updatedAt,declaration?.uid,declaration?.slug,origin?.mtime??origin?.updatedAt,witness?.id,note,options.map(item=>item.uid)])};
 }).sort((a,b)=>(a.kind==='capability'?0:a.kind==='domain'?1:2)-(b.kind==='capability'?0:b.kind==='domain'?1:2)||a.target.title.localeCompare(b.target.title));
}
