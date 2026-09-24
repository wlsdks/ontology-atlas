'use client';
import {useEffect,useState} from 'react';
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
const SEQUENCES:Record<CompanionPose,readonly number[]>={walk:[0,1,2,3],attack:[4,5,6,7],read:[8,9],code:[10,11],idle:[12],greet:[13],sleep:[14],victory:[15]};
const PERIOD:Record<CompanionPose,number>={walk:150,attack:150,read:900,code:300,idle:1000,greet:1000,sleep:1000,victory:1000};
export function CompanionSprite({pose,large=false,playing=false}:{pose:CompanionPose;large?:boolean;playing?:boolean}){
 return <SpriteFrames key={pose} pose={pose} large={large} playing={playing}/>;
}
function SpriteFrames({pose,large,playing}:{pose:CompanionPose;large:boolean;playing:boolean}){
 const [step,setStep]=useState(0);const sequence=SEQUENCES[pose];
 useEffect(()=>{
  if(!playing||sequence.length===1)return;
  let ticks=0;
  const timer=window.setInterval(()=>{
   setStep(previous=>pose==='attack'?Math.min(previous+1,sequence.length-1):(previous+1)%sequence.length);
   if(pose==='attack'&&++ticks>=sequence.length-1)window.clearInterval(timer);
  },PERIOD[pose]);
  return()=>window.clearInterval(timer);
 },[playing,pose,sequence]);
 const index=sequence[step];const [x,y,w,h]=FRAMES[index];
 const col=index%4,row=Math.floor(index/4),cell=1254/4,pad=(360-cell)/2;
 return <span className={`${styles.heroSprite} ${large?styles.largeSprite:''}`} data-pose={pose} data-playing={playing} data-frame={index} aria-hidden="true">
  <span className={styles.heroPixels} style={{
   backgroundImage:`url(${withBasePath('/brand/companion-fox-atlas.webp')})`,
   width:`${w/360*100}%`,height:`${h/360*100}%`,left:`${(x-col*cell+pad)/360*100}%`,top:`${(y-row*cell+pad)/360*100}%`,
   backgroundSize:`calc(var(--companion-size,64px) * ${1254/360}) calc(var(--companion-size,64px) * ${1254/360})`,
   backgroundPosition:`calc(var(--companion-size,64px) * ${-x/360}) calc(var(--companion-size,64px) * ${-y/360})`,
  }}/>
 </span>;
}
