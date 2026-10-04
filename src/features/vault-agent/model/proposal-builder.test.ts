import { describe, expect, it, vi } from 'vitest';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { buildProposal, type BuildProposalInput } from './proposal-builder';
import { applyProposal, type VaultWritePort } from './proposal-applier';

const labels={createFile:(path:string)=>path,modifyFile:(path:string)=>path,addRelation:({from,to}:{from:string;to:string})=>`${from} -> ${to}`};
function input(intents:BuildProposalInput['intents']):BuildProposalInput {
  return {intents,port:{nodes:[],edges:[],docs:[],readDocText:async()=>null},readNodesThisTurn:[],vaultIsGit:false,locale:'en',labels,agentName:'local-test'};
}
const capability={slug:'capabilities/check-input',kind:'capability',title:'Check input',body:'Reject empty input.',path:'src/check.ts',elements:['elements/input-rule']};
const element={slug:'elements/input-rule',kind:'element',title:'Input rule',body:'Checks one input.',path:'src/rule.ts'};

describe('reviewable construction proposals',()=>{
  it('preserves advertised implementation paths and containment in created node frontmatter',async()=>{
    const proposal=await buildProposal(input([{name:'add_concepts',args:{concepts:[capability,element,{slug:'domains/input',kind:'domain',title:'Input',capabilities:[capability.slug]}]}}]));
    const rows=proposal!.changes.map(change=>parseFrontmatter(change.files[0].after));
    expect(rows[0].frontmatter.path).toBe('src/check.ts');
    expect(rows[0].frontmatter.elements).toEqual(['elements/input-rule']);
    expect(rows[1].frontmatter.path).toBe('src/rule.ts');
    expect(rows[2].frontmatter.capabilities).toEqual(['capabilities/check-input']);
    expect(rows[0].body.trim()).toBe(capability.body);
    expect(rows.every(row=>typeof row.frontmatter.uid==='string')).toBe(true);
  });
  it('preserves ordinary relation-then-patch intent order on an existing document',async()=>{
    const prepared=input([{name:'add_relation',args:{from:'elements/existing',to:'elements/target',type:'depends_on',why:'Observed dependency.'}},{name:'patch_concept',args:{slug:'elements/existing',frontmatter:{dependencies:[]}}}]);
    const before='---\nkind: element\ntitle: Existing\nslug: elements/existing\ndependencies: []\n---\n\nExisting role.';
    prepared.port={...prepared.port,docs:[{slug:'elements/existing',path:'elements/existing.md',title:'Existing',kind:'element',frontmatter:{},excerpt:''},{slug:'elements/target',path:'elements/target.md',title:'Target',kind:'element',frontmatter:{},excerpt:''}],readDocText:async()=>before};
    const proposal=await buildProposal(prepared);
    expect(parseFrontmatter(proposal!.changes.at(-1)!.files[0].after).frontmatter.dependencies).toEqual([]);
  });
  it('rejects invalid plural containment after resolving future endpoints and aliases',async()=>{
    for(const [concept,type] of [[capability,'capabilities'],[element,'elements']] as const){
      const alias=concept.slug.split('/').at(-1)!;
      const proposal=await buildProposal(input([{name:'add_relation',args:{from:alias,to:alias,type,why:'Invalid same-kind parent.'}},{name:'add_concept',args:concept}]));
      expect(proposal!.changes).toHaveLength(1);
      expect(proposal!.changes[0].tool).toBe('add_concept');
    }
  });
  it('preserves a relation emitted before either proposed endpoint',async()=>{
    const proposal=await buildProposal(input([{name:'add_relation',args:{from:capability.slug,to:element.slug,type:'elements',why:'The rule implements input checking.'}},{name:'add_concepts',args:{concepts:[capability,element]}}]));
    const cap=proposal!.changes.flatMap(change=>change.files).filter(file=>file.path===`${capability.slug}.md`).at(-1)!;
    expect(parseFrontmatter(cap.after).frontmatter.elements).toEqual([element.slug]);
    expect(JSON.stringify(parseFrontmatter(cap.after).frontmatter.relation_notes)).toContain('The rule implements input checking.');
  });
  it('persists the exact reviewed typed relation between newly proposed nodes through the existing applier',async()=>{
    const proposal=await buildProposal(input([
      {name:'add_concepts',args:{concepts:[{...capability,elements:[]},element]}},
      {name:'add_relation',args:{from:capability.slug,to:element.slug,type:'elements',why:'The capability calls this rule.'}},
    ]));
    expect(proposal!.changes).toHaveLength(3);
    const createDoc=vi.fn(async(_slug:string,_content:string)=>{});
    const port:VaultWritePort={createDoc,saveDoc:vi.fn(async()=>{}),currentMtime:()=>undefined,refresh:vi.fn(async()=>{}),snapshot:vi.fn(async()=>null)};
    const result=await applyProposal(proposal!,port,{snapshotLabel:'Construction test'});
    expect(result.status).toBe('applied');expect(createDoc).toHaveBeenCalledTimes(2);
    const saved=createDoc.mock.calls.find(([slug])=>slug===capability.slug)!;
    const parsed=parseFrontmatter(saved[1]);
    expect(parsed.frontmatter.elements).toEqual([element.slug]);
    expect(parsed.frontmatter.relation_notes).toEqual({[element.slug]:'The capability calls this rule.'});
    expect(parsed.frontmatter.path).toBe(capability.path);
    expect(proposal!.status).toBe('pending');
  });
  it('accumulates all same-file relation intents and their rationales without dropping an earlier one',async()=>{
    const args={slug:'elements/controller',kind:'element',title:'Controller',body:'Coordinates two steps.'};
    const proposal=await buildProposal(input([
      {name:'add_concept',args},
      {name:'add_relation',args:{from:args.slug,to:'elements/a',type:'depends_on',why:'Needs A.'}},
      {name:'add_relation',args:{from:args.slug,to:'elements/b',type:'depends_on',why:'Needs B.'}},
    ]));
    expect(proposal!.changes).toHaveLength(3);
    const parsed=parseFrontmatter(proposal!.changes.at(-1)!.files[0].after);
    expect(parsed.frontmatter.dependencies).toEqual(['elements/a','elements/b']);
    expect(parsed.frontmatter.relation_notes).toEqual({'elements/a':'Needs A.','elements/b':'Needs B.'});
  });
});
