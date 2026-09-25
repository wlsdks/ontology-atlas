import {expect,it} from 'vitest';
import {deriveOntologyFromVault,type VaultDoc,type VaultManifest} from '@/entities/docs-vault';
import {growthTargets} from './companion-growth';
import {buildLearningTopics,learningPassage} from './companion-learning';
const uid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const doc=(n:number,fm:Record<string,unknown>={}):VaultDoc=>({slug:`capabilities/n${n}`,path:`capabilities/n${n}.md`,title:`Ability ${n}`,frontmatter:{uid:uid(n),kind:'capability',...fm},mtime:n,tags:[],headings:[],excerpt:'Recorded responsibility.',wordCount:3,updatedAt:'',linksOut:[]});
const topics=(docs:VaultDoc[])=>{const manifest={docs,tree:[],version:'1',generatedAt:''} as unknown as VaultManifest;return buildLearningTopics(docs,deriveOntologyFromVault(manifest),growthTargets(docs,'en'));};
it('teaches the original dependency direction and names its declaring source',()=>{
 const values=topics([doc(1,{dependencies:['capabilities/n2'],relation_notes:{'capabilities/n2':'Requires the validation result.'}}),doc(2),doc(3)]);const target=values.find(topic=>topic.target.uid===uid(2))!;
 expect(target.dependent?.uid).toBe(uid(1));expect(target.declaration?.slug).toBe('capabilities/n1');expect(target.reason).toBe('Requires the validation result.');expect(values.find(topic=>topic.target.uid===uid(1))?.dependent).toBeNull();
});
it('does not infer dependency from association, containment, or a transitive path',()=>{
 const values=topics([doc(1,{dependencies:['capabilities/n2'],relates:['capabilities/n3'],contains:['capabilities/n3']}),doc(2,{dependencies:['capabilities/n3']}),doc(3)]);
 expect(values.find(topic=>topic.target.uid===uid(3))?.dependent?.uid).toBe(uid(2));expect(values.find(topic=>topic.target.uid===uid(1))?.dependent).toBeNull();
});
it('excludes absent or ambiguous identities and never labels another true dependent a wrong option',()=>{
 const values=topics([doc(1,{dependencies:['capabilities/n3','missing']}),doc(2,{depends_on:['capabilities/n3']}),doc(3),doc(4)]);const target=values.find(topic=>topic.target.uid===uid(3))!;
 expect(target.options.map(item=>item.uid)).toEqual([uid(1),uid(4)]);
 const reordered=topics([doc(4),doc(3),doc(2,{depends_on:['capabilities/n3']}),doc(1,{dependencies:['capabilities/n3','missing']})]).find(topic=>topic.target.uid===uid(3));expect(reordered?.signature).toBe(target.signature);
 const duplicate={...doc(1),slug:'capabilities/duplicate'};expect(topics([doc(1,{dependencies:['capabilities/n3']}),duplicate,doc(3)]).find(topic=>topic.target.uid===uid(3))?.dependent).toBeNull();
});
it('changes a journey signature when the topic, witness, relation or rationale changes',()=>{
 const origin=doc(1,{dependencies:['capabilities/n2'],relation_notes:{'capabilities/n2':'Original reason.'}}),target=doc(2);const signature=topics([origin,target])[1].signature;
 for(const pair of [[origin,{...target,mtime:99}],[{...origin,mtime:99},target],[doc(1),target],[doc(1,{dependencies:['capabilities/n2'],relation_notes:{'capabilities/n2':'Revised reason.'}}),target]])expect(topics(pair)[1].signature).not.toBe(signature);
});
it('quotes written purpose and exclusions without treating another section as a definition',()=>{
 const body='# Validation\n\nChecks the recorded structure.\n\n## Excludes\n- Does not establish semantic truth.\n\n## Evidence\nSource path.';
 expect(learningPassage(body,'purpose')).toBe('Checks the recorded structure.');expect(learningPassage(body,'boundary')).toBe('- Does not establish semantic truth.');
 expect(learningPassage('## Includes\n- Structure checks.','purpose')).toBe('');expect(learningPassage('Some prose.','boundary')).toBe('');
});
