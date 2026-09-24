'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Lock,MapPin} from 'lucide-react';
import {Button,RowButton} from '@/shared/ui';
import {ICON_SIZE} from '@/shared/ui/icon-size';
import {withBasePath} from '@/shared/lib/base-path';
import {attackPower,type CompanionGame,type ExpeditionArea,type GameAction} from '../model/companion-game';
import {CompanionPager} from './CompanionPager';
import styles from './companion-immersive.module.css';
export function CompanionMap({game,areas,disabled,act}:{game:CompanionGame;areas:ExpeditionArea[];disabled:boolean;act:(action:GameAction)=>boolean}){
 const t=useTranslations('companion.game');const r=useTranslations('companion.run');const [index,setIndex]=useState(0);const selected=areas[Math.min(index,areas.length-1)];const page=Math.floor(index/6);
 return <section className={styles.regionMap} aria-label={t('journey')}>
  <div className={styles.regionChart} style={{backgroundImage:`url(${withBasePath('/brand/companion-expedition.webp')})`}}>
   {areas.slice(page*6,page*6+6).map((area,i)=><div key={area.uid} className={styles.regionPoint}><RowButton active={area.uid===selected?.uid} aria-pressed={area.uid===selected?.uid} aria-label={area.title} onClick={()=>setIndex(page*6+i)}><span className={styles.regionMarker}>{game.knowledge<area.requiredKnowledge?<Lock size={ICON_SIZE.md}/>:<MapPin size={ICON_SIZE.md}/>}<span>{page*6+i+1}</span></span></RowButton><span className="max-w-full truncate text-label">{area.title}</span></div>)}
  </div>
  <div className={styles.regionDetails}>{selected?<><h4 className="truncate text-title font-[var(--font-weight-strong)]">{selected.title}</h4><p className="text-label">{game.knowledge<selected.requiredKnowledge?t('locked',{xp:selected.requiredKnowledge,current:game.knowledge,remaining:selected.requiredKnowledge-game.knowledge}):t('departHint',{difficulty:selected.difficulty+1})}</p><p className="text-label text-[color:var(--color-text-secondary)]">{t('power',{attack:attackPower(game)})} · {t('wins',{count:game.wins})}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={disabled||game.knowledge<selected.requiredKnowledge} onClick={()=>act({type:'depart',area:selected})}>{t('depart')}</Button></>:<p>{t('noAreas')}</p>}
  <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" aria-pressed={game.run.repeat} onClick={()=>act({type:'repeat',enabled:!game.run.repeat})}>{r(game.run.repeat?'repeatOn':'repeatOff')}</Button><p className="text-caption text-[color:var(--color-text-secondary)]">{r('record',{best:game.run.bestFloor,clears:game.run.clears})}</p>
  {areas.length>6?<CompanionPager index={page} count={Math.ceil(areas.length/6)} onChange={value=>setIndex(value*6)} label={t('areas')}/>:null}</div>
 </section>;
}
