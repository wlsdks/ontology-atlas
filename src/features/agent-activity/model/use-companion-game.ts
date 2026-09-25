'use client';
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {actCompanionGame,advanceCompanionGame,GAME_PREFIX,maxHp,newCompanionGame,parseCompanionGame,TURN_MS,type GameAction,type CompanionGame} from './companion-game';
import {constructionHighWater,constructionXp,EMPTY_CONSTRUCTION,type ConstructionCounts} from './companion-construction';
import type {QuestEvidence} from './companion-quests';
const EVENT='atlas-companion-game-updated';
const server=()=>null;
function read(key:string|null){if(!key)return null;try{return localStorage.getItem(key);}catch{return '__unavailable__';}}
function subscribe(listener:()=>void){window.addEventListener(EVENT,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(EVENT,listener);window.removeEventListener('storage',listener);};}
export function useCompanionGame(project:string|null,knowledge:number,active:boolean,areaIds:string,construction:ConstructionCounts=EMPTY_CONSTRUCTION,questEvidence:QuestEvidence|null=null,paused=false){
 const key=project?GAME_PREFIX+project:null;
 const get=useCallback(()=>read(key),[key]);
 const raw=useSyncExternalStore(subscribe,get,server);
 const parsed=useMemo(()=>parseCompanionGame(raw),[raw]);
 const [failed,setFailed]=useState(false);
 const [constructionReward,setConstructionReward]=useState(0);
 const [dismissed,setDismissed]=useState(false);
 const [arrival,setArrival]=useState({xp:0,gold:0,wins:0});
 const started=useRef(false);
 const pausedAt=useRef<number|null>(null);
 const transact=useCallback((update:(current:CompanionGame,now:number)=>CompanionGame)=>{
  if(!key)return false;
  const raw=read(key);const now=Date.now();const current=raw===null?newCompanionGame(now):parseCompanionGame(raw);
  if(!current)return false;
  const next=update(current,now);
  if(next===current)return true;
  try{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event(EVENT));return true;}catch{return false;}
 },[key]);
 const resumeClock=useCallback(()=>{
  const since=pausedAt.current;
  if(since===null)return true;
  let receipt:{xp:number;gold:number;wins:number}|null=null;
  const ok=transact((current,now)=>{
   // Finish only the time before the menu opened, then carry the unfinished
   // fraction of a turn across the pause. A failed save remains retryable.
   const settled=advanceCompanionGame(current,since);
   if(!started.current)receipt={xp:settled.xp-current.xp,gold:settled.gold-current.gold,wins:settled.wins-current.wins};
   return {...settled,lastAt:Math.max(settled.lastAt,Math.min(now,settled.lastAt+Math.max(0,now-since)))};
  });
  if(ok){pausedAt.current=null;if(receipt){setArrival(receipt);started.current=true;}}
  else setFailed(true);
  return ok;
 },[transact]);
 useEffect(()=>{
  if(!active||!key){pausedAt.current=null;return;}
  if(paused&&pausedAt.current===null)pausedAt.current=Date.now();
  const tick=()=>{
   if(document.visibilityState!=='visible')return;
   if(!paused&&!resumeClock())return;
   let receipt: {xp:number;gold:number;wins:number}|null=null;
   let earned=0;
   const ok=transact((current,now)=>{
    const clock=pausedAt.current??now;
    let next=current.mode==='camp'&&current.hp===maxHp(current)?current:advanceCompanionGame(current,clock);
    if(!started.current)receipt={xp:next.xp-current.xp,gold:next.gold-current.gold,wins:next.wins-current.wins};
    if(next.area&&!areaIds.split('|').includes(next.area))next=actCompanionGame(next,{type:'return'},clock);
    const highWater=constructionHighWater(current.construction,construction);
    earned=constructionXp(highWater)-constructionXp(current.construction);
    const points=constructionXp(highWater)+knowledge;
    return next.knowledge===points&&earned===0?next:{...next,construction:highWater,knowledge:points};
   });
   setFailed(!ok);
   if(ok&&earned>0)setConstructionReward(earned);
   if(ok && receipt){setArrival(receipt);started.current=true;}
  };
  tick();if(paused)return;
  const timer=window.setInterval(tick,TURN_MS);document.addEventListener('visibilitychange',tick);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
 },[active,key,knowledge,areaIds,construction,paused,resumeClock,transact]);
 const act=useCallback((action:GameAction)=>{
  if(!paused&&!resumeClock())return false;
  let applied=false;
  const ok=transact((current,now)=>{const clock=paused?pausedAt.current??current.lastAt:now;const ready=advanceCompanionGame(current,clock);const next=actCompanionGame(ready,action,clock,questEvidence?.project===project?questEvidence:null);applied=next!==ready;return next;});
  setFailed(!ok);return ok&&applied;
 },[transact,questEvidence,project,paused,resumeClock]);
 const reset=useCallback(()=>{
  if(!key)return false;
  const prior=parseCompanionGame(read(key));
  const saved=constructionHighWater(prior?.construction??EMPTY_CONSTRUCTION,construction);
  try{localStorage.setItem(key,JSON.stringify({...newCompanionGame(Date.now()),construction:saved,knowledge:knowledge+constructionXp(saved)}));window.dispatchEvent(new Event(EVENT));setFailed(false);setArrival({xp:0,gold:0,wins:0});setConstructionReward(0);return true;}catch{setFailed(true);return false;}
 },[key,knowledge,construction]);
 return {constructionReward,dismissConstruction:()=>setConstructionReward(0),game:parsed??newCompanionGame(0),unreadable:raw!==null&&parsed===null,failed,act,reset,arrival:dismissed?null:arrival,dismissArrival:()=>setDismissed(true)};
}
