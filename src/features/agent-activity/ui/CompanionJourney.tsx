'use client';
import {useLocale,useTranslations} from 'next-intl';
import {RowButton} from '@/shared/ui';
import {useRovingRadioGroup} from '@/shared/lib/use-roving-radio-group';
import {withBasePath} from '@/shared/lib/base-path';
import {adventureMap,localName,mapBackground} from '../model/companion-catalog';
import {activePath,type CompanionGame,type GameAction} from '../model/companion-game';
import {runFloor} from '../model/companion-run';
import {PATH_EFFECTS,RUN_PATHS} from '../model/companion-paths';
import {CompanionItem} from './CompanionItem';
import styles from './companion-immersive.module.css';

export function CompanionJourney({game,disabled,act}:{game:CompanionGame;disabled:boolean;act:(action:GameAction)=>boolean}){
 const t=useTranslations('companion.journey');const locale=useLocale();const floor=runFloor(game.encounter);const map=adventureMap(game.area);const image=map?mapBackground(map):null;const current=activePath(game);
 const radio=useRovingRadioGroup({value:game.run.plan,values:RUN_PATHS,busy:disabled,onChange:path=>{act({type:'plan-path',path,run:game.run.number,floor});}});
 return <section className={styles.journeyView} aria-label={t('title')} data-testid="companion-journey">
  <div className={styles.journeyOverview} style={image?{backgroundImage:`linear-gradient(var(--overlay-scrim),var(--overlay-scrim)),url(${withBasePath(image.file)})`,backgroundPosition:`center,${image.position}`}:undefined}>
   <div className={styles.journeyHeading}><p className="text-caption">{t('run',{number:game.run.number})}</p><h4 className="text-body font-[var(--font-weight-strong)]">{map?localName(map.name,locale):t('title')}</h4></div>
   <ol className={styles.journeyTrail} aria-label={t('floors')}>{Array.from({length:5},(_,i)=>{const level=i+1;const step=game.run.paths.find(path=>path.floor===level);return <li key={level} data-current={floor===level} data-done={floor>level} aria-current={floor===level?'step':undefined}><span className={styles.floorSeal}>{level}</span><span className={styles.floorWords}><strong className="font-[var(--font-weight-strong)]">{t('floor',{floor:level})}</strong><span>{level===1?t('entrance'):step?t(`name.${step.kind}`):level>floor?t('unreached'):t('legacy')}</span></span>{step?<CompanionItem index={PATH_EFFECTS[step.kind].icon}/>:null}</li>;})}</ol>
   <p className={styles.currentPath} data-testid="companion-current-path">{current?t('current',{path:t(`name.${current.kind}`)}):t('standard')}{current?.healed?` · ${t('restored',{hp:current.healed})}`:''}</p>
  </div>
  <div className={styles.journeyPlanning}><div><h4 className="text-body font-[var(--font-weight-strong)]">{t('choose')}</h4><p className="text-label" role="status" data-testid="companion-path-timing">{floor<5?t('applies',{floor:floor+1,path:t(`name.${game.run.plan}`)}):t('nextRun',{path:t(`name.${game.run.plan}`)})}</p></div>
   <div {...radio.groupProps} className={styles.pathChoices} aria-label={t('choose')}>{RUN_PATHS.map((path,index)=>{const effect=PATH_EFFECTS[path];return <RowButton key={path} {...radio.itemProps(index)} active={game.run.plan===path} className={styles.pathChoice} aria-describedby={`companion-path-${path}-effect`}><CompanionItem index={effect.icon}/><span className={styles.pathWords}><strong className="font-[var(--font-weight-strong)]">{t(`name.${path}`)}</strong><span id={`companion-path-${path}-effect`}>{t(`effect.${path}`,{hp:Math.round(effect.heal*100),health:Math.round((effect.health-1)*100),damage:Math.round((effect.damage-1)*100),gold:Math.abs(effect.gold),xp:effect.xp})}</span></span><span className={styles.pathSelected} aria-hidden="true">{game.run.plan===path?'◆':'◇'}</span></RowButton>;})}</div>
   <p className={styles.pathPersistence}>{t('persists')}</p>
  </div>
 </section>;
}

export function CompanionJourneyProgress({game,onOpen}:{game:CompanionGame;onOpen:()=>void}){
 const t=useTranslations('companion.journey');const floor=runFloor(game.encounter);
 return <RowButton className={styles.journeyProgress} onClick={onOpen} aria-label={t('open',{floor})} data-testid="companion-journey-progress"><span aria-hidden="true" className={styles.progressSteps}>{Array.from({length:5},(_,i)=><span key={i} data-current={i+1===floor} data-done={i+1<floor}>{i+1}</span>)}</span><span className={styles.progressCaption}>{t('progress',{floor})} <kbd>M</kbd></span></RowButton>;
}
