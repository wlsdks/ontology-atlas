'use client';
import {forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,BookOpen,DoorOpen,Package,Search} from 'lucide-react';
import {Button,IconButton} from '@/shared/ui';
import {ICON_SIZE} from '@/shared/ui/icon-size';
import {moveSector,nearbySectorTarget,newSectorSave,parseSectorSave,sectorGateOpen,sectorRoute,sectorStorageKey,sectorWall,sootheSectorMote,SECTOR_CRATES,SECTOR_CURIO,SECTOR_EXIT,SECTOR_GATE,SECTOR_HEIGHT,SECTOR_MOTE_PATH,SECTOR_TERMINAL,SECTOR_WIDTH,type SectorDirection,type SectorPoint,type SectorSave,type SectorTarget} from '../model/companion-sector';
import styles from './companion-sector.module.css';

const TILE=16;
const FLOOR='#172631',FLOOR_ALT='#1c303a',SEAM='#253c46',WALL='#345461',WALL_TOP='#719191',INK='#0c151f',CYAN='#76dbe0',AMBER='#f8bd70';
const FOX=[
 '...O....O...', '..ORO..ORO..', '.ORRROORRRO.', '.ORRRRRRRRO.', '..RCRRRCRR..', '..RBRRRBRR..', '..RRCBCRRR..', '...RCCCR....', '..ORRRRRRO...', '.ORRRRRRRRO.', '.OPOO..OPO.', '..PP....PP..',
];
const FOX_STEP=[...FOX.slice(0,10),'.OP.O..PO.O.','..PP....PP..'];
const FOX_TAIL=['...OO.','..ORRO','.ORRCO','ORRCCO','ORCCCO','.OOOO.'];
const CURIO=[
 '.....A......', '....AAA.....', '...OBBBO....', '..OBBBBBO...', '.OBBBBBBBO..', '.OBWBBWBBBO.', '.OBBBBBBBO..', '..OBBBBBO...', '...OBBBO....', '....OOO.....',
];
const MOTE=['....OOO.....','..OOLLOO....','.OLLLLLLO...','.OLWLLWLO...','.OLLLLLLO...','..OLLLLO....','...OOOO.....','....PP......'];
const SPRITE:Record<string,string>={O:'#233a50',R:'#e89461',C:'#fff0ce',B:'#244c65',P:'#edbd87',A:'#f6ba80',W:'#e9fbf6'};
const CURIO_PALETTE:Record<string,string>={O:'#21475c',B:'#79cbd2',W:'#f4ffff',A:'#f4ac81'};
const MOTE_PALETTE:Record<string,string>={O:'#594366',L:'#d8a8d6',W:'#fff8e6',P:'#efbd83'};
const DIRECTIONS:Record<string,SectorDirection>={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
type Panel='inventory'|'learning'|'quests';
export type CompanionSectorHandle={focus:()=>void;element:()=>HTMLElement|null;key:(code:string,down:boolean)=>boolean;interact:()=>void;scan:()=>void};
type Props={projectKey:string|null;active:boolean;available:boolean;reflectionCurrent:boolean;reflectionClaimed:boolean;onClaimReflection:()=>boolean;onOpenPanel:(panel:Panel)=>void;onReturn:()=>void};

function pixelSprite(ctx:CanvasRenderingContext2D,pattern:readonly string[],palette:Record<string,string>,x:number,y:number,scale=1,mirror=false){
 ctx.save();if(mirror){ctx.translate(Math.round(x)+pattern[0].length*scale,0);ctx.scale(-1,1);x=0;}
 for(let row=0;row<pattern.length;row++)for(let col=0;col<pattern[row].length;col++){const colour=palette[pattern[row][col]];if(colour){ctx.fillStyle=colour;ctx.fillRect(Math.round(x+col*scale),Math.round(y+row*scale),Math.ceil(scale),Math.ceil(scale));}}
 ctx.restore();
}
function tileLayer():HTMLCanvasElement{
 const layer=document.createElement('canvas');layer.width=SECTOR_WIDTH*TILE;layer.height=SECTOR_HEIGHT*TILE;const ctx=layer.getContext('2d')!;
 for(let y=0;y<SECTOR_HEIGHT;y++)for(let x=0;x<SECTOR_WIDTH;x++){
  const px=x*TILE,py=y*TILE,hash=(x*43+y*71+x*y*13)%17;
  if(sectorWall(x,y)){
   ctx.fillStyle=WALL;ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle=WALL_TOP;ctx.fillRect(px,py,TILE,3);ctx.fillStyle=INK;ctx.fillRect(px,py+14,TILE,2);ctx.fillStyle='#466b71';ctx.fillRect(px+2,py+5,2,2);ctx.fillRect(px+12,py+9,2,2);if(hash===4||hash===8){ctx.fillStyle='#9bb8a1';ctx.fillRect(px+6,py+5,3,2);}
  }else{
   ctx.fillStyle=hash<7?FLOOR_ALT:FLOOR;ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle=SEAM;ctx.fillRect(px,py,1,TILE);ctx.fillRect(px,py,16,1);
   if(hash===2||hash===11){ctx.fillStyle='#538077';ctx.fillRect(px+5,py+7,3,1);ctx.fillRect(px+7,py+8,1,2);}
   if(hash===6||hash===15){ctx.fillStyle='#284954';ctx.fillRect(px+3,py+2,2,2);ctx.fillRect(px+11,py+12,2,1);}
   if(x<8&&(hash===3||hash===13)){ctx.fillStyle='#45786f';ctx.fillRect(px+10,py+8,2,4);ctx.fillRect(px+8,py+9,6,2);ctx.fillStyle='#74a583';ctx.fillRect(px+11,py+7,2,2);}
   if(x>15&&x<26&&hash===10){ctx.fillStyle='#415f68';ctx.fillRect(px+5,py+5,6,6);ctx.fillStyle='#89a889';ctx.fillRect(px+7,py+6,2,2);}
   if(y===8&&x>=23&&x<=28){ctx.fillStyle='#284f54';ctx.fillRect(px+2,py+7,12,2);ctx.fillStyle='#64bbb6';ctx.fillRect(px+7,py+7,2,2);}
  }
 }
 for(const lamp of [{x:2,y:2},{x:12,y:8},{x:20,y:4},{x:24,y:13}]){const px=lamp.x*TILE,py=lamp.y*TILE;ctx.fillStyle='#365b62';ctx.fillRect(px+1,py+1,14,14);ctx.fillStyle='#66a79e';ctx.fillRect(px+4,py+4,8,8);ctx.fillStyle='#d8e5ac';ctx.fillRect(px+6,py+6,4,4);ctx.fillStyle='#aacfa3';ctx.fillRect(px+7,py+3,2,2);}
 for(const crate of SECTOR_CRATES){const px=crate.x*TILE,py=crate.y*TILE;ctx.fillStyle='#142430';ctx.fillRect(px+1,py+3,14,12);ctx.fillStyle='#755d53';ctx.fillRect(px+2,py+2,12,11);ctx.fillStyle='#ba8e68';ctx.fillRect(px+3,py+3,10,2);ctx.fillRect(px+6,py+3,2,9);ctx.fillStyle='#e2c28c';ctx.fillRect(px+7,py+6,2,2);}
 return layer;
}
function drawObject(ctx:CanvasRenderingContext2D,point:SectorPoint,camera:SectorPoint,time:number,kind:SectorTarget,gateOpen:boolean,reduced:boolean){
 const x=(point.x-camera.x)*TILE,y=(point.y-camera.y)*TILE;
 if(kind==='terminal'){
  ctx.fillStyle='#183544';ctx.fillRect(x+2,y+3,12,11);ctx.fillStyle='#a7e9df';ctx.fillRect(x+4,y+4,8,5);ctx.fillStyle=CYAN;ctx.fillRect(x+5,y+6,6,1);ctx.fillStyle='#46697a';ctx.fillRect(x+5,y+11,6,2);
 }else if(kind==='curio'){
  ctx.fillStyle='#101c29';ctx.fillRect(x+1,y+13,14,2);pixelSprite(ctx,CURIO,CURIO_PALETTE,x-2,y-4+(reduced?0:Math.floor(time/480)%2),1.6);
 }else if(kind==='gate'){
  ctx.fillStyle=gateOpen?'#163d46':'#594a49';ctx.fillRect(x,y,16,16);ctx.fillStyle=INK;ctx.fillRect(x+1,y+1,2,14);ctx.fillRect(x+13,y+1,2,14);if(gateOpen){ctx.fillStyle='#101f2b';ctx.fillRect(x+4,y+2,8,12);ctx.fillStyle=CYAN;ctx.fillRect(x+3,y+3,2,10);ctx.fillRect(x+11,y+3,2,10);}else{ctx.fillStyle=AMBER;ctx.fillRect(x+7,y+2,2,12);ctx.fillRect(x+3,y+7,10,2);}
 }else{
  ctx.fillStyle='#1d4a55';ctx.fillRect(x+1,y+1,14,14);ctx.fillStyle=CYAN;ctx.fillRect(x+3,y+3,10,10);ctx.fillStyle=INK;ctx.fillRect(x+5,y+5,6,6);ctx.fillStyle='#f8e3b5';ctx.fillRect(x+7,y+6,2,4);
 }
}
function drawMote(ctx:CanvasRenderingContext2D,point:SectorPoint,camera:SectorPoint,time:number,reduced:boolean){const x=(point.x-camera.x)*TILE,y=(point.y-camera.y)*TILE;ctx.fillStyle='#15202c';ctx.fillRect(x+1,y+13,14,2);pixelSprite(ctx,MOTE,MOTE_PALETTE,x-1,y-1+(reduced?0:Math.floor(time/430)%2),1.6);}

export const CompanionSector=forwardRef<CompanionSectorHandle,Props>(function CompanionSector({projectKey,active,available,reflectionCurrent,reflectionClaimed,onClaimReflection,onOpenPanel,onReturn},ref){
 const t=useTranslations('companion.sector');const stage=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);const bg=useRef<HTMLCanvasElement|null>(null);const saveRef=useRef<SectorSave>(newSectorSave());const held=useRef<SectorDirection[]>([]);const facing=useRef<SectorDirection>('right');const lastMove=useRef({from:{x:3,y:13},at:0,duration:115});const lastStep=useRef(0);const scanAt=useRef(0);const scanTarget=useRef<SectorPoint>(SECTOR_CURIO);const scanPath=useRef<SectorPoint[]>([]);
 const [save,setSave]=useState<SectorSave>(newSectorSave);const [ready,setReady]=useState(false);const [storageError,setStorageError]=useState(false);const [corrupt,setCorrupt]=useState(false);const [confirmReset,setConfirmReset]=useState(false);const [message,setMessage]=useState('');const [size,setSize]=useState({cols:30,rows:18});const [enlarged,setEnlarged]=useState(false);
 const gateOpen=sectorGateOpen(save,reflectionCurrent);const near=nearbySectorTarget(save);const key=sectorStorageKey(projectKey);
 useEffect(()=>{
  let next=newSectorSave(),error=false,invalid=false;
  if(key)try{const raw=localStorage.getItem(key);const parsed=parseSectorSave(raw);if(parsed)next=parsed;else{error=true;invalid=raw!==null;}}catch{error=true;}
  if(!sectorGateOpen(next,reflectionCurrent)&&next.x===SECTOR_GATE.x&&next.y===SECTOR_GATE.y)next={...next,x:25,y:8};
  saveRef.current=next;lastMove.current={from:{x:next.x,y:next.y},at:performance.now(),duration:115};setSave(next);setStorageError(error);setCorrupt(invalid);setConfirmReset(false);setReady(true);
 },[key,reflectionCurrent]); // The gate always rechecks live evidence; saved position alone never opens it.
 useEffect(()=>{if(active&&ready)stage.current?.focus({preventScroll:true});else held.current=[];},[active,ready]);
 useEffect(()=>{const stop=()=>{held.current=[];};const onVisibility=()=>{if(document.hidden)stop();};window.addEventListener('blur',stop);document.addEventListener('visibilitychange',onVisibility);return()=>{window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',onVisibility);};},[]);
 useEffect(()=>{const node=stage.current;if(!node)return;const resize=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;const ratio=width/Math.max(1,height);const rows=height<330?10:18;setSize(current=>{const cols=Math.max(12,Math.min(30,Math.floor(rows*ratio)));return current.cols===cols&&current.rows===rows?current:{cols,rows};});setEnlarged(parseFloat(getComputedStyle(document.documentElement).fontSize)>=24);});resize.observe(node);return()=>resize.disconnect();},[]);
 const commit=useCallback((next:SectorSave):boolean=>{
  if(storageError)return false;
  if(key)try{localStorage.setItem(key,JSON.stringify(next));}catch{setStorageError(true);setCorrupt(false);setMessage(t('saveFailed'));return false;}
  saveRef.current=next;setSave(next);return true;
 },[key,storageError,t]);
 const recover=()=>{if(!key)return;if(corrupt&&!confirmReset){setConfirmReset(true);return;}const next=corrupt?newSectorSave():saveRef.current;try{localStorage.setItem(key,JSON.stringify(next));saveRef.current=next;lastMove.current={from:{x:next.x,y:next.y},at:performance.now(),duration:115};setSave(next);setStorageError(false);setCorrupt(false);setConfirmReset(false);setMessage(t(corrupt?'resetDone':'retryReady'));}catch{setMessage(t('saveFailed'));}};
 const step=useCallback((direction:SectorDirection)=>{
  if(!active||!ready||storageError||document.hidden)return;
  facing.current=direction;const old=saveRef.current;const next=moveSector(old,direction,sectorGateOpen(old,reflectionCurrent));
  if(next!==old){const now=performance.now(),prior=lastMove.current,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,progress=reduced?1:Math.min(1,Math.max(0,(now-prior.at)/prior.duration));const from={x:prior.from.x+(old.x-prior.from.x)*progress,y:prior.from.y+(old.y-prior.from.y)*progress};if(commit(next)){lastMove.current={from:reduced?{x:old.x,y:old.y}:from,at:now,duration:Math.max(80,Math.hypot(next.x-from.x,next.y-from.y)*115)};lastStep.current=now;setMessage('');}}
 },[active,ready,storageError,reflectionCurrent,commit]);
 const interact=useCallback(()=>{
  if(!active||!ready||storageError)return;
  scanAt.current=0;
  const current=saveRef.current,target=nearbySectorTarget(current);
  if(!target){setMessage(t('nothingNearby'));return;}
  if(target==='terminal'){if(available)onOpenPanel('learning');else setMessage(t('connectVault'));return;}
  if(target==='curio'){if(!current.curioMet){if(commit({...current,curioMet:true}))setMessage(t('curioMet'));}else setMessage(t('curioAgain'));return;}
  if(target==='mote'){const next=sootheSectorMote(current);if(next!==current&&commit(next))setMessage(t(next.moteHits===3?'moteCalmed':'moteMoved',{count:next.moteHits}));return;}
  if(target==='gate'){
   if(!current.curioMet){setMessage(t('needCurio'));return;}
   if(current.moteHits<3){setMessage(t('needMote'));return;}
   if(!reflectionCurrent){setMessage(t('needReflection'));return;}
   if(!reflectionClaimed&&reflectionCurrent&&!onClaimReflection()){setMessage(t('claimFailed'));return;}
   if(commit({...current,gateActivated:true}))setMessage(t('gateReady'));return;
  }
  if(!sectorGateOpen(current,reflectionCurrent)){setMessage(t('gateClosed'));return;}
  if(current.clearedAt===null){if(commit({...current,clearedAt:Date.now()}))setMessage(t('cleared'));}else setMessage(t('cleared'));
 },[active,ready,storageError,available,reflectionCurrent,reflectionClaimed,commit,onClaimReflection,onOpenPanel,t]);
 const scan=useCallback(()=>{const current=saveRef.current;const kind:SectorTarget=!current.curioMet?'curio':current.moteHits<3?'mote':!reflectionCurrent?'terminal':!sectorGateOpen(current,reflectionCurrent)?'gate':'exit';const target={curio:SECTOR_CURIO,mote:SECTOR_MOTE_PATH[Math.min(2,current.moteHits)],terminal:SECTOR_TERMINAL,gate:SECTOR_GATE,exit:SECTOR_EXIT}[kind];const route=sectorRoute(current,target,sectorGateOpen(current,reflectionCurrent));scanTarget.current=target;scanPath.current=route?.path??[];scanAt.current=performance.now();const name=t(`scanName.${kind}`);setMessage(!route?t('scanBlocked',{target:name}):route.direction?t('scan',{target:name,steps:route.path.length,direction:t(`direction.${route.direction}`)}):t('scanNearby',{target:name}));},[reflectionCurrent,t]);
 useImperativeHandle(ref,()=>({focus:()=>stage.current?.focus({preventScroll:true}),element:()=>stage.current?.closest<HTMLElement>('[data-testid="companion-sector"]')??null,key:(code,down)=>{const direction=DIRECTIONS[code];if(!direction)return false;if(down){if(!held.current.includes(direction)){held.current.push(direction);step(direction);}}else held.current=held.current.filter(item=>item!==direction);return true;},interact,scan}),[step,interact,scan]);
 useEffect(()=>{if(!ready||!active)return;const node=canvas.current;if(!node)return;const ctx=node.getContext('2d',{alpha:false});if(!ctx)return;bg.current??=tileLayer();let frame=0,lastDraw=-Infinity;
  const draw=(now:number)=>{frame=0;if(document.hidden)return;frame=requestAnimationFrame(draw);const scanning=now-scanAt.current<650;const moving=held.current.length>0||now-lastMove.current.at<130;if(!moving&&!scanning&&now-lastDraw<160)return;lastDraw=now;
   const cols=size.cols,rows=size.rows;if(node.width!==cols*TILE||node.height!==rows*TILE){node.width=cols*TILE;node.height=rows*TILE;}ctx.imageSmoothingEnabled=false;
   const current=saveRef.current,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const duration=reduced?0:lastMove.current.duration,fraction=duration?Math.min(1,(now-lastMove.current.at)/duration):1;const px=lastMove.current.from.x+(current.x-lastMove.current.from.x)*fraction,py=lastMove.current.from.y+(current.y-lastMove.current.from.y)*fraction;
   const camera={x:Math.round(Math.max(0,Math.min(SECTOR_WIDTH-cols,px-Math.floor(cols/2)))*TILE)/TILE,y:Math.round(Math.max(0,Math.min(SECTOR_HEIGHT-rows,py-Math.floor(rows/2)))*TILE)/TILE};
   ctx.drawImage(bg.current!,camera.x*TILE,camera.y*TILE,cols*TILE,rows*TILE,0,0,cols*TILE,rows*TILE);
   if(now-scanAt.current<2500){ctx.fillStyle='#89d9d3';for(const point of scanPath.current){const x=(point.x-camera.x)*TILE+7,y=(point.y-camera.y)*TILE+7;ctx.fillRect(Math.round(x),Math.round(y),3,3);}const target=scanTarget.current;ctx.strokeStyle='#d8e9b7';ctx.lineWidth=1;ctx.strokeRect((target.x-camera.x)*TILE+1,(target.y-camera.y)*TILE+1,14,14);}
   const open=sectorGateOpen(current,reflectionCurrent);
   drawObject(ctx,SECTOR_TERMINAL,camera,now,'terminal',open,reduced);drawObject(ctx,SECTOR_CURIO,camera,now,'curio',open,reduced);if(current.moteHits<3)drawMote(ctx,SECTOR_MOTE_PATH[current.moteHits],camera,now,reduced);drawObject(ctx,SECTOR_GATE,camera,now,'gate',open,reduced);drawObject(ctx,SECTOR_EXIT,camera,now,'exit',open,reduced);
   const drawFox=(point:SectorPoint,alpha:number)=>{const x=(point.x-camera.x)*TILE,y=(point.y-camera.y)*TILE,walking=!reduced&&moving&&Math.floor(now/95)%2===1,left=facing.current==='left';ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#0a1720';ctx.fillRect(Math.round(x)+1,Math.round(y)+14,16,2);pixelSprite(ctx,FOX_TAIL,SPRITE,left?x+11:x-7,y+3+(walking?1:0),1.5,left);pixelSprite(ctx,walking?FOX_STEP:FOX,SPRITE,x-1,y-5,1.5,left);ctx.restore();};
   const fade=reduced?Math.min(1,(now-lastMove.current.at)/80):1;if(reduced&&fade<1){drawFox(lastMove.current.from,.6*(1-fade));drawFox(current,.4+.6*fade);}else drawFox({x:px,y:py},1);
   if(nearbySectorTarget(current)){ctx.fillStyle=CYAN;ctx.fillRect((current.x-camera.x)*TILE+7,(current.y-camera.y)*TILE-2,2,2);}
  };const resume=()=>{if(!document.hidden&&!frame)frame=requestAnimationFrame(draw);};document.addEventListener('visibilitychange',resume);frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',resume);};
 },[active,ready,size,reflectionCurrent]);
 useEffect(()=>{if(!active)return;let frame=0;const tick=(now:number)=>{frame=requestAnimationFrame(tick);const direction=held.current.at(-1);if(direction&&now-lastStep.current>=112)step(direction);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[active,step]);
 const directionButtons=[{code:'ArrowUp',label:t('up'),Icon:ArrowUp},{code:'ArrowLeft',label:t('left'),Icon:ArrowLeft},{code:'ArrowDown',label:t('down'),Icon:ArrowDown},{code:'ArrowRight',label:t('right'),Icon:ArrowRight}];
 const notice=confirmReset?t('resetPrompt'):storageError?t(corrupt?'corruptSave':'saveFailed'):message||t('defaultHint');
 const objective=!save.curioMet?'curio':save.moteHits<3?'mote':!reflectionCurrent?'reflect':!gateOpen?'gate':'exit';
 return <section className={styles.root} inert={!active} aria-hidden={!active} data-testid="companion-sector" data-x={save.x} data-y={save.y} data-mote-hits={save.moteHits} data-gate-open={gateOpen} data-cleared={save.clearedAt!==null} data-enlarged={enlarged} aria-label={t('title')}>
  <header className={styles.header}><div><p className={styles.eyebrow}>{t('eyebrow')}</p><h3>{t('title')}</h3></div><div className={styles.headerActions}>{storageError?<>{confirmReset?<Button size="sm" variant="ghost" onClick={()=>setConfirmReset(false)}>{t('cancel')}</Button>:null}<Button size="sm" variant="outline" onClick={recover}>{t(corrupt?(confirmReset?'resetConfirm':'resetSector'):'retrySave')}</Button></>:null}<Button size="sm" variant="ghost" onClick={()=>onOpenPanel('inventory')}><Package size={ICON_SIZE.sm}/> I</Button><Button size="sm" variant="ghost" onClick={()=>onOpenPanel('learning')}><BookOpen size={ICON_SIZE.sm}/> T</Button><Button size="sm" variant="ghost" onClick={()=>onOpenPanel('quests')}>L · {t('quests')}</Button><Button size="sm" variant="outline" onClick={onReturn}><DoorOpen size={ICON_SIZE.sm}/>{t('return')}</Button></div></header>
  <div className={styles.gameArea}><div className={styles.stage} ref={stage} tabIndex={0} role="group" aria-label={t('controls')} data-testid="companion-sector-stage"><canvas ref={canvas} className={styles.canvas} aria-hidden="true"/><span className={styles.mapLabel}>{t(`objective.${objective}`)} <kbd>Q</kbd></span>{near?<span className={styles.interactPrompt}>{t(`target.${near}`)} <kbd>E</kbd></span>:null}</div>
   <aside className={styles.questCard} aria-label={t('questTitle')}><p className={styles.eyebrow}>{t('questTitle')}</p><h4>{t('questName')}</h4><p className={save.curioMet?styles.done:styles.todo}>{save.curioMet?'✓':'◇'} {t('meetCurio')}</p><p className={save.moteHits===3?styles.done:styles.todo}>{save.moteHits===3?'✓':'◇'} {t('calmMote')}</p><p className={reflectionCurrent?styles.done:styles.todo}>{reflectionCurrent?'✓':'◇'} {t('reflect')}</p><p className={gateOpen?styles.done:styles.todo}>{gateOpen?'✓':'◇'} {t('openGate')}</p>{message||storageError?<p className={styles.mobileStatus} role="status">{notice}</p>:null}<div className={styles.questDivider}/><p className={styles.evidence}>{t('evidenceNote')}</p>{!available?<p className={styles.warning}>{t('connectVault')}</p>:null}{save.clearedAt!==null?<p className={styles.complete}>{t('cleared')}</p>:null}</aside></div>
  <footer className={styles.footer}><div className={styles.status}><Search size={ICON_SIZE.sm}/><p role="status" aria-live="polite">{notice}</p></div><div className={styles.actions}><Button size="sm" variant="outline" onClick={scan}><kbd>Q</kbd>{t('scanAction')}</Button><Button size="sm" variant="primary" onClick={interact}><kbd>E</kbd>{near?t(`target.${near}`):t('interact')}</Button></div><div className={styles.pad} aria-label={t('movement')}>{directionButtons.map(({code,label,Icon})=><IconButton key={code} label={label} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);const direction=DIRECTIONS[code];if(!held.current.includes(direction)){held.current.push(direction);step(direction);}}} onPointerUp={()=>{held.current=held.current.filter(item=>item!==DIRECTIONS[code]);}} onPointerCancel={()=>{held.current=held.current.filter(item=>item!==DIRECTIONS[code]);}} onClick={event=>{if(event.detail===0)step(DIRECTIONS[code]);}}><Icon size={ICON_SIZE.sm}/></IconButton>)}</div></footer>
 </section>;
});
