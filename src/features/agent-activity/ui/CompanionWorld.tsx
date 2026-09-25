'use client';
import {forwardRef,useCallback,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {motion,useMotionValue,useTransform} from 'framer-motion';
import Image from 'next/image';
import {useTranslations} from 'next-intl';
import {withBasePath} from '@/shared/lib/base-path';
import {MOTION} from '@/shared/motion';
import {usePrefersReducedMotion} from '@/shared/lib/use-prefers-reduced-motion';
import {RowButton} from '@/shared/ui';
import {currentSpecies,monsterKind,isBoss,victoryReward,type CompanionGame} from '../model/companion-game';
import {moveInWorld,nearbyWorldSpot,WORLD_HEIGHT,WORLD_SPOTS,WORLD_WIDTH,WALK_SPEED,WALK_FRAME_DISTANCE,type WorldInteraction,type WorldPoint} from '../model/companion-world';
import type {ConstructionCounts} from '../model/companion-construction';
import {adventureMap,mapBackground} from '../model/companion-catalog';
import {CompanionCreature} from './CompanionCreature';
import {CompanionItem} from './CompanionItem';
import {CompanionGrowthSigil} from './CompanionGrowthSigil';
import {CompanionSprite,type CompanionPose} from './CompanionSprite';
import styles from './companion-immersive.module.css';
import spriteStyles from './companion-rpg.module.css';
const MOVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
const visible=()=>document.visibilityState==='visible';const serverVisible=()=>false;
const subscribe=(listener:()=>void)=>{document.addEventListener('visibilitychange',listener);return()=>document.removeEventListener('visibilitychange',listener);};
export type CompanionWorldHandle={focus:()=>void;key:(code:string,down:boolean)=>boolean;interact:()=>void;rest:()=>void};
type Props={game:CompanionGame;construction:ConstructionCounts;available?:boolean;active:boolean;blocked:boolean;onInteract:(kind:WorldInteraction)=>void;onStrike:()=>void;onNear:(kind:WorldInteraction|null)=>void};
export const CompanionWorld=forwardRef<CompanionWorldHandle,Props>(function CompanionWorld({game,construction,available=true,active,blocked,onInteract,onStrike,onNear},ref){
 const t=useTranslations('companion.world');const reduced=usePrefersReducedMotion();const pageVisible=useSyncExternalStore(subscribe,visible,serverVisible);
 const viewport=useRef<HTMLDivElement>(null);const callbacks=useRef({onInteract,onStrike,onNear});
 useEffect(()=>{callbacks.current={onInteract,onStrike,onNear};},[onInteract,onStrike,onNear]);
 const x=useMotionValue(game.mode==='camp'?460:380),y=useMotionValue(535),width=useMotionValue(1000),height=useMotionValue(667),zoom=useMotionValue(1);
 const markerScale=useTransform(zoom,value=>1/value);
 const cameraX=useTransform([x,zoom,width],values=>{const [px,s,w]=values as number[];const lead=game.mode==='expedition'?Math.max(-(w/2-64)/s,Math.min((w/2-64)/s,(760-px)/2)):0;return Math.min(0,Math.max(w-WORLD_WIDTH*s,w/2-(px+lead)*s));});
 const cameraY=useTransform([y,zoom,height],values=>{const [py,s,h]=values as number[];return Math.min(0,Math.max(h-WORLD_HEIGHT*s,h/2-py*s));});
 const keys=useRef(new Set<string>());const goal=useRef<{point:WorldPoint;interaction?:WorldInteraction;pose?:CompanionPose}|null>(null);
 const frame=useRef<number|null>(null);const lastInput=useRef(0);const updatePoseRef=useRef<CompanionPose>('idle');const nearRef=useRef<WorldInteraction|null>(null);const dirRef=useRef(1);
 const walkDistance=useRef(0);const walkStepRef=useRef(0);const [walkStep,setWalkStep]=useState(0);
 const [pose,setPose]=useState<CompanionPose>('idle');const [near,setNear]=useState<WorldInteraction|null>(null);const [direction,setDirection]=useState(1);
 const canMove=active&&pageVisible&&!blocked;
 const canMoveRef=useRef(canMove);useEffect(()=>{canMoveRef.current=canMove;},[canMove]);
 const setActorPose=useCallback((next:CompanionPose)=>{if(updatePoseRef.current!==next){updatePoseRef.current=next;setPose(next);}},[]);
 const setNearSpot=useCallback((next:WorldInteraction|null)=>{if(nearRef.current!==next){nearRef.current=next;setNear(next);callbacks.current.onNear(next);}},[]);
 const begin=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{const el=viewport.current;if(!el)return;const resize=()=>{if(game.mode==='expedition'&&el.clientWidth<600&&width.get()>=600)x.set(650);width.set(el.clientWidth);height.set(el.clientHeight);zoom.set(Math.max(el.clientWidth/WORLD_WIDTH,el.clientHeight/WORLD_HEIGHT));};resize();const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect();},[width,height,zoom,x,game.mode]);
 useEffect(()=>{
  const field=game.mode==='expedition';walkDistance.current=0;setNearSpot(field?null:nearbyWorldSpot({x:460,y:535}));setActorPose('idle');goal.current=null;keys.current.clear();x.set(field?(width.get()<600?650:380):460);y.set(535);
 },[game.mode,x,y,width,setNearSpot,setActorPose]);
 useEffect(()=>{
  if(!canMove){keys.current.clear();goal.current=null;setActorPose('idle');if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;return;}
  if(reduced&&goal.current?.pose){goal.current=null;setActorPose('idle');}
  let last=performance.now(),stalled=0;
  const step=(now:number)=>{
   frame.current=null;if(!canMoveRef.current)return;const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;
   const pressed=keys.current;let dx=Number(pressed.has('KeyD')||pressed.has('ArrowRight'))-Number(pressed.has('KeyA')||pressed.has('ArrowLeft'));let dy=Number(pressed.has('KeyS')||pressed.has('ArrowDown'))-Number(pressed.has('KeyW')||pressed.has('ArrowUp'));
   const point={x:x.get(),y:y.get()};const target=goal.current;
   if(!dx&&!dy&&target){dx=target.point.x-point.x;dy=target.point.y-point.y;if(Math.hypot(dx,dy)<8){goal.current=null;setActorPose(target.pose??'idle');if(target.interaction)callbacks.current.onInteract(target.interaction);dx=0;dy=0;}}
   if(dx||dy){const length=Math.hypot(dx,dy);const next=moveInWorld(point,dx/length*WALK_SPEED*dt,dy/length*WALK_SPEED*dt,game.mode==='expedition');const distance=Math.hypot(next.x-point.x,next.y-point.y);if(distance>.01){walkDistance.current+=distance;const gait=Math.floor(walkDistance.current/WALK_FRAME_DISTANCE)%8;if(gait!==walkStepRef.current){walkStepRef.current=gait;setWalkStep(gait);}x.set(next.x);y.set(next.y);stalled=0;setActorPose('walk');const face=dx<0?-1:1;if(dx!==0&&face!==dirRef.current){dirRef.current=face;setDirection(face);}}else{setActorPose('idle');stalled+=dt;if(stalled>1){goal.current=null;setActorPose('idle');}}setNearSpot(game.mode==='camp'?nearbyWorldSpot(next):null);
   }else if(updatePoseRef.current==='walk')setActorPose('idle');
   if(pressed.size||goal.current)frame.current=requestAnimationFrame(step);
  };
  begin.current=()=>{last=performance.now();stalled=0;if(frame.current===null)frame.current=requestAnimationFrame(step);};
  if(keys.current.size||goal.current)begin.current();
  const clear=()=>{keys.current.clear();goal.current=null;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;setActorPose('idle');};
  window.addEventListener('blur',clear);
  const timer=window.setInterval(()=>{if(game.mode!=='camp'||reduced||performance.now()-lastInput.current<8000||keys.current.size||goal.current)return;const cycle=Math.floor(performance.now()/14000)%3;const spot=WORLD_SPOTS[[0,1,2][cycle]];goal.current={point:spot.point,pose:cycle===0?'code':cycle===1?'read':'sleep'};begin.current();},14000);
  return()=>{window.removeEventListener('blur',clear);window.clearInterval(timer);if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;begin.current=()=>{};};
 },[canMove,game.mode,reduced,x,y,setActorPose,setNearSpot]);
 const walkTo=(spot:typeof WORLD_SPOTS[number])=>{lastInput.current=performance.now();viewport.current?.focus();if(reduced){x.set(spot.point.x);y.set(spot.point.y);setNearSpot(spot.id);callbacks.current.onInteract(spot.id);}else{goal.current={point:spot.point,interaction:spot.id};begin.current();}};
 const interact=()=>{lastInput.current=performance.now();if(game.mode==='expedition'){callbacks.current.onStrike();return;}const found=nearbyWorldSpot({x:x.get(),y:y.get()});if(found==='rest'){goal.current=null;setActorPose('sleep');return;}if(found)callbacks.current.onInteract(found);};
 useImperativeHandle(ref,()=>({focus:()=>viewport.current?.focus(),key:(code,down)=>{if(!MOVE_KEYS.has(code))return false;if(down&&canMove){lastInput.current=performance.now();keys.current.add(code);goal.current=null;begin.current();}else keys.current.delete(code);return true;},interact,rest:()=>{lastInput.current=performance.now();goal.current=null;setActorPose('sleep');}}));
 const battlePose:CompanionPose=game.phase==='attack'||game.phase==='loot'?'attack':game.phase==='rest'?'sleep':'idle';
 const map=adventureMap(game.area);const scene=map?mapBackground(map):null;const species=currentSpecies(game);
 const shownPose=game.mode==='expedition'&&pose!=='walk'?battlePose:pose;
 return <div ref={viewport} className={styles.worldViewport} role="application" tabIndex={0} aria-label={t('controls')} data-testid="companion-world" data-near={near??''} data-mode={game.mode} data-guard={game.guard>0} data-playing={active&&pageVisible&&!reduced} onPointerDown={event=>{
  if(blocked||(event.target as HTMLElement).closest('button'))return;viewport.current?.focus();const r=event.currentTarget.getBoundingClientRect();const point={x:(event.clientX-r.left-cameraX.get())/zoom.get(),y:(event.clientY-r.top-cameraY.get())/zoom.get()};const safe=moveInWorld({x:x.get(),y:y.get()},point.x-x.get(),point.y-y.get(),game.mode==='expedition');lastInput.current=performance.now();goal.current={point:safe};begin.current();
 }}>
  <link rel="preload" as="image" href={withBasePath('/brand/companion-fox-walk.webp')}/>
  <motion.div className={styles.worldPlane} style={{width:WORLD_WIDTH,height:WORLD_HEIGHT,x:cameraX,y:cameraY,scale:zoom,transformOrigin:'0 0'}}>
   {game.mode==='expedition'&&scene?<div className={styles.adventureBackground} data-map={game.area} style={{backgroundImage:`url(${withBasePath(scene.file)})`,backgroundPosition:scene.position}}/>:<Image src={withBasePath(game.mode==='camp'?'/brand/companion-workshop.webp':'/brand/companion-expedition.webp')} alt="" fill unoptimized sizes="1200px" className={styles.worldBackground}/>}
   {game.mode==='expedition'&&map?<div className={styles.routeProgress} aria-hidden="true">{Array.from({length:5},(_,i)=><span key={i} data-done={i<=Math.floor(game.encounter/3)}>{i===4?'◆':'·'}</span>)}</div>:null}
   {game.mode==='camp'?<CompanionGrowthSigil counts={construction} available={available}/>:null}
   {game.mode==='camp'?WORLD_SPOTS.map(spot=><div key={spot.id} className={styles.worldSpot} style={{left:spot.anchor.x,top:spot.anchor.y}}><motion.div style={{scale:markerScale}}><RowButton tabIndex={-1} aria-label={t(`spot.${spot.id}`)} disabled={blocked} onClick={()=>walkTo(spot)} className="relative atlas-touch-floor atlas-touch-floor-wide"><span className={styles.interactionMarker} data-near={near===spot.id}>{spot.id==='expedition'?<CompanionItem index={7}/>:<span aria-hidden="true">◆</span>}<span>{t(`spot.${spot.id}`)}</span></span></RowButton></motion.div></div>):null}
   <motion.div className={styles.worldActor} style={{x,y}} data-testid="companion-player" data-pose={shownPose}>
    <span className={styles.actorShadow} data-testid="companion-contact-shadow"/><span className={styles.actorFacing} style={{transform:direction<0&&pose==='walk'?'scaleX(-1)':undefined}}><CompanionSprite key={shownPose==='attack'?`${shownPose}-${game.attackId}`:shownPose} pose={shownPose} walkFrame={walkStep} large playing={active&&pageVisible&&!reduced}/></span>
    {game.mode==='expedition'&&game.phase==='hurt'?<span key={game.turn} className={spriteStyles.damage}>{game.lastDamage>0?`−${game.lastDamage}`:t('dodged')}</span>:null}

   </motion.div>
   {game.mode==='expedition'&&(game.phase==='attack'||game.phase==='loot')&&active&&pageVisible&&!reduced?<svg className={styles.spellLayer} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} aria-hidden="true"><motion.line key={game.attackId} x1={x} y1={y} x2={760} y2={510} stroke="var(--color-indigo-accent)" strokeWidth={5} initial={{pathLength:0,opacity:1}} animate={{pathLength:1,opacity:0}} transition={{duration:MOTION.fast.duration*3}}/></svg>:null}
   {game.mode==='expedition'&&game.phase==='loot'?<div key={game.attackId} className={styles.lootReward} style={{left:760,top:470}} aria-hidden="true"><CompanionItem index={6}/><span>+{victoryReward(game).gold} G · +{victoryReward(game).xp} XP</span></div>:null}
   {game.mode==='expedition'?<div key={`${game.encounter}-${game.attackId}`} data-testid="companion-enemy" className={styles.worldEnemy} style={{left:760,top:530}} data-phase={game.phase} data-trait={species?.trait}>{species?<CompanionCreature species={species} large/>:<span className={spriteStyles.monster} data-kind={monsterKind(game)} data-boss={isBoss(game)} aria-hidden="true" style={{backgroundImage:`url(${withBasePath('/brand/companion-monsters.webp')})`}}/>}{game.phase==='attack'?<span key={game.attackId} className={spriteStyles.damage}>−{game.lastDamage}</span>:null}</div>:null}
  </motion.div>
 </div>;
});
