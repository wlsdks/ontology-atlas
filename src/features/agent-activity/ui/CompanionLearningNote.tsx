'use client';
import {useMemo} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Button} from '@/shared/ui';
import {companionSourcePages} from '../model/companion-source';
import type {GrowthEntry,GrowthTarget} from '../model/companion-growth';
import {useCompanionCompact} from '../model/use-companion-compact';
import {CompanionFolioArt} from './CompanionFolioArt';
import {CompanionItem} from './CompanionItem';
import {CompanionPager} from './CompanionPager';
import styles from './companion-immersive.module.css';

type Props={entry:GrowthEntry;currentTarget:GrowthTarget|null;justSaved:boolean;page:number;onPage:(page:number)=>void;onExplore:()=>void;onChoose:()=>void;onSource:(target:GrowthTarget)=>void};
/** A retained personal note can be read independently of today's source availability. */
export function CompanionLearningNote({entry,currentTarget,justSaved,page,onPage,onExplore,onChoose,onSource}:Props){
 const t=useTranslations('companion.learning');const g=useTranslations('companion.growth');const locale=useLocale();const compact=useCompanionCompact();const target=currentTarget??entry.target;
 const pages=useMemo(()=>companionSourcePages(entry.note??'',compact?60:100),[entry.note,compact]);const index=Math.min(page,pages.length-1);const canShowWhole=pages.length>1&&(entry.note?.split('\n').length??1)<=2;
 const date=useMemo(()=>{const value=new Date(entry.at);return Number.isFinite(value.getTime())?{text:new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(value),iso:value.toISOString()}:null;},[entry.at,locale]);
 return <section className={styles.learningJourney} data-testid="companion-learning" data-step={justSaved?'done':'recall'}>
  <aside className={styles.learningContext}><CompanionFolioArt kind={justSaved?'quest':'study'}/><h4>{target.title}</h4><div className="text-label text-[color:var(--color-text-secondary)]"><span>{g(`kind.${entry.reflection??'uncertain'}`)}</span><br/><time dateTime={date?.iso}>{t('recordedOn',{date:date?.text??t('dateUnavailable')})}</time></div><p>{t('recallBoundary')}</p><Button className={styles.learningSourceOpener} aria-label={t('readFull')} title={t('readFull')} variant="ghost" onClick={()=>onSource(target)}><CompanionItem index={4}/><span>{t('sourceShort')}</span></Button></aside>
  <div className={styles.learningTask}><h4>{t(justSaved?'saved':'recallTitle')}</h4><div className={styles.learningQuote}><p data-companion-note-text className={canShowWhole?styles.learningNoteExcerpt:undefined}>{pages[index]}</p>{canShowWhole?<p data-companion-note-text className={styles.learningNoteFull}>{entry.note}</p>:null}</div>{pages.length>1?<div className={`${canShowWhole?styles.learningNotePager:''} shrink-0`}><CompanionPager index={index} count={pages.length} onChange={onPage} label={t('passagePages')}/></div>:null}{!currentTarget?<p>{t('currentUnavailable')}</p>:null}<div className={styles.learningActions}><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!currentTarget} title={t('reexploreHint')} onClick={onExplore}>{t('reexplore')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={onChoose}>{t('another')}</Button></div></div>
 </section>;
}
