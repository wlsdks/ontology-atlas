'use client';
import {useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Check,Lock} from 'lucide-react';
import {Button,RowButton} from '@/shared/ui';
import {ICON_SIZE} from '@/shared/ui/icon-size';
import {withBasePath} from '@/shared/lib/base-path';
import {type CompanionGame,type ExpeditionArea,type GameAction} from '../model/companion-game';
import {ADVENTURE_MAPS,REGIONS,adventureSpecies,localName,mapBackground} from '../model/companion-catalog';
import {CompanionCreature} from './CompanionCreature';
import {CompanionPager} from './CompanionPager';
import styles from './companion-immersive.module.css';
export function CompanionMap({game,areas,disabled,act}:{game:CompanionGame;areas:ExpeditionArea[];disabled:boolean;act:(action:GameAction)=>boolean}){
 const t=useTranslations('companion.game');const r=useTranslations('companion.run');const a=useTranslations('companion.adventure');const locale=useLocale();
 const [index,setIndex]=useState(()=>Math.max(0,ADVENTURE_MAPS.findIndex(map=>map.id===game.area)));const selected=ADVENTURE_MAPS[index];const region=REGIONS[Math.floor(index/6)];const page=region.index;const area=areas.find(area=>area.uid===selected.id)!;const guardian=adventureSpecies(selected.guardian)!;
 const locked=game.knowledge<selected.requiredKnowledge;
 return <section className={styles.adventureMap} aria-label={t('journey')} data-testid="companion-adventure-map">
  <div className={styles.regionHeading}><div><p className="text-caption text-[color:var(--color-text-secondary)]">{a('atlas',{maps:36,monsters:108})}</p><h4 className="text-body font-[var(--font-weight-strong)]">{localName(region.name,locale)}</h4></div><CompanionPager index={page} count={6} onChange={value=>setIndex(value*6)} label={a('regions')}/></div>
  <div className={styles.adventureRoutes} aria-label={t('areas')}>
   {ADVENTURE_MAPS.slice(page*6,page*6+6).map((map,i)=>{const image=mapBackground(map);return <RowButton key={map.id} active={index===page*6+i} aria-pressed={index===page*6+i} aria-label={localName(map.name,locale)} onClick={()=>setIndex(page*6+i)} className={styles.routeTile}><span className={styles.routeArt} style={{backgroundImage:`url(${withBasePath(image.file)})`,backgroundPosition:image.position}}/><span className={styles.routeTitle}><span>{i+1} · {localName(map.name,locale)}</span>{game.knowledge<map.requiredKnowledge?<Lock size={ICON_SIZE.sm}/>:game.journeys[map.id]?<Check size={ICON_SIZE.sm}/>:null}</span></RowButton>;})}
  </div>
  <div className={styles.adventurePlan} aria-live="polite">
   <div><h4 className="text-body font-[var(--font-weight-strong)]">{localName(selected.name,locale)}</h4><p className="text-label text-[color:var(--color-text-secondary)]">{a('route',{difficulty:selected.difficulty+1,clears:game.journeys[selected.id]??0})}</p></div>
   <p className="text-label" data-testid="companion-map-effect">{a(`effect.${selected.effect}`)}</p>
   <div className={styles.guardianPreview}><CompanionCreature species={guardian}/><span className="text-label">{a('guardian')}<br/><strong className="font-[var(--font-weight-strong)]">{localName(guardian.name,locale)}</strong></span></div>
   <p className="text-caption" data-testid="companion-map-lock">{locked?t('locked',{xp:selected.requiredKnowledge,current:game.knowledge,remaining:selected.requiredKnowledge-game.knowledge}):a('ready',{current:game.knowledge,required:selected.requiredKnowledge})}</p>
   <div className={styles.travelActions}><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={disabled||locked} onClick={()=>act({type:'depart',area})}>{t('depart')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" aria-pressed={game.run.repeat} onClick={()=>act({type:'repeat',enabled:!game.run.repeat})}>{r(game.run.repeat?'repeatOn':'repeatOff')}</Button></div>
  </div>
 </section>;
}
