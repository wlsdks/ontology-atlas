import {deriveOntologyFromVault,selectWikiPages,type VaultManifest} from '@/entities/docs-vault';
import {growthTargets} from './companion-growth';

/** A game reward for recorded project work, never a judgment of its correctness. */
export const CONSTRUCTION_WEIGHTS={concepts:24,relations:8,implementation:16,wiki:40,detail:4} as const;
export type ConstructionCounts=Record<keyof typeof CONSTRUCTION_WEIGHTS,number>;
export const EMPTY_CONSTRUCTION:ConstructionCounts={concepts:0,relations:0,implementation:0,wiki:0,detail:0};
export const constructionXp=(counts:ConstructionCounts)=>Object.entries(CONSTRUCTION_WEIGHTS).reduce((sum,[key,weight])=>sum+counts[key as keyof ConstructionCounts]*weight,0);
export function parseConstruction(value:unknown):ConstructionCounts|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const result={...EMPTY_CONSTRUCTION};
 for(const key of Object.keys(result) as (keyof ConstructionCounts)[]){const count=(value as ConstructionCounts)[key];if(!Number.isSafeInteger(count)||count<0||count>100000)return null;result[key]=count;}
 return result;
}
export function constructionHighWater(prior:ConstructionCounts,current:ConstructionCounts):ConstructionCounts{
 return Object.fromEntries(Object.keys(prior).map(key=>[key,Math.max(prior[key as keyof ConstructionCounts],current[key as keyof ConstructionCounts])])) as ConstructionCounts;
}
/** Reuses the renderer's relation resolver and Library's wiki classification. Runs only on an open game and a new manifest. */
export function observeCompanionProject(manifest:VaultManifest){
 const targets=growthTargets(manifest.docs,'en');const slugs=new Set(targets.map(target=>target.slug));
 const concepts=manifest.docs.filter(doc=>slugs.has(doc.slug));
 const derivation=deriveOntologyFromVault(manifest);
 const nodes=new Map(derivation.nodes.filter(node=>node.hasOwnDocument&&slugs.has(node.sourceSlug)).map(node=>[node.id,node]));
 const connected=derivation.edges.filter(edge=>nodes.has(edge.from)&&nodes.has(edge.to));
 const edges=new Set(connected.map(edge=>edge.id));
 const wikiSlugs=new Set(selectWikiPages(manifest.docs).map(page=>page.slug));
 const wiki=manifest.docs.filter(doc=>wikiSlugs.has(doc.slug));
 const detail=[...concepts,...wiki].reduce((sum,doc)=>sum+Math.min(10,Math.floor(Math.max(0,doc.wordCount??0)/40)),0);
 return {relationSlug:connected[0]?nodes.get(connected[0].from)?.sourceSlug??null:null,counts:{concepts:Math.min(100000,targets.length),relations:Math.min(100000,edges.size),implementation:concepts.filter(doc=>typeof doc.frontmatter.path==='string'&&doc.frontmatter.path.trim()).length,wiki:Math.min(100000,wikiSlugs.size),detail:Math.min(100000,detail)}};
}

export const observeConstruction=(manifest:VaultManifest):ConstructionCounts=>observeCompanionProject(manifest).counts;
