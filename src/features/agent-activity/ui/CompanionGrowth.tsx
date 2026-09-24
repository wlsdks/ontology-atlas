'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {ChevronDown,ChevronLeft,ChevronRight,ChevronUp,HelpCircle,Shield,X} from 'lucide-react';
import {useRouter} from '@/i18n/navigation';
import type {VaultDoc,VaultManifest} from '@/entities/docs-vault';
import {Button,IconButton,RowButton,Surface} from '@/shared/ui';
import {SegmentedControl} from '@/shared/ui/segmented-control';
import {ICON_SIZE} from '@/shared/ui/icon-size';
import {growthProgress,type CompanionGrowth as Growth,type GrowthEntry,type GrowthTarget,type ReflectionKind} from '../model/companion-growth';
import {availableSkillPoints,expeditionAreas,currentSpecies,isBoss,maxHp,monsterKind,monsterMaxHp,waveMultiplier} from '../model/companion-game';
import {constructionXp,EMPTY_CONSTRUCTION,observeConstruction} from '../model/companion-construction';
import {CompanionProjectBook} from './CompanionProjectBook';
import {useCompanionGame} from '../model/use-companion-game';
import type {WorldInteraction} from '../model/companion-world';
import {availableBlessings,runFloor} from '../model/companion-run';
import {CompanionBlessings} from './CompanionBlessings';
import {localName} from '../model/companion-catalog';
import {CompanionBestiary} from './CompanionBestiary';
import {CompanionMap} from './CompanionMap';
import {CompanionWorld,type CompanionWorldHandle} from './CompanionWorld';
import {CompanionInventory,CompanionSkills} from './CompanionInventory';
import {CompanionStudy,type GrowthDraft} from './CompanionStudy';
import {CompanionMemories,type MemoryDraft} from './CompanionMemories';
import {CompanionItem} from './CompanionItem';
import {CompanionSprite} from './CompanionSprite';
import styles from './companion-immersive.module.css';
type Overlay='bestiary'|'blessings'|'inventory'|'skills'|'map'|'study'|'journal'|'help';
type Props={growth:Growth;targets:GrowthTarget[];docs:readonly VaultDoc[];manifest:VaultManifest|null;active:boolean;projectKey:string|null;projectName:string;available:boolean;unreadable:boolean;failed:boolean;record:(entry:GrowthEntry)=>boolean;reset:()=>boolean;revise:(uid:string,note:string,reflection:ReflectionKind)=>boolean;close:()=>void;openFolder:()=>void;draft:GrowthDraft;onDraft:(draft:GrowthDraft)=>void;memoryDraft:MemoryDraft;onMemoryDraft:(draft:MemoryDraft)=>void};
const KEY_OVERLAYS:Record<string,Overlay>={KeyI:'inventory',KeyK:'skills',KeyM:'map',KeyJ:'journal',KeyB:'blessings',KeyN:'bestiary'};
const interactive=(target:EventTarget|null)=>target instanceof HTMLElement&&Boolean(target.closest('button,a,[role="button"],[role="radio"],[role="checkbox"]'));
const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||Boolean(target.closest('input,textarea,select,[contenteditable="true"]')));
export function CompanionGrowth({growth,targets,docs,manifest,active,projectKey,projectName,available,unreadable,failed,record,reset,revise,close,openFolder,draft,onDraft,memoryDraft,onMemoryDraft}:Props){
 const a=useTranslations('companion.adventure');const t=useTranslations('companion.world');const run=useTranslations('companion.run');const g=useTranslations('companion.growth');const battle=useTranslations('companion.game');const locale=useLocale();const router=useRouter();
 const knowledge=growthProgress(growth);const construction=useMemo(()=>manifest?observeConstruction(manifest):EMPTY_CONSTRUCTION,[manifest]);const areas=useMemo(()=>expeditionAreas(docs,locale),[docs,locale]);const adventure=useCompanionGame(projectKey,knowledge.xp,active,areas.map(area=>area.uid).join('|'),construction);const game=adventure.game;const progress=growthProgress(growth,game.xp+constructionXp(game.construction));
 const [near,setNear]=useState<WorldInteraction|null>(null);const [overlay,setOverlay]=useState<Overlay|null>(null);const [journal,setJournal]=useState<'project'|'knowledge'|'personal'>('project');const [confirm,setConfirm]=useState<'study'|'adventure'|null>(null);
 const world=useRef<CompanionWorldHandle>(null);const panel=useRef<HTMLElement>(null);const cancel=useRef<HTMLButtonElement>(null);const studyReset=useRef<HTMLButtonElement>(null);const adventureReset=useRef<HTMLButtonElement>(null);const restoreReset=useRef<'study'|'adventure'|null>(null);
 const mountedPanel=useCallback((node:HTMLElement|null)=>{panel.current=node;if(!node)return;const focusReady=()=>{if(!node.inert&&node.dataset.surfaceState==='entered'&&!node.contains(document.activeElement))node.focus({preventScroll:true});};const observer=new MutationObserver(focusReady);observer.observe(node,{attributes:true,attributeFilter:['inert','data-surface-state']});focusReady();return()=>{observer.disconnect();if(panel.current===node)panel.current=null;};},[]);
 useEffect(()=>{world.current?.focus();},[]);
 useEffect(()=>{if(!overlay)return;const frame=requestAnimationFrame(()=>{const node=panel.current;if(node&&!node.contains(document.activeElement))node.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[overlay]);
 useEffect(()=>{if(confirm)cancel.current?.focus();else if(restoreReset.current){(restoreReset.current==='study'?studyReset:adventureReset).current?.focus();restoreReset.current=null;}},[confirm]);
 const cancelReset=()=>{restoreReset.current=confirm;setConfirm(null);};
 const openStudy=()=>{
  const target=(draft.note.trim()?targets.find(item=>item.uid===draft.selectedUid):null)??targets.find(item=>!growth.entries.some(entry=>entry.kind==='explored'&&entry.target.uid===item.uid))??targets[0];
  if(target){if(!draft.note.trim())onDraft({...draft,selectedUid:target.uid});record({kind:'explored',target,at:Date.now()});}setOverlay('study');
 };
 const openOverlay=(next:Overlay)=>{setConfirm(null);if(next==='study'){openStudy();return;}setOverlay(current=>current===next?null:next);};
 const dismiss=()=>{setConfirm(null);setOverlay(null);world.current?.focus();};
 const interact=(kind:WorldInteraction)=>{if(kind==='study')openStudy();else if(kind==='rest')world.current?.rest();else if(kind==='expedition')openOverlay('map');else if(kind==='growth'){setJournal('project');setOverlay('journal');}else openOverlay(kind);};
 const onKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.key==='Escape'&&overlay){event.preventDefault();event.stopPropagation();if(confirm)cancelReset();else dismiss();return;}
  if(event.metaKey||event.ctrlKey||event.altKey||event.nativeEvent.isComposing||editable(event.target))return;
  const menu=KEY_OVERLAYS[event.code];
  if(menu){event.preventDefault();event.stopPropagation();if(!event.repeat)openOverlay(menu);return;}
  if(event.code==='Slash'&&event.shiftKey){event.preventDefault();event.stopPropagation();if(!event.repeat)openOverlay('help');return;}
  if(overlay)return;
  if(event.code==='KeyE'){event.preventDefault();event.stopPropagation();if(!event.repeat)world.current?.interact();return;}
  if(event.code==='Space'&&game.mode==='expedition'&&!interactive(event.target)){event.preventDefault();event.stopPropagation();if(!event.repeat)adventure.act({type:'dodge'});return;}
  if(event.code==='KeyQ'&&game.mode==='expedition'){event.preventDefault();event.stopPropagation();if(!event.repeat)adventure.act({type:'skill'});return;}
  if(event.code==='Digit1'){event.preventDefault();event.stopPropagation();if(!event.repeat)adventure.act({type:'heal'});return;}
  if(event.code==='KeyR'&&game.mode==='camp'){event.preventDefault();event.stopPropagation();if(!event.repeat)world.current?.rest();return;}
  if(world.current?.key(event.code,true)){event.preventDefault();event.stopPropagation();}
 };
 const openTarget=(target:GrowthTarget)=>{close();router.push(`/topology?p=${encodeURIComponent(target.slug)}&mode=focus`);};
 const blocked=unreadable||adventure.unreadable||adventure.failed;const controls=[{key:'I',panel:'inventory' as const,item:6},{key:'K',panel:'skills' as const,item:5},{key:'M',panel:'map' as const,item:7},{key:'J',panel:'journal' as const,item:4}];
 const area=areas.find(item=>item.uid===game.area);const species=currentSpecies(game);
 return <div className={styles.gameRoot} data-testid="companion-growth" data-mode={game.mode} data-panel-open={overlay!==null} data-wins={game.wins} data-gold={game.gold} onKeyDownCapture={onKeyDown} onKeyUpCapture={event=>{if(world.current?.key(event.code,false)){event.preventDefault();event.stopPropagation();}}} onWheel={event=>event.stopPropagation()}>
  <CompanionWorld ref={world} game={game} construction={game.construction} active={active} blocked={Boolean(overlay)} onInteract={interact} onNear={setNear} onStrike={()=>adventure.act({type:'skill'})}/>
  <div className={styles.hud}>
   <div className={`${styles.hudPlate} ${styles.heroHud}`}><CompanionSprite pose="idle"/><div className={styles.hudFacts}><p className={styles.hudName} data-testid="companion-level">Lv.{progress.level} · {projectName||t('traveler')}</p><span className="text-caption">HP {game.hp}/{maxHp(game)}</span><progress className={styles.hudBar} value={game.hp} max={maxHp(game)} aria-label={battle('heroHealth')}/><span className="text-caption" data-testid="companion-xp">{progress.xp} XP · {game.gold} G</span><progress className={styles.hudBar} value={progress.earned} max={progress.needed} aria-label={g('progressLabel')}/></div></div>
   <div className={styles.rightHud}><div data-battle={game.mode==='expedition'} className={styles.hudPlate}><p className={styles.hudName}>{game.mode==='camp'?t('camp'):area?.title??t('field')}</p>{game.mode==='expedition'?<><span className="text-caption">{game.phase==='attack'?run('incoming'):run('floor',{floor:runFloor(game.encounter),room:game.encounter%3+1})} · {isBoss(game)?battle('bossPrefix'):''}{species?localName(species.name,locale):battle(`monster.${monsterKind(game)}`)}</span>{species?<span className="text-caption" title={a(`trait.${species.trait}`)}>{a(`traitName.${species.trait}`)}</span>:null}<progress className={styles.hudBar} value={game.enemyHp} max={monsterMaxHp(game)} aria-label={battle('enemyHealth')}/></>:<span className="text-caption">{t('knowledge',{xp:constructionXp(game.construction)})}</span>}</div><IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('help')} onClick={()=>openOverlay('help')}><HelpCircle size={ICON_SIZE.sm}/></IconButton><IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('exit')} onClick={close}><X size={ICON_SIZE.sm}/></IconButton></div>
  </div>
  {!overlay&&game.run.lastOutcome!=='none'?<p role="status" className={styles.runOutcome} data-testid="companion-run-outcome" data-outcome={game.run.lastOutcome}>{run(game.run.lastOutcome==='clear'?'cleared':'defeated')}</p>:null}
  {!overlay&&game.mode==='expedition'?<p className={styles.bottomHint}>{availableBlessings(game.run,game.encounter)>0?run('available'):run('progress',{run:game.run.number,clears:game.run.clears})}</p>:null}
  {game.mode==='expedition'&&!overlay?<div className={styles.actionBar}><Button className="atlas-touch-floor atlas-touch-floor-wide" size="sm" variant="outline" aria-label={run('dodge')} title={run('dodgeHint')} disabled={blocked||game.dodgeCooldown>0||game.phase==='rest'||game.phase==='loot'} onClick={()=>adventure.act({type:'dodge'})}><Shield size={ICON_SIZE.sm}/><kbd>Space</kbd></Button><Button className="atlas-touch-floor atlas-touch-floor-wide" size="sm" variant="primary" aria-label={run('waveLabel',{multiplier:waveMultiplier(game)})} title={run('waveHint',{multiplier:waveMultiplier(game),cooldown:Math.max(2,8-game.run.boons.haste)})} disabled={blocked||game.cooldown>0||game.phase==='rest'||game.phase==='loot'} onClick={()=>adventure.act({type:'skill'})}><kbd>Q</kbd> ×{waveMultiplier(game)}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" size="sm" variant="outline" disabled={blocked||game.potions<1||game.hp===maxHp(game)} onClick={()=>adventure.act({type:'heal'})}><kbd>1</kbd> {t('potion',{count:game.potions})}</Button></div>:null}
  {!overlay?<div className={styles.directionPad} aria-label={t('movement')}>{[{key:'ArrowUp',Icon:ChevronUp},{key:'ArrowLeft',Icon:ChevronLeft},{key:'ArrowDown',Icon:ChevronDown},{key:'ArrowRight',Icon:ChevronRight}].map(({key,Icon})=><IconButton key={key} className="atlas-touch-floor atlas-touch-floor-wide" label={t(`move.${key}`)} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);world.current?.key(key,true);}} onPointerUp={()=>world.current?.key(key,false)} onPointerCancel={()=>world.current?.key(key,false)}><Icon size={ICON_SIZE.sm}/></IconButton>)}</div>:null}
  <nav className={styles.hotbar} aria-label={t('actions')}>
   <RowButton className={styles.hotkey} active={overlay==='blessings'} disabled={!overlay&&game.mode==='camp'&&!near} aria-label={overlay?t('closePanel'):game.mode==='expedition'?run('open'):near?t(`spot.${near}`):t('interact')} onClick={()=>{if(overlay)dismiss();else if(game.mode==='expedition')openOverlay('blessings');else world.current?.interact();}}><span className={styles.slotPlate} aria-hidden="true"><kbd>{overlay?'Esc':game.mode==='expedition'?'B':'E'}</kbd><CompanionItem index={game.mode==='expedition'?8:2}/><span className={styles.slotLabel}>{overlay?t('shortcut.back'):game.mode==='expedition'?t('shortcut.blessings'):near?t(`target.${near}`):t('shortcut.interact')}</span>{game.mode==='expedition'&&availableBlessings(game.run,game.encounter)>0?<span className={styles.slotSignal}>+</span>:null}</span></RowButton>
   {controls.map(({key,panel:next,item})=><RowButton key={key} className={styles.hotkey} active={overlay===next} aria-pressed={overlay===next} aria-label={`${t(`panel.${next}`)} (${key})`} onClick={()=>openOverlay(next)}><span className={styles.slotPlate} aria-hidden="true"><kbd>{key}</kbd><CompanionItem index={item}/><span className={styles.slotLabel}>{t(`shortcut.${next}`)}</span>{next==='skills'&&availableSkillPoints(game)>0?<span className={styles.slotSignal}>+</span>:null}</span></RowButton>)}
  </nav>
  <Surface open={overlay!==null} motion="overlay" as="section" role="region" tabIndex={-1} ref={mountedPanel} aria-label={overlay?t(`panel.${overlay}`):t('panel.journal')} className={styles.overlayPanel} data-panel={overlay} data-testid="companion-overlay" onExited={()=>world.current?.focus()}>
   <div className={styles.overlayHeader}><h3>{overlay?t(`panel.${overlay}`):''}</h3><IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('closePanel')} onClick={dismiss}><X size={ICON_SIZE.sm}/></IconButton></div>
   <div className={styles.overlayBody} data-testid="companion-content">
    {confirm?<div className="flex h-full flex-col justify-center gap-3"><p className="text-body">{g(confirm==='study'?'resetPrompt':'resetGamePrompt')}</p><div className="flex gap-2"><Button ref={cancel} className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={cancelReset}>{g('cancel')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>{if(confirm==='adventure'?adventure.reset():reset()){restoreReset.current=confirm;setConfirm(null);onDraft({selectedUid:null,note:'',reflection:'learned'});}}}>{g('resetConfirm')}</Button></div></div>:<>
     {overlay==='blessings'?<CompanionBlessings game={game} disabled={blocked} act={action=>{const ok=adventure.act(action);if(ok)dismiss();return ok;}}/>:null}
     {overlay==='bestiary'?<CompanionBestiary game={game}/>:null}
     {overlay==='inventory'?<CompanionInventory game={game} act={adventure.act} disabled={blocked} cards={targets.length} onStudy={openStudy} onBestiary={()=>setOverlay('bestiary')}/>:null}
     {overlay==='skills'?<CompanionSkills game={game} act={adventure.act} disabled={blocked}/>:null}
     {overlay==='map'?<div className="flex h-full min-h-0 flex-col gap-2"><CompanionMap game={game} areas={areas} disabled={blocked||!available} act={action=>{const ok=adventure.act(action);if(ok&&action.type==='depart')dismiss();return ok;}}/>{game.mode==='expedition'?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={()=>{adventure.act({type:'return'});dismiss();}}>{battle('return')}</Button>:!available?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={openFolder}>{g('openFolder')}</Button>:game.knowledge<5?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={openStudy}>{g('startStudy')}</Button>:null}</div>:null}
     {overlay==='study'||(overlay==='journal'&&journal==='knowledge')?<div className="flex h-full min-h-0 flex-col gap-2">{overlay==='journal'?<SegmentedControl ariaLabel={t('journalSections')} value={journal} onChange={setJournal} options={[{value:'project',label:t('projectBook')},{value:'knowledge',label:t('knowledgeBook')},{value:'personal',label:t('personalBook')}]}/>:null}{available?<CompanionStudy growth={growth} targets={targets} docs={docs} draft={draft} onDraft={onDraft} record={record} revise={revise} openTarget={openTarget} disabled={unreadable}/>:<div className="grid gap-3"><p>{g('startBody')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" onClick={openFolder}>{g('openFolder')}</Button></div>}</div>:null}
     {overlay==='journal'&&journal==='project'?<div className="flex h-full min-h-0 flex-col gap-2"><SegmentedControl ariaLabel={t('journalSections')} value={journal} onChange={setJournal} options={[{value:'project',label:t('projectBook')},{value:'knowledge',label:t('knowledgeBook')},{value:'personal',label:t('personalBook')}]}/><CompanionProjectBook counts={game.construction} current={construction} study={knowledge.xp} adventure={game.xp}/></div>:null}
     {overlay==='journal'&&journal==='personal'?<div className="flex h-full min-h-0 flex-col gap-2"><SegmentedControl ariaLabel={t('journalSections')} value={journal} onChange={setJournal} options={[{value:'project',label:t('projectBook')},{value:'knowledge',label:t('knowledgeBook')},{value:'personal',label:t('personalBook')}]}/><CompanionMemories draft={memoryDraft} onDraft={onMemoryDraft}/></div>:null}
     {overlay==='help'?<div className={styles.helpPanel}><p className="text-body">{t('controls')}</p><p className="text-label text-[color:var(--color-text-secondary)]">{g('xpBreakdown',{knowledge:game.knowledge,adventure:game.xp})}</p><p className="text-label text-[color:var(--color-text-secondary)]">{g('meaning')}</p><p className="text-label text-[color:var(--color-text-secondary)]">{g('storage')}</p><div className="mt-auto flex flex-wrap gap-2"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" ref={studyReset} disabled={!available} onClick={()=>setConfirm('study')}>{g('reset')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" ref={adventureReset} disabled={!available} onClick={()=>setConfirm('adventure')}>{g('resetGame')}</Button></div></div>:null}
    </>}
   </div>
  </Surface>
  {failed||unreadable||adventure.failed||adventure.unreadable?<p role="alert" className={styles.notice}>{g(failed?'failed':unreadable?'unreadable':'gameUnavailable')}</p>:adventure.arrival&&adventure.arrival.wins>0?<div className={styles.notice}><p>{g('offline',adventure.arrival)}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={()=>{adventure.dismissArrival();world.current?.focus();}}>{g('continue')}</Button></div>:adventure.constructionReward>0?<div className={styles.notice} role="status"><p>{t('projectReward',{xp:adventure.constructionReward})}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={()=>{adventure.dismissConstruction();world.current?.focus();}}>{g('continue')}</Button></div>:null}
 </div>;
}
