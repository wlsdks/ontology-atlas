'use client';
import {useTranslations} from 'next-intl';
import {RowButton} from '@/shared/ui';
import {BLESSINGS,availableBlessings,blessingChoices,runFloor,type Blessing} from '../model/companion-run';
import type {CompanionGame,GameAction} from '../model/companion-game';
import {CompanionItem} from './CompanionItem';
import styles from './companion-immersive.module.css';
const ICONS:Record<Blessing,number>={ember:0,ward:1,leech:3,echo:7,fortune:6,insight:2,haste:8,thorns:5};
export function CompanionBlessings({game,act,disabled}:{game:CompanionGame;act:(action:GameAction)=>boolean;disabled:boolean}){
 const t=useTranslations('companion.run');const choices=game.mode==='expedition'?blessingChoices(game.run,game.encounter):[];
 return <section className={styles.blessingPanel} aria-label={t('title')}>
  <p className="text-label">{t('floor',{floor:runFloor(game.encounter),room:game.encounter%3+1})} · {t('chosen',{count:game.run.drafted})}</p>
  <p className="text-label text-[color:var(--color-text-secondary)]">{choices.length?t('chooseHint',{count:availableBlessings(game.run,game.encounter)}):t(game.mode==='camp'?'campHint':'nextHint')}</p>
  {choices.length?<div className={styles.blessingChoices}>{choices.map(boon=><RowButton key={boon} aria-label={`${t('take',{name:t(`name.${boon}`)})}. ${t(`effect.${boon}`)}`} className={styles.blessingChoice} disabled={disabled} onClick={()=>act({type:'blessing',blessing:boon,run:game.run.number})}><span className={styles.blessingCard}><CompanionItem index={ICONS[boon]}/><span className="text-body font-[var(--font-weight-strong)]">{t(`name.${boon}`)}</span><span className="text-label">{t(`effect.${boon}`)}</span><span className="text-caption">{t('rank',{rank:game.run.boons[boon]+1})}</span></span></RowButton>)}</div>:<div className={styles.runCollection}>{BLESSINGS.filter(boon=>game.run.boons[boon]>0).map(boon=><div key={boon}><CompanionItem index={ICONS[boon]}/><span>{t(`name.${boon}`)} ×{game.run.boons[boon]}</span></div>)}</div>}
  <p className="text-caption text-[color:var(--color-text-secondary)]">{t('temporary')}</p>
 </section>;
}
