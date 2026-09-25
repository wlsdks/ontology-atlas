'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useTranslations} from 'next-intl';
import {useLocalVault} from '@/entities/vault-session';
import {CodedFailure} from '@/shared/lib/failure-code';
import {Button} from '@/shared/ui';
import {readCompanionSource,companionSourcePages} from '../model/companion-source';
import {useCompanionCompact} from '../model/use-companion-compact';
import type {QuestTarget} from '../model/companion-quests';
import {CompanionPager} from './CompanionPager';
import styles from './companion-immersive.module.css';

export function CompanionSource({target,onBack,onOpen,backLabel,declarations=false,exitBlocked=false}:{target:QuestTarget;onBack:()=>void;onOpen:(target:QuestTarget)=>void;backLabel?:string;declarations?:boolean;exitBlocked?:boolean}){
 const t=useTranslations('companion.source');const vault=useLocalVault();const compact=useCompanionCompact();const [page,setPage]=useState(0);
 const mounted=useCallback((node:HTMLElement|null)=>{node?.focus({preventScroll:true});},[]);
 const matches=vault.manifest?.docs.filter(doc=>target.uid?doc.frontmatter.uid===target.uid:doc.slug===target.slug)??[];const doc=matches.length===1?matches[0]:null;const fileHandle=doc?vault.fileHandles.get(doc.slug):undefined;
 const identity=useMemo(()=>doc?JSON.stringify([doc.slug,doc.mtime??doc.updatedAt,doc.frontmatter.uid,doc.frontmatter.kind,doc.frontmatter.dependencies,doc.frontmatter.depends_on,doc.frontmatter.relation_notes,declarations]):'',[doc,declarations]);const ready=vault.status==='loaded';
 const [read,setRead]=useState<{identity:string;root:FileSystemDirectoryHandle|null;body:string;error:'changed'|'large'|'unavailable'|null}|null>(null);
 useEffect(()=>{
  if(!ready||!fileHandle)return;let cancelled=false;
  readCompanionSource(fileHandle,{uid:target.uid,mtime:doc?.mtime,frontmatter:doc?.frontmatter},declarations).then(body=>{if(!cancelled)setRead({identity,root:vault.handle,body,error:null});}).catch(error=>{if(!cancelled)setRead({identity,root:vault.handle,body:'',error:error instanceof CodedFailure&&error.code==='companion-source-changed'?'changed':error instanceof CodedFailure&&error.code==='companion-source-large'?'large':'unavailable'});});
  return()=>{cancelled=true;};
 },[ready,fileHandle,identity,target.uid,doc?.mtime,doc?.frontmatter,declarations,vault.handle]);
 const current=ready&&read?.identity===identity&&read.root===vault.handle?read:null;const pages=useMemo(()=>companionSourcePages(current?.body??'',compact?80:120),[current?.body,compact]);const selected=Math.min(page,pages.length-1);
 const status=!ready?'loading':!doc||!fileHandle?'unavailable':!current?'loading':current.error??'loaded';
 return <section className={styles.sourceReader} aria-label={t('title')} data-testid="companion-source" data-companion-source tabIndex={-1} ref={mounted} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onBack();}}}>
  <div className={styles.sourceHeading}><p className="text-caption">{t('title')}</p><h4>{doc?.title??target.title}</h4><p className="text-caption">{doc?.slug??target.slug}.md</p></div>
  <div className={styles.sourceBody} data-testid="companion-source-body">{status==='loaded'?<p>{pages[selected]||t('empty')}</p>:<p role="status">{t(status)}</p>}</div>
  {status==='loaded'&&pages.length>1?<CompanionPager index={selected} count={pages.length} onChange={setPage} label={t('pages')}/>:null}
  <p className={styles.sourceBoundary}>{t(exitBlocked?'draftPending':'boundary')}</p><div className={styles.sourceActions}><Button data-companion-source-back className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={onBack}>{backLabel??t('back')}</Button>{doc?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" disabled={exitBlocked} onClick={()=>onOpen({...target,slug:doc.slug,title:doc.title})}>{t('outside')}</Button>:null}</div>
 </section>;
}
