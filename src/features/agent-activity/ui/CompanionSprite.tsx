'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {MotionValue} from 'framer-motion';
import {withBasePath} from '@/shared/lib/base-path';
import {usePrefersReducedMotion} from '@/shared/lib/use-prefers-reduced-motion';
import styles from './companion-rpg.module.css';

export type CompanionPose='walk'|'attack'|'read'|'code'|'idle'|'greet'|'sleep'|'victory';
// Twenty registered 64px cells share one scale and ground contact. Reading
// returns through intermediate poses instead of snapping a folded map open.
const SEQUENCES:Record<CompanionPose,readonly number[]>={
 walk:[0,1,2,3,4,5,6,7],attack:[12,13,14,15],
 read:[8,9,10,11,10,9],code:[9,10,11,10],idle:[16],greet:[17],sleep:[18],victory:[19],
};
const PERIOD:Record<CompanionPose,number>={walk:150,attack:150,read:300,code:200,idle:1000,greet:1000,sleep:1000,victory:1000};
const framePosition=(index:number)=>`${index/19*100}% 0`;
const visible=()=>!document.hidden;
const serverVisible=()=>true;
const subscribe=(listener:()=>void)=>{document.addEventListener('visibilitychange',listener);return()=>document.removeEventListener('visibilitychange',listener);};
export function CompanionSprite({pose,large=false,playing=false,walkFrame}:{pose:CompanionPose;large?:boolean;playing?:boolean;walkFrame?:MotionValue<number>}){
 return <SpriteFrames key={pose} pose={pose} large={large} playing={playing} walkFrame={walkFrame}/>;
}
function SpriteFrames({pose,large,playing,walkFrame}:{pose:CompanionPose;large:boolean;playing:boolean;walkFrame?:MotionValue<number>}){
 const [step,setStep]=useState(0);
 const pageVisible=useSyncExternalStore(subscribe,visible,serverVisible);
 const reduced=usePrefersReducedMotion();
 const active=playing&&pageVisible&&!reduced;
 const sequence=SEQUENCES[pose];
 const spriteRef=useRef<HTMLSpanElement>(null);const pixelsRef=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!active||sequence.length===1||(pose==='walk'&&walkFrame!==undefined))return;
  let ticks=0;
  const timer=window.setInterval(()=>{
   setStep(previous=>pose==='attack'?Math.min(previous+1,sequence.length-1):(previous+1)%sequence.length);
   if(pose==='attack'&&++ticks>=sequence.length-1)window.clearInterval(timer);
  },PERIOD[pose]);
  return()=>window.clearInterval(timer);
 },[active,pose,sequence,walkFrame]);
 const controlled=pose==='walk'&&walkFrame!==undefined;
 const index=sequence[reduced?0:controlled?(active?((Math.floor(walkFrame.get())%8)+8)%8:0):step];
 // Distance-driven walking writes one style, without reconciling the game world.
 useEffect(()=>{
  if(!controlled||!active)return;
  const paint=(value:number)=>{
   const sprite=spriteRef.current,pixels=pixelsRef.current;if(!sprite||!pixels)return;
   const frame=((Math.floor(value)%8)+8)%8;
   pixels.style.backgroundPosition=framePosition(frame);sprite.dataset.frame=String(frame);
  };
  paint(walkFrame.get());return walkFrame.on('change',paint);
 },[controlled,active,walkFrame]);
 return <span ref={spriteRef} className={`${styles.heroSprite} ${large?styles.largeSprite:''}`} data-pose={pose} data-playing={active} data-frame={index} aria-hidden="true">
  <span ref={pixelsRef} className={styles.heroPixels} style={{backgroundImage:`url(${withBasePath('/brand/traveler-frames.png')})`,backgroundSize:'2000% 100%',backgroundPosition:framePosition(index)}}/>
 </span>;
}
