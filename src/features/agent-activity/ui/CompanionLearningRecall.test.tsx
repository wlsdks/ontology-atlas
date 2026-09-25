import {useState} from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {emptyLearningDraft,type LearningDraft,type LearningTopic} from '../model/companion-learning';
import type {CompanionGrowth} from '../model/companion-growth';
import {CompanionLearning} from './CompanionLearning';
const state=vi.hoisted(()=>({vault:undefined as unknown}));
vi.mock('@/entities/vault-session',()=>({useLocalVault:()=>state.vault}));
vi.mock('next-intl',()=>({useLocale:()=> 'en',useTranslations:()=>((key:string,values?:Record<string,unknown>)=>values?.date?`${key} ${values.date}`:key)}));
vi.mock('../model/use-companion-compact',()=>({useCompanionCompact:()=>false}));
const target={uid:'30000000-0000-4000-8000-000000000001',slug:'capabilities/check',title:'Check'};
const note='Review actual code before inferring runtime impact.';
const topic:LearningTopic={target,kind:'capability',signature:'saved-7',dependent:null,declaration:null,reason:null,options:[]};
function fixture(){
 const raw=`---\nuid: ${target.uid}\nkind: capability\n---\nChecks a saved record.`;const getFile=vi.fn(async()=>({size:raw.length,lastModified:7,text:async()=>raw} as File));
 const vault={status:'loaded',handle:{} as FileSystemDirectoryHandle,manifest:{docs:[{slug:target.slug,mtime:7,frontmatter:{uid:target.uid,kind:'capability'}}]},fileHandles:new Map([[target.slug,{getFile} as unknown as FileSystemFileHandle]])};state.vault=vault;
 const growth:CompanionGrowth={version:1,entries:[{kind:'reflected',target,at:Date.UTC(2026,8,25),note,reflection:'uncertain'}]};
 return {vault,getFile,growth,record:vi.fn(()=>true),revise:vi.fn(()=>true),onDraft:vi.fn()};
}
function Harness({data,topics=[topic],initial=emptyLearningDraft()}:{data:ReturnType<typeof fixture>;topics?:LearningTopic[];initial?:LearningDraft}){
 const [draft,setDraft]=useState(initial);
 return <CompanionLearning topics={topics} draft={draft} onDraft={next=>{data.onDraft(next);setDraft(next);}} growth={data.growth} record={data.record} revise={data.revise} disabled={false} camp returnToCamp={()=>{}} openTarget={()=>{}}/>;
}
it('opens a stored uncertain note directly without source reads or reward writes',()=>{
 const data=fixture();render(<Harness data={data}/>);fireEvent.click(screen.getByRole('button',{name:target.title}));
 expect(screen.queryByText(note)).not.toBeNull();expect(screen.getByText('kind.uncertain')).toBeVisible();expect(data.getFile).not.toHaveBeenCalled();expect(data.record).not.toHaveBeenCalled();expect(data.revise).not.toHaveBeenCalled();
});
it('keeps the historical note when its current topic disappears',()=>{
 const data=fixture();const view=render(<Harness data={data}/>);fireEvent.click(screen.getByRole('button',{name:target.title}));data.vault.fileHandles.clear();data.vault.manifest.docs=[];view.rerender(<Harness data={data} topics={[]}/>);
 expect(screen.queryByText(note)).not.toBeNull();expect(screen.getByRole('button',{name:'reexplore'})).toBeDisabled();expect(screen.getByText('currentUnavailable')).toBeVisible();expect(data.record).not.toHaveBeenCalled();
});
it('starts a current source read only when re-exploration is requested',async()=>{
 const data=fixture();render(<Harness data={data}/>);fireEvent.click(screen.getByRole('button',{name:target.title}));fireEvent.click(screen.getByRole('button',{name:'reexplore'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'readNext'})).toBeEnabled());expect(screen.getByText('Checks a saved record.')).toBeVisible();expect(data.getFile).toHaveBeenCalledTimes(1);expect(data.record).not.toHaveBeenCalled();
});
it('preserves an unfinished explanation rather than replacing it with the stored note',()=>{
 const data=fixture();const draft={...emptyLearningDraft(),uid:target.uid,note:'An unfinished correction.'};render(<Harness data={data} initial={draft}/>);fireEvent.click(screen.getByRole('button',{name:target.title}));
 expect(data.onDraft).toHaveBeenLastCalledWith(expect.objectContaining({step:'read',note:draft.note}));expect(data.revise).not.toHaveBeenCalled();
});
it('does not invent a recorded date for a retained timestamp outside the Date range',()=>{
 const data=fixture();data.growth.entries[0].at=Number.MAX_VALUE;render(<Harness data={data}/>);fireEvent.click(screen.getByRole('button',{name:target.title}));expect(screen.getByText(note)).toBeVisible();expect(screen.getByText('recordedOn dateUnavailable')).toBeVisible();
});
it('reports a missing personal record without presenting the cached draft as saved',()=>{
 const data=fixture();const view=render(<Harness data={data}/>);fireEvent.click(screen.getByRole('button',{name:target.title}));data.growth={version:1,entries:[]};view.rerender(<Harness data={data}/>);expect(screen.getByText('noteUnavailable')).toBeVisible();expect(screen.queryByText(note)).toBeNull();expect(data.record).not.toHaveBeenCalled();
});
