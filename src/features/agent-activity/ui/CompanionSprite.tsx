'use client';
import {useEffect,useRef,useState} from 'react';
import type {MotionValue} from 'framer-motion';
import {withBasePath} from '@/shared/lib/base-path';
import styles from './companion-rpg.module.css';
export type CompanionPose='walk'|'attack'|'read'|'code'|'idle'|'greet'|'sleep'|'victory';
// Source rectangles measured from the transparent atlas. An attack effect crosses
// the nominal grid, so uniform background stepping would draw a neighbour's pixels.
const FRAMES=[
 [49,52,222,243],[356,52,222,243],[644,51,230,244],[963,52,224,244],
 [44,357,252,243],[352,359,291,240],[662,357,267,242],[983,357,224,243],
 [48,656,235,244],[356,656,238,244],[660,656,241,242],[977,655,239,243],
 [49,947,202,252],[359,945,241,256],[668,983,229,221],[974,940,246,240],
] as const;
const WALK_FRAMES=[[48,83,311,332],[499,83,305,332],[930,83,310,332],[1373,83,311,332],[55,509,299,326],[499,509,298,326],[937,509,303,326],[1386,509,301,326]] as const;
const SEQUENCES:Record<CompanionPose,readonly number[]>={walk:[0,1,2,3,4,5,6,7],attack:[4,5,6,7],read:[8,9],code:[10,11],idle:[12],greet:[13],sleep:[14],victory:[15]};
const PERIOD:Record<CompanionPose,number>={walk:150,attack:150,read:900,code:300,idle:1000,greet:1000,sleep:1000,victory:1000};
export function CompanionSprite({pose,large=false,playing=false,walkFrame}:{pose:CompanionPose;large?:boolean;playing?:boolean;walkFrame?:MotionValue<number>}){
 return <SpriteFrames key={pose} pose={pose} large={large} playing={playing} walkFrame={walkFrame}/>;
}
function pixelFrame(walking:boolean,index:number){
 const [x,y,w,h]=walking?WALK_FRAMES[index]:FRAMES[index];
 const reference=walking?480:360;
 const sheetWidth=walking?1774:1254,sheetHeight=walking?887:1254;
 const pivotX=walking?Math.floor(index%4*1774/4)+251:index%4*1254/4+195;
 const footY=y+h;
 return {
  backgroundImage:`url(${withBasePath(walking?'/brand/companion-fox-walk.webp':'/brand/companion-fox-atlas.webp')})`,
  width:`${w/reference*100}%`,height:`${h/reference*100}%`,left:`${50+(x-pivotX)/reference*100}%`,top:`${100+(y-footY)/reference*100}%`,
  backgroundSize:`calc(var(--companion-size,64px) * ${sheetWidth/reference}) calc(var(--companion-size,64px) * ${sheetHeight/reference})`,
  backgroundPosition:`calc(var(--companion-size,64px) * ${-x/reference}) calc(var(--companion-size,64px) * ${-y/reference})`,
 };
}
function SpriteFrames({pose,large,playing,walkFrame}:{pose:CompanionPose;large:boolean;playing:boolean;walkFrame?:MotionValue<number>}){
 const [step,setStep]=useState(0);const sequence=SEQUENCES[pose];
 const spriteRef=useRef<HTMLSpanElement>(null);const pixelsRef=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!playing||sequence.length===1||(pose==='walk'&&walkFrame!==undefined))return;
  let ticks=0;
  const timer=window.setInterval(()=>{
   setStep(previous=>pose==='attack'?Math.min(previous+1,sequence.length-1):(previous+1)%sequence.length);
   if(pose==='attack'&&++ticks>=sequence.length-1)window.clearInterval(timer);
  },PERIOD[pose]);
  return()=>window.clearInterval(timer);
 },[playing,pose,sequence,walkFrame]);
 const walking=pose==='walk';
 const index=sequence[walking&&walkFrame?(playing?walkFrame.get()%8:0):step];
 // Gait changes touch only the five pixel-frame styles and data-frame. React does
 // not reconcile the entire world twelve times per second while the fox walks.
 useEffect(()=>{
  if(!walking||!playing||!walkFrame)return;
  const paint=(step:number)=>{
   const sprite=spriteRef.current,pixels=pixelsRef.current;if(!sprite||!pixels)return;
   const frame=Math.floor(step)%8;const style=pixelFrame(true,frame);
   pixels.style.width=style.width;pixels.style.height=style.height;pixels.style.left=style.left;pixels.style.top=style.top;pixels.style.backgroundPosition=style.backgroundPosition;
   sprite.dataset.frame=String(frame);
  };
  paint(walkFrame.get());
  return walkFrame.on('change',paint);
 },[walking,playing,walkFrame]);
 return <span ref={spriteRef} className={`${styles.heroSprite} ${large?styles.largeSprite:''}`} data-pose={pose} data-playing={playing} data-frame={index} aria-hidden="true">
  <span ref={pixelsRef} className={styles.heroPixels} style={pixelFrame(walking,index)}/>
 </span>;
}
