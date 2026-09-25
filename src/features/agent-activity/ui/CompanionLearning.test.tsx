import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {emptyLearningDraft,type LearningTopic} from '../model/companion-learning';
import {EMPTY_GROWTH} from '../model/companion-growth';
import {CompanionLearning} from './CompanionLearning';
const state=vi.hoisted(()=>({vault:undefined as unknown}));
vi.mock('@/entities/vault-session',()=>({useLocalVault:()=>state.vault}));
vi.mock('next-intl',()=>({useTranslations:()=>((key:string)=>key)}));
vi.mock('../model/use-companion-compact',()=>({useCompanionCompact:()=>false}));

it.each([false,true])('only an actual evidence version change cancels a pending save (changed: %s)',async(changed)=>{
 const target={uid:'30000000-0000-4000-8000-000000000001',slug:'capabilities/check',title:'Check'};
 const frontmatter={uid:target.uid,kind:'capability'};const raw=`---\nuid: ${target.uid}\nkind: capability\n---\nChecks a saved record.`;
 const file={size:raw.length,lastModified:7,text:async()=>raw} as File;
 let release!:(file:File)=>void;const pending=new Promise<File>(resolve=>{release=resolve;});
 const first={getFile:vi.fn().mockResolvedValueOnce(file).mockReturnValueOnce(pending)} as unknown as FileSystemFileHandle;
 const replacement={getFile:vi.fn().mockResolvedValue(changed?{...file,lastModified:8}:file)} as unknown as FileSystemFileHandle;
 const vault={status:'loaded',handle:{} as FileSystemDirectoryHandle,manifest:{docs:[{slug:target.slug,mtime:7,frontmatter}]},fileHandles:new Map([[target.slug,first]])};state.vault=vault;
 const topic:LearningTopic={target,kind:'capability',signature:'saved-version-7',dependent:null,declaration:null,reason:null,options:[]};
 const onDraft=vi.fn();const record=vi.fn(()=>true);const props={topics:[topic],draft:{...emptyLearningDraft(),uid:target.uid,signature:topic.signature,step:'reflect' as const,note:'The recorded responsibility still needs runtime evidence.'},onDraft,growth:EMPTY_GROWTH,record,revise:vi.fn(()=>true),disabled:false,camp:true,returnToCamp:vi.fn(),openTarget:vi.fn()};
 const view=render(<CompanionLearning {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'save'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'save'}));expect(screen.getByRole('button',{name:'checking'})).toBeDisabled();
 await act(async()=>{vault.fileHandles=new Map([[target.slug,replacement]]);if(changed){vault.manifest.docs[0].mtime=8;props.topics=[{...topic,signature:'saved-version-8'}];}view.rerender(<CompanionLearning {...props}/>);});await waitFor(()=>expect(replacement.getFile).toHaveBeenCalled());if(!changed)expect(screen.queryByRole('button',{name:'checking'})).not.toBeNull();
 await act(async()=>release(file));if(changed){expect(record).not.toHaveBeenCalled();expect(onDraft).not.toHaveBeenCalled();}else{expect(record).toHaveBeenCalledTimes(1);expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({step:'done',note:props.draft.note}));}
});
