'use client';
import {useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {RowButton} from '@/shared/ui';
import {SPECIES,REGIONS,localName} from '../model/companion-catalog';
import type {CompanionGame} from '../model/companion-game';
import {CompanionCreature} from './CompanionCreature';
import {CompanionPager} from './CompanionPager';
import styles from './companion-immersive.module.css';
export function CompanionBestiary({game}:{game:CompanionGame}){
 const t=useTranslations('companion.adventure');const locale=useLocale();const [index,setIndex]=useState(0);const page=Math.floor(index/9);const species=SPECIES[index];const count=game.discoveries[species.id];const region=REGIONS.find(region=>region.id===species.region)!;
 return <div className={styles.bestiaryLayout}>
  <div className={styles.bestiaryList}><p className="text-label">{t('discovered',{count:Object.keys(game.discoveries).length,total:SPECIES.length})} · {localName(region.name,locale)}</p><div className={styles.bestiaryGrid}>{SPECIES.slice(page*9,page*9+9).map((entry,i)=><RowButton key={entry.id} active={index===page*9+i} aria-pressed={index===page*9+i} aria-label={game.discoveries[entry.id]===undefined?t('unknownNumber',{number:page*9+i+1}):localName(entry.name,locale)} onClick={()=>setIndex(page*9+i)} className={styles.bestiarySlot}><CompanionCreature species={entry} hidden={game.discoveries[entry.id]===undefined}/><span className={styles.creatureNumber}>{String(page*9+i+1).padStart(3,'0')}</span></RowButton>)}</div><CompanionPager index={page} count={12} onChange={value=>setIndex(value*9)} label={t('bestiary')}/></div>
  <div className={styles.creatureDetail}><CompanionCreature species={species} large hidden={count===undefined}/><h4 className="text-body font-[var(--font-weight-strong)]">{count===undefined?t('unknown'):localName(species.name,locale)}</h4><p className="text-label">{count===undefined?t('findIn',{region:localName(region.name,locale)}):t('defeated',{count})}</p>{count!==undefined?<p className="text-label text-[color:var(--color-text-secondary)]">{t(`trait.${species.trait}`)}</p>:null}<p className="text-caption text-[color:var(--color-text-secondary)]">{t('fiction')}</p></div>
 </div>;
}
