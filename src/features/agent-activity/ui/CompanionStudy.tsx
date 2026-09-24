'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import type {VaultDoc} from '@/entities/docs-vault';
import {Button,Textarea} from '@/shared/ui';
import {SegmentedControl} from '@/shared/ui/segmented-control';
import {REFLECTION_KINDS,type CompanionGrowth,type GrowthEntry,type GrowthTarget,type ReflectionKind} from '../model/companion-growth';
import {CompanionPager} from './CompanionPager';
import styles from './companion-home.module.css';
import {useCompanionCompact} from '../model/use-companion-compact';
export type GrowthDraft={selectedUid:string|null;note:string;reflection:ReflectionKind};
type Props={growth:CompanionGrowth;targets:GrowthTarget[];docs:readonly VaultDoc[];draft:GrowthDraft;onDraft:(draft:GrowthDraft)=>void;record:(entry:GrowthEntry)=>boolean;revise:(uid:string,note:string,reflection:ReflectionKind)=>boolean;openTarget:(target:GrowthTarget)=>void;disabled:boolean};
export function CompanionStudy({growth,targets,docs,draft,onDraft,record,revise,openTarget,disabled}:Props){
 const compact=useCompanionCompact();
 const t=useTranslations('companion.growth');
 const [mode,setMode]=useState<'read'|'reflect'|'history'>('read');
 const [index,setIndex]=useState(0);const [page,setPage]=useState(0);const [historyIndex,setHistoryIndex]=useState(0);const [saved,setSaved]=useState(false);
 const target=targets.find(item=>item.uid===draft.selectedUid)??targets[Math.min(index,targets.length-1)];
 const targetIndex=Math.max(0,targets.findIndex(item=>item.uid===target?.uid));
 const doc=docs.find(doc=>doc.slug===target?.slug);
 const seen=growth.entries.some(entry=>entry.kind==='explored'&&entry.target.uid===target?.uid);
 const prior=growth.entries.find(entry=>entry.kind==='reflected'&&entry.target.uid===target?.uid);
 const text=Array.from(doc?.description||doc?.excerpt||t('noDescription'));
 const pages=Math.max(1,Math.ceil(text.length/120));
 const entry=growth.entries[Math.min(historyIndex,growth.entries.length-1)];
 const select=(i:number)=>{record({kind:'explored',target:targets[i],at:Date.now()});setIndex(i);setPage(0);onDraft({selectedUid:targets[i].uid,note:'',reflection:'learned'});setSaved(false);};
 const reflect=()=>{onDraft({selectedUid:target.uid,note:prior?.note??draft.note,reflection:prior?.reflection??draft.reflection});setMode('reflect');setSaved(false);};
 const save=()=>{if(!target||!draft.note.trim())return;const ok=prior?revise(target.uid,draft.note.trim(),draft.reflection):record({kind:'reflected',target,note:draft.note.trim(),reflection:draft.reflection,at:Date.now()});if(ok){onDraft({...draft,note:''});setSaved(true);}};
 return <section className={styles.fixedPanel} aria-label={t('studyTitle')}>
  <SegmentedControl ariaLabel={t('studySections')} value={mode} onChange={value=>{if(value==='reflect'&&target){onDraft({selectedUid:target.uid,note:draft.note||prior?.note||'',reflection:draft.note?draft.reflection:prior?.reflection??draft.reflection});}setMode(value);}} options={[{value:'read',label:t('readTab')},{value:'reflect',label:t('reflectTab')},{value:'history',label:t('historyTab')}]}/>
  {mode==='read'?<div className={styles.panelPage}>
   {!target?<p className="text-body">{t('noConcepts')}</p>:<>
    <div className="flex items-center justify-between gap-2"><h3 className="min-w-0 truncate text-title font-[var(--font-weight-emphasis)]">{target.title}</h3><span className="shrink-0 text-label text-[color:var(--color-text-secondary)]">{targetIndex+1}/{targets.length}</span></div>
    <div className={styles.pageBody} data-testid="companion-concept-preview">{seen?<><p className="whitespace-pre-wrap break-words text-body">{text.slice(Math.min(page,pages-1)*120,(Math.min(page,pages-1)+1)*120).join('')}</p>{pages>1?<CompanionPager index={Math.min(page,pages-1)} count={pages} onChange={setPage} label={t('preview')}/>:null}</>:<p className="text-body text-[color:var(--color-text-secondary)]">{t('exploreHint',{xp:5})}</p>}</div>
    <div className="flex flex-wrap gap-2">{seen?<><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={reflect}>{t(prior?'editDiscovery':'reflectionTitle')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>openTarget(target)}>{t('openConcept')}</Button></>:<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={disabled} onClick={()=>record({kind:'explored',target,at:Date.now()})}>{t('explore')}</Button>}</div>
    <CompanionPager index={targetIndex} count={targets.length} onChange={select} disabled={Boolean(draft.note.trim())} label={t('conceptPages')}/>
   </>}
  </div>:null}
  {mode==='reflect'?<div className={styles.panelPage}>
   {!target||!seen?<><p className="text-body">{t('readFirst')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>setMode('read')}>{t('readTab')}</Button></>:<>
    <h3 className="truncate text-body font-[var(--font-weight-emphasis)]">{target.title}</h3>
    <form className={styles.noteForm} onSubmit={event=>{event.preventDefault();save();}}>
     <SegmentedControl ariaLabel={t('reflectionKind')} value={draft.reflection} onChange={reflection=>onDraft({...draft,selectedUid:target.uid,reflection})} options={REFLECTION_KINDS.map(value=>({value,label:t(`kind.${value}`)}))} variant="chips"/>
     <Textarea label={t('noteLabel')} placeholder={t('notePlaceholder')} rows={compact?1:2} style={{resize:'none'}} maxLength={240} value={draft.note} onChange={event=>{onDraft({...draft,selectedUid:target.uid,note:event.target.value});setSaved(false);}}/>
     <Button className="atlas-touch-floor atlas-touch-floor-wide" type="submit" variant="primary" disabled={disabled||!draft.note.trim()}>{t(prior?'updateDiscovery':'keepDiscovery')}</Button>
     <p role="status" className="text-label text-[color:var(--color-text-secondary)]">{saved?t('saved'):t('reflectionHint',{xp:15})}</p>
    </form>
   </>}
  </div>:null}
  {mode==='history'?<div className={styles.panelPage}>
   {entry?<><h3 className="truncate text-body font-[var(--font-weight-emphasis)]">{entry.target.title}</h3><div className={styles.pageBody} data-testid="companion-growth-history"><p className="text-label text-[color:var(--color-text-secondary)]">{t(entry.kind==='explored'?'explored':`kind.${entry.reflection}`,{title:entry.target.title})}</p><p className="break-words text-body">{entry.note}</p></div>{targets.some(item=>item.uid===entry.target.uid)?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>openTarget(targets.find(item=>item.uid===entry.target.uid)!)}>{t('openConcept')}</Button>:<p className="text-label">{t('missing')}</p>}<CompanionPager index={Math.min(historyIndex,growth.entries.length-1)} count={growth.entries.length} onChange={setHistoryIndex} label={t('history')}/></>:<p className="text-body">{t('empty')}</p>}
  </div>:null}
 </section>;
}
