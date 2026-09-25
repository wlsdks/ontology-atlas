'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {useLocalVault} from '@/entities/vault-session';
import {Button,RowButton,Textarea} from '@/shared/ui';
import {SegmentedControl} from '@/shared/ui/segmented-control';
import {useRovingRadioGroup} from '@/shared/lib/use-roving-radio-group';
import {readCompanionDocument,companionSourcePages} from '../model/companion-source';
import {emptyLearningDraft,learningPassage,type LearningDraft,type LearningTopic} from '../model/companion-learning';
import {REFLECTION_KINDS,type CompanionGrowth,type GrowthEntry,type ReflectionKind} from '../model/companion-growth';
import type {QuestTarget} from '../model/companion-quests';
import {useCompanionCompact} from '../model/use-companion-compact';
import {CompanionFolioArt} from './CompanionFolioArt';
import {CompanionItem} from './CompanionItem';
import {CompanionPager} from './CompanionPager';
import {CompanionSource} from './CompanionSource';
import styles from './companion-immersive.module.css';

type Props={topics:LearningTopic[];draft:LearningDraft;onDraft:(draft:LearningDraft)=>void;growth:CompanionGrowth;record:(entry:GrowthEntry)=>boolean;revise:(uid:string,note:string,reflection:ReflectionKind)=>boolean;disabled:boolean;camp:boolean;returnToCamp:()=>void;openTarget:(target:QuestTarget)=>void};
const STEPS=['read','relation','impact','reflect'] as const;
export function CompanionLearning({topics,draft,onDraft,growth,record,revise,disabled,camp,returnToCamp,openTarget}:Props){
 const t=useTranslations('companion.learning');const g=useTranslations('companion.growth');const vault=useLocalVault();const compact=useCompanionCompact();const topic=topics.find(item=>item.target.uid===draft.uid);const ready=vault.status==='loaded';
 const [saving,setSaving]=useState(false);const [verifyFailed,setVerifyFailed]=useState(false);const request=useRef({epoch:0});
 const [topicPage,setTopicPage]=useState(0);const [passage,setPassage]=useState<'purpose'|'boundary'>('purpose');const [readPage,setReadPage]=useState(0);const [mismatch,setMismatch]=useState(false);const [saveFailed,setSaveFailed]=useState(false);const [source,setSource]=useState<{target:QuestTarget;declarations:boolean}|null>(null);
 const doc=vault.manifest?.docs.find(item=>item.slug===topic?.target.slug);const origin=vault.manifest?.docs.find(item=>item.slug===topic?.declaration?.slug);const topicHandle=doc?vault.fileHandles.get(doc.slug):undefined;const originHandle=origin?vault.fileHandles.get(origin.slug):undefined;
 const [read,setRead]=useState<{signature:string;root:FileSystemDirectoryHandle|null;handle:FileSystemFileHandle;origin:FileSystemFileHandle|undefined;body:string;error:boolean}|null>(null);
 useEffect(()=>{
  if(!camp||!ready||!topic||!topicHandle)return;let cancelled=false;const root=vault.handle;
  Promise.all([readCompanionDocument(topicHandle,{uid:topic.target.uid,mtime:doc?.mtime,frontmatter:doc?.frontmatter}),topic.declaration?(originHandle?readCompanionDocument(originHandle,{uid:topic.declaration.uid,mtime:origin?.mtime,frontmatter:origin?.frontmatter}):Promise.reject(new Error('missing'))):null]).then(([value])=>{if(!cancelled)setRead({signature:topic.signature,root,handle:topicHandle,origin:originHandle,body:value.body,error:false});}).catch(()=>{if(!cancelled)setRead({signature:topic.signature,root,handle:topicHandle,origin:originHandle,body:'',error:true});});
  return()=>{cancelled=true;};
 },[camp,ready,topic,topicHandle,originHandle,doc?.mtime,doc?.frontmatter,origin?.mtime,origin?.frontmatter,vault.handle]);
 useEffect(()=>{const counter=request.current;const epoch=++counter.epoch;queueMicrotask(()=>{if(counter.epoch===epoch)setSaving(false);});return()=>{counter.epoch++;};},[topic?.signature,vault.handle,topicHandle,originHandle,ready]);
 const current=read?.signature===topic?.signature&&read?.root===vault.handle?read:null;
 const changed=Boolean(topic&&draft.signature&&draft.signature!==topic.signature);const canAdvance=Boolean(ready&&topic&&current&&!current.error&&!changed&&!disabled);
 const text=useMemo(()=>learningPassage(current?.body??'',passage),[current?.body,passage]);const pages=useMemo(()=>companionSourcePages(text,compact?80:120),[text,compact]);const page=Math.min(readPage,pages.length-1);
 const unsaved=Boolean(draft.note.trim())&&!growth.entries.some(entry=>entry.kind==='reflected'&&entry.target.uid===draft.uid&&entry.note===draft.note.trim());
 const summaryPages=useMemo(()=>companionSourcePages(draft.note,compact?80:120),[draft.note,compact]);
 const update=(value:Partial<LearningDraft>)=>onDraft({...draft,...value});
 const radio=useRovingRadioGroup({value:draft.choice??'',values:topic?.options.map(item=>item.uid)??[],busy:!canAdvance,onChange:choice=>{update({choice,checked:false});setMismatch(false);}});
 const choose=(next:LearningTopic)=>{request.current.epoch++;setSaving(false);setVerifyFailed(false);const prior=growth.entries.find(entry=>entry.kind==='reflected'&&entry.target.uid===next.target.uid);onDraft({...emptyLearningDraft(),uid:next.target.uid,signature:next.signature,step:'read',note:draft.uid===next.target.uid?draft.note:prior?.note??'',reflection:draft.uid===next.target.uid?draft.reflection:prior?.reflection??'uncertain'});setPassage('purpose');setReadPage(0);setMismatch(false);setSaveFailed(false);};
 const finish=async()=>{
  if(!topic||!canAdvance||!topicHandle||!draft.note.trim()||saving)return;
  const epoch=++request.current.epoch;setSaving(true);setVerifyFailed(false);
  try{
   await Promise.all([readCompanionDocument(topicHandle,{uid:topic.target.uid,mtime:doc?.mtime,frontmatter:doc?.frontmatter}),topic.declaration?(originHandle?readCompanionDocument(originHandle,{uid:topic.declaration.uid,mtime:origin?.mtime,frontmatter:origin?.frontmatter}):Promise.reject(new Error('missing'))):null]);
   if(request.current.epoch!==epoch)return;
   const prior=growth.entries.some(entry=>entry.kind==='reflected'&&entry.target.uid===topic.target.uid);const ok=prior?revise(topic.target.uid,draft.note.trim(),draft.reflection):record({kind:'reflected',target:topic.target,at:Date.now(),note:draft.note.trim(),reflection:draft.reflection});setSaveFailed(!ok);if(ok){setReadPage(0);update({step:'done'});}
  }catch{if(request.current.epoch===epoch)setVerifyFailed(true);}
  finally{if(request.current.epoch===epoch)setSaving(false);}
 };

 if(source)return <CompanionSource target={source.target} declarations={source.declarations} backLabel={t('returnLesson')} exitBlocked={unsaved} onBack={()=>setSource(null)} onOpen={openTarget}/>;
 if(!camp)return <div className={styles.learningEmpty}><CompanionFolioArt kind="study"/><h4>{t('campTitle')}</h4><p>{t('campBody')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" disabled={disabled} variant="primary" onClick={returnToCamp}>{t('returnCamp')}</Button></div>;
 if(!ready)return <p role="status">{t('loading')}</p>;
 if(!topic||draft.step==='choose'){
  const total=Math.max(1,Math.ceil(topics.length/6));const index=Math.min(topicPage,total-1);
  return <section className={styles.learningChooser} data-testid="companion-learning"><div className={styles.learningIntro}><CompanionFolioArt kind="study"/><h4>{t('choose')}</h4><p>{t('intro')}</p><p>{t('rewardRule')}</p></div><div className={styles.learningTopics}>{topics.length?<><div className={styles.learningTopicGrid}>{topics.slice(index*6,index*6+6).map(item=><RowButton key={item.target.uid} disabled={unsaved&&draft.uid!==item.target.uid&&draft.step!=='done'} onClick={()=>choose(item)} aria-label={item.target.title} className={styles.learningTopic}><CompanionItem index={item.kind==='capability'?4:item.kind==='domain'?7:8}/><span><strong className="font-[var(--font-weight-strong)]">{item.target.title}</strong><small>{t(item.dependent?'hasLink':'unknownLink')}</small></span></RowButton>)}</div><CompanionPager index={index} count={total} onChange={setTopicPage} label={t('topicPages')}/></>:<p>{t('empty')}</p>}{unsaved?<Textarea label={t('retainedDraft')} value={draft.note} maxLength={240} rows={1} onChange={event=>update({note:event.target.value})}/>:null}</div></section>;
 }
 return <section className={styles.learningJourney} data-testid="companion-learning" data-step={draft.step}>
  <aside className={styles.learningContext}><CompanionFolioArt kind="study"/><h4>{topic.target.title}</h4><ol>{STEPS.map(step=><li key={step} aria-current={draft.step===step?'step':undefined}>{t(`step.${step}`)}</li>)}</ol><p>{t('recordBoundary')}</p><Button className={styles.learningSourceOpener} aria-label={t('readFull')} title={t('readFull')} variant="ghost" onClick={()=>setSource({target:topic.target,declarations:false})}><CompanionItem index={4}/><span>{t('sourceShort')}</span></Button></aside>
  <div className={styles.learningTask}>
   {changed?<><p role="status">{t('changed')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={()=>choose(topic)}>{t('restart')}</Button></>:!current||current.error?<><p role="status">{t(current?.error?'unavailable':'loading')}</p>{current?.error?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>update({step:'choose'})}>{t('choose')}</Button>:null}</>:draft.step==='read'?<>
    <h4>{t('readTitle')}</h4><SegmentedControl ariaLabel={t('passages')} value={passage} onChange={value=>{setPassage(value);setReadPage(0);}} options={[{value:'purpose',label:t('purpose')},{value:'boundary',label:t('boundary')}]}/>
    <div className={styles.learningQuote}><p>{text?pages[page]:t(passage==='purpose'?'missingPurpose':'missingBoundary')}</p></div>{pages.length>1?<CompanionPager index={page} count={pages.length} onChange={setReadPage} label={t('passagePages')}/>:null}
    <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!canAdvance} onClick={()=>{const ok=record({kind:'explored',target:topic.target,at:Date.now()});setSaveFailed(!ok);if(ok)update({step:'relation',signature:topic.signature});}}>{t('readNext')}</Button>
   </>:draft.step==='relation'?<>
    <h4>{t('relationTitle')}</h4><p role="status">{draft.checked?t('matchesRecord'):mismatch?t('tryEvidence'):t(topic.dependent?'relationQuestion':'missingLink',{title:topic.target.title})}</p>
    {topic.dependent?<><div {...radio.groupProps} className={styles.learningChoices} aria-label={t('relationChoices')}>{topic.options.map((item,index)=><RowButton key={item.uid} {...radio.itemProps(index)} active={draft.choice===item.uid} className={styles.learningChoice}><strong className="font-[var(--font-weight-strong)]">{item.title}</strong><small>{item.slug}</small></RowButton>)}</div><div className={styles.learningActions}><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" aria-label={t('declaration')} onClick={()=>setSource({target:topic.declaration!,declarations:true})}>{t('declarationShort')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!canAdvance||!draft.choice} onClick={()=>{if(draft.checked)update({step:'impact'});else{const matches=draft.choice===topic.dependent?.uid;setMismatch(!matches);update({checked:matches});}}}>{t(draft.checked?'next':'compare')}</Button></div></>:null}
    <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" disabled={!canAdvance} onClick={()=>update({step:'impact',reflection:'uncertain'})}>{t('keepUnknown')}</Button>
   </>:draft.step==='impact'?<>
    <h4>{t('impactTitle')}</h4>{topic.dependent?<><div className={styles.learningAssertion}><strong className="font-[var(--font-weight-strong)]">{topic.dependent.title}</strong><span>{t('dependsOn')}</span><strong className="font-[var(--font-weight-strong)]">{topic.target.title}</strong></div><p>{t('candidate',{title:topic.dependent.title})}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>setSource({target:topic.declaration!,declarations:true})}>{t('declarationAt',{title:topic.declaration!.title})}</Button></>:<p>{t('missingImpact')}</p>}<p>{t('impactBoundary')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!canAdvance} onClick={()=>update({step:'reflect'})}>{t('toReflection')}</Button>
   </>:draft.step==='reflect'?<>
    {verifyFailed||saveFailed?<p role="alert">{t(verifyFailed?'verifyFailed':'saveFailed')}</p>:<h4>{t('reflectionTitle')}</h4>}<SegmentedControl ariaLabel={g('reflectionKind')} busy={saving} value={draft.reflection} onChange={reflection=>update({reflection})} options={REFLECTION_KINDS.map(value=>({value,label:g(`kind.${value}`)}))} variant="chips"/>
    <Textarea label={<span className={styles.learningNoteLabel}><span>{t('note')}</span><span aria-hidden="true">{draft.note.length}/240</span></span>} aria-label={t('note')} aria-description={t('noteLimit',{count:draft.note.length})} placeholder={t('reflectionPrompt')} value={draft.note} rows={compact?1:2} disabled={saving} maxLength={240} style={{resize:'none'}} onChange={event=>{update({note:event.target.value});setSaveFailed(false);}}/>
    <p className={styles.learningRewardRule}>{t('rewardRule')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!canAdvance||!draft.note.trim()||saving} onClick={()=>{if(verifyFailed){setVerifyFailed(false);update({step:'read',signature:null,checked:false});void vault.refresh().catch(()=>setVerifyFailed(true));}else void finish();}}>{t(verifyFailed?'refreshEvidence':saving?'checking':'save')}</Button>
   </>:<><CompanionFolioArt kind="quest" className={styles.learningCompleteArt}/><h4>{t('saved')}</h4><p>{summaryPages[Math.min(readPage,summaryPages.length-1)]}</p>{summaryPages.length>1?<CompanionPager index={Math.min(readPage,summaryPages.length-1)} count={summaryPages.length} onChange={setReadPage} label={t('passagePages')}/>:null}<p>{t('completedBoundary')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={()=>onDraft(emptyLearningDraft())}>{t('another')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>setSource({target:topic.target,declarations:false})}>{t('readFull')}</Button></>}
   {saveFailed&&draft.step!=='reflect'?<p role="alert">{t('saveFailed')}</p>:null}
  </div>
 </section>;
}
