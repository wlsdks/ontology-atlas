'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/shared/ui';
import {attackPower,maxHp,upgradeCost,waveMultiplier,type CompanionGame,type GameAction,type Upgrade} from '../model/companion-game';
import {equipmentTier,forgeRelicCost} from '../model/companion-forge';
import {forgeLimit,questCount} from '../model/companion-quests';
import {CompanionItem} from './CompanionItem';
import {CompanionConfirmation} from './CompanionConfirmation';
import styles from './companion-immersive.module.css';
export function CompanionForge({game,kind,disabled,act,onQuests}:{game:CompanionGame;kind:Upgrade;disabled:boolean;act:(action:GameAction)=>boolean;onQuests:()=>void}){
 const t=useTranslations('companion.forge');const i=useTranslations('companion.inventory');const level=game.upgrades[kind];const tier=equipmentTier(level);const cap=forgeLimit(game.questClaims);const relics=forgeRelicCost(level);const gold=upgradeCost(game,kind);const [flash,setFlash]=useState(0);
 const next={...game,upgrades:{...game.upgrades,[kind]:Math.min(20,level+1)}};const stat=(value:CompanionGame)=>kind==='sword'?attackPower(value):kind==='armor'?maxHp(value):value.upgrades.library;const gated=level>=cap&&level<20;
 return <section className={styles.forge} aria-label={t('title')} data-testid="companion-forge" data-gated={gated}>
  <div className={styles.forgeRank} data-tier={tier}><span>{t(`rank.${tier}`)}</span>{flash?<CompanionConfirmation key={flash}>{t('success',{level})}</CompanionConfirmation>:null}<span>{t('level',{level})}</span></div>
  <p className="text-label">{t(`preview.${kind}`,{before:stat(game),after:stat(next)})}</p><p className="text-caption">{t(`milestone.${kind}`,{bonus:tier*(kind==='sword'?2:kind==='armor'?5:.25)})}</p>{kind==='library'&&equipmentTier(level+1)>tier&&level<20?<p className="text-caption">{t('waveTier',{before:waveMultiplier(game),after:waveMultiplier(next)})}</p>:null}
  {gated?<><p className="text-caption">{relics?t('cost',{gold,relics}):i('upgrade',{gold})}</p><p className="text-label">{t('gate',{cap,count:questCount(game.questClaims),needed:level<10?2:level<15?4:6})}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={onQuests}>{t('quests')}</Button></>:<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={disabled||level>=20||game.gold<gold||game.relics<relics} onClick={()=>{if(act({type:'upgrade',kind}))setFlash(value=>value+1);else setFlash(0);}}>{level>=20?t('max'):relics?t('cost',{gold,relics}):i('upgrade',{gold})}</Button>}
  {relics>0&&level<20?<p className="text-caption">{t('materials',{count:game.relics,needed:relics})}</p>:null}
  <p className="text-caption text-[color:var(--color-text-secondary)]">{t('guarantee')}</p>
  {flash?<><div key={flash} className={styles.forgeSuccess} aria-hidden="true" onAnimationEnd={()=>setFlash(0)}><CompanionItem index={kind==='sword'?0:kind==='armor'?1:2}/><span>{t('success',{level})}</span><span className={styles.forgeRays} aria-hidden="true">✦</span></div></>:null}
 </section>;
}
