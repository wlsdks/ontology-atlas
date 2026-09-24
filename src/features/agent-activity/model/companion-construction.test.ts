import {expect,it} from 'vitest';
import type {VaultDoc,VaultManifest} from '@/entities/docs-vault';
import {constructionHighWater,constructionXp,EMPTY_CONSTRUCTION,observeConstruction,parseConstruction} from './companion-construction';
const doc=(slug:string,frontmatter:Record<string,unknown>={},wordCount=80):VaultDoc=>({slug,path:slug+'.md',title:slug,tags:[],frontmatter,headings:[],excerpt:'A real record',wordCount,updatedAt:'',linksOut:[]});
const uid=(i:number)=>`10000000-0000-0000-0000-${String(i).padStart(12,'0')}`;
const manifest=(docs:VaultDoc[])=>({version:'1',generatedAt:'',docs,tree:[]} as unknown as VaultManifest);
it('uses real, unique concepts, resolved graph relations, implementation records and listed wiki pages',()=>{
 const docs=[doc('domains/shop',{kind:'domain',uid:uid(1)}),doc('capabilities/cart',{kind:'capability',uid:uid(2),domain:'shop',path:'src/cart.ts',dependencies:['missing']}),doc('wiki/cart'),doc('wiki/_template'),doc('wiki/_log'),doc('sources/spec'),doc('capabilities/invalid',{kind:'capability',uid:'broken'})];
 const result=observeConstruction(manifest(docs));expect(result).toEqual({concepts:2,relations:1,implementation:1,wiki:1,detail:6});
 expect(observeConstruction(manifest([...docs,doc('capabilities/duplicate',{kind:'capability',uid:uid(2)})]))).toMatchObject({concepts:1,relations:0,implementation:0});
});
it('counts enrichment in bounded units and preserves progress through cleanup and a rename',()=>{
 const base=observeConstruction(manifest([doc('capabilities/cart',{kind:'capability',uid:uid(2)},40)]));
 const expanded=observeConstruction(manifest([doc('capabilities/basket',{kind:'capability',uid:uid(2)},800)]));
 expect(expanded).toMatchObject({concepts:1,detail:10});expect(constructionXp(expanded)-constructionXp(base)).toBe(36);
 expect(constructionHighWater(expanded,base)).toEqual(expanded);expect(constructionHighWater(expanded,EMPTY_CONSTRUCTION)).toEqual(expanded);
 expect(constructionHighWater(expanded,expanded)).toEqual(expanded);
});
it('rejects corrupt persisted counters without resetting them to a rewarding empty state',()=>{
 expect(parseConstruction({...EMPTY_CONSTRUCTION,wiki:-1})).toBeNull();expect(parseConstruction({...EMPTY_CONSTRUCTION,detail:Infinity})).toBeNull();expect(parseConstruction({})).toBeNull();expect(parseConstruction(EMPTY_CONSTRUCTION)).toEqual(EMPTY_CONSTRUCTION);
});
