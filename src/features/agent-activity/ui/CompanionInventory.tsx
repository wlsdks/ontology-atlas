'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button,RowButton} from '@/shared/ui';
import {maxHp,availableSkillPoints,COMPANION_SKILLS,type CompanionGame,type GameAction,type Upgrade,type CompanionSkill} from '../model/companion-game';
import {CompanionForge} from './CompanionForge';
import {questCount} from '../model/companion-quests';
import {CompanionItem} from './CompanionItem';
import {CompanionFolioArt} from './CompanionFolioArt';
import styles from './companion-immersive.module.css';
type Props={game:CompanionGame;act:(action:GameAction)=>boolean;disabled:boolean;cards:number;onStudy:()=>void;onBestiary:()=>void;onQuests:()=>void};
const ITEMS=[{id:'sword',icon:0},{id:'armor',icon:1},{id:'library',icon:2},{id:'potion',icon:3},{id:'cards',icon:4},{id:'relic',icon:5},{id:'bestiary',icon:8},{id:'quests',icon:4}] as const;
export function CompanionInventory({game,act,disabled,cards,onStudy,onBestiary,onQuests}:Props){
 const t=useTranslations('companion.inventory');const [selected,setSelected]=useState(0);const item=ITEMS[selected];const gear=['sword','armor','library'].includes(item.id)?item.id as Upgrade:null;
 const count=(id:string)=>id==='potion'?game.potions:id==='cards'?cards:id==='relic'?game.relics:id==='bestiary'?Object.keys(game.discoveries).length:id==='quests'?questCount(game.questClaims):1;
 return <div className={styles.inventoryLayout}>
  <div><p className={styles.panelEyebrow}>{t('bag')} · {game.gold} G</p><div className={styles.inventoryGrid} aria-label={t('items')}>
   {Array.from({length:12},(_,i)=>{const slot=ITEMS[i];return slot?<RowButton key={slot.id} active={selected===i} aria-pressed={selected===i} aria-label={`${t(`name.${slot.id}`)} · ${count(slot.id)}`} onClick={()=>setSelected(i)} className={styles.inventorySlot}><CompanionItem index={slot.icon}/><span className={styles.stackCount}>{['sword','armor','library'].includes(slot.id)?`+${game.upgrades[slot.id as Upgrade]}`:count(slot.id)}</span></RowButton>:<span key={i} className={styles.emptySlot} aria-hidden="true"/>;})}
  </div><Button className="mt-2 atlas-touch-floor atlas-touch-floor-wide" variant="outline" disabled={disabled||game.chests>=Math.floor(game.wins/5)} onClick={()=>act({type:'chest'})}>{t('chest',{count:Math.floor(game.wins/5)-game.chests})}</Button></div>
  <div className={styles.itemDetail} aria-live="polite">
   {gear?<div className={styles.gearIllustration}><CompanionFolioArt kind="forge"/><CompanionItem index={item.icon} large/></div>:<CompanionItem index={item.icon} large/>}<h4>{t(`name.${item.id}`)}{gear?` +${game.upgrades[gear]}`:''}</h4>{!gear?<p>{t(`description.${item.id}`)}</p>:null}
   {gear?<CompanionForge key={gear} game={game} kind={gear} disabled={disabled} act={act} onQuests={onQuests}/>:item.id==='potion'?<div className="flex flex-wrap gap-2"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={disabled||game.potions<1||game.hp===maxHp(game)} onClick={()=>act({type:'heal'})}>{t('use')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" disabled={disabled||game.gold<5||game.potions>=99} onClick={()=>act({type:'buy-potion'})}>{t('buy')}</Button></div>:item.id==='cards'?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={onStudy}>{t('readCards')}</Button>:item.id==='bestiary'?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={onBestiary}>{t('readBestiary')}</Button>:item.id==='quests'?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={onQuests}>{t('readQuests')}</Button>:null}
  </div>
 </div>;
}
const SKILL_ICONS:Record<CompanionSkill,number>={focus:0,ward:1,recovery:3,wave:7,fortune:6,insight:2};
export function CompanionSkills({game,act,disabled}:Pick<Props,'game'|'act'|'disabled'>){
 const t=useTranslations('companion.skills');const [selected,setSelected]=useState<CompanionSkill>('focus');const points=availableSkillPoints(game);
 return <div className={styles.skillsLayout}>
  <div><p className={styles.panelEyebrow}>{t('points',{count:points})}</p><div className={styles.skillTree} aria-label={t('tree')}>
   {COMPANION_SKILLS.map(skill=><RowButton key={skill} active={selected===skill} aria-pressed={selected===skill} onClick={()=>setSelected(skill)} aria-label={`${t(`name.${skill}`)} ${game.skills[skill]}/5`} className={styles.skillNode}><CompanionItem index={SKILL_ICONS[skill]}/><span>{game.skills[skill]}/5</span></RowButton>)}
  </div></div>
  <div className={styles.itemDetail} aria-live="polite"><h4>{t(`name.${selected}`)}</h4><p>{t(`effect.${selected}`)}</p><p className={styles.panelEyebrow}>{t('rank',{rank:game.skills[selected]})}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={disabled||points<1||game.skills[selected]>=5} onClick={()=>act({type:'learn-skill',skill:selected})}>{t(game.skills[selected]>=5?'max':'learn')}</Button><p>{t('earn')}</p></div>
 </div>;
}
