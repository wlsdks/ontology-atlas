/** A small, hand-authored room. Sector coordinates and Curio are game fiction, not ontology nodes. */
export const SECTOR_WIDTH=30;
export const SECTOR_HEIGHT=18;
export const SECTOR_START={x:3,y:13} as const;
export const SECTOR_TERMINAL={x:4,y:4} as const;
export const SECTOR_CURIO={x:17,y:11} as const;
export const SECTOR_GATE={x:26,y:8} as const;
export const SECTOR_EXIT={x:28,y:8} as const;
export const SECTOR_MOTE_PATH=[{x:20,y:11},{x:23,y:5},{x:20,y:6}] as const;
export const SECTOR_CRATES=[{x:5,y:12},{x:6,y:12},{x:11,y:12},{x:21,y:13},{x:24,y:4}] as const;
const SECTOR_PREFIX='ontology-atlas:companion-sector:v1:';
export type SectorPoint={x:number;y:number};
export type SectorDirection='up'|'down'|'left'|'right';
export type SectorTarget='terminal'|'curio'|'mote'|'gate'|'exit';
export type SectorSave={version:1;x:number;y:number;curioMet:boolean;moteHits:number;gateActivated:boolean;clearedAt:number|null};
export const newSectorSave=():SectorSave=>({version:1,...SECTOR_START,curioMet:false,moteHits:0,gateActivated:false,clearedAt:null});

const same=(a:SectorPoint,b:SectorPoint)=>a.x===b.x&&a.y===b.y;
const sectorDistance=(a:SectorPoint,b:SectorPoint)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function sectorWall(x:number,y:number):boolean{
 if(x<0||y<0||x>=SECTOR_WIDTH||y>=SECTOR_HEIGHT)return true;
 if(x===0||y===0||x===SECTOR_WIDTH-1||y===SECTOR_HEIGHT-1)return true;
 if(x===26&&y!==8)return true;
 if(x===8&&y>=2&&y<=7&&y!==5)return true;
 if(x===15&&y>=6&&y<=13&&y!==9)return true;
 if(x===22&&y>=2&&y<=9&&y!==6)return true;
 if(y===3&&x>=10&&x<=13)return true;
 if(y===14&&x>=18&&x<=21)return true;
 return false;
}
export function sectorWalkable(point:SectorPoint,gateOpen:boolean):boolean{
 if(sectorWall(point.x,point.y))return false;
 if(SECTOR_CRATES.some(crate=>same(point,crate)))return false;
 if(same(point,SECTOR_TERMINAL)||same(point,SECTOR_CURIO)||same(point,SECTOR_EXIT))return false;
 if(same(point,SECTOR_GATE)&&!gateOpen)return false;
 return true;
}
export function moveSector(save:SectorSave,direction:SectorDirection,gateOpen:boolean):SectorSave{
 const delta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[direction];
 const point={x:save.x+delta[0],y:save.y+delta[1]};
 if(save.moteHits<3&&same(point,SECTOR_MOTE_PATH[save.moteHits]))return save;
 return sectorWalkable(point,gateOpen)?{...save,...point}:save;
}
export function nearbySectorTarget(save:SectorSave):SectorTarget|null{
 const targets:[SectorTarget,SectorPoint][]=[['terminal',SECTOR_TERMINAL],['curio',SECTOR_CURIO],['exit',SECTOR_EXIT],['gate',SECTOR_GATE]];
 if(save.moteHits<3)targets.unshift(['mote',SECTOR_MOTE_PATH[save.moteHits]]);
 return targets.find(([,position])=>sectorDistance(save,position)<=1)?.[0]??null;
}
export function sootheSectorMote(save:SectorSave):SectorSave{return save.moteHits<3&&sectorDistance(save,SECTOR_MOTE_PATH[save.moteHits])<=1?{...save,moteHits:save.moteHits+1}:save;}
export function sectorGateOpen(save:SectorSave,reflectionCurrent:boolean):boolean{return save.curioMet&&save.moteHits===3&&save.gateActivated&&reflectionCurrent;}
export function sectorRoute(save:SectorSave,target:SectorPoint,gateOpen:boolean):{path:SectorPoint[];direction:SectorDirection|null}|null{
 const directions:[SectorDirection,number,number][]=[['up',0,-1],['right',1,0],['down',0,1],['left',-1,0]];
 const start={x:save.x,y:save.y},queue:[SectorPoint,SectorPoint[],SectorDirection|null][]=[[start,[],null]],seen=new Set([`${start.x},${start.y}`]);
 for(let head=0;head<queue.length;head++){const [point,path,first]=queue[head];if(sectorDistance(point,target)<=1)return {path,direction:first};
  for(const [direction,dx,dy] of directions){const next={x:point.x+dx,y:point.y+dy},id=`${next.x},${next.y}`;if(seen.has(id)||!sectorWalkable(next,gateOpen)||save.moteHits<3&&same(next,SECTOR_MOTE_PATH[save.moteHits]))continue;seen.add(id);queue.push([next,[...path,next],first??direction]);}
 }
 return null;
}
export function sectorStorageKey(projectKey:string|null):string|null{return projectKey?`${SECTOR_PREFIX}${projectKey}`:null;}
export function parseSectorSave(raw:string|null):SectorSave|null{
 if(raw===null)return newSectorSave();
 try{
  const value=JSON.parse(raw) as SectorSave;
  if(!value||value.version!==1||!Number.isInteger(value.x)||!Number.isInteger(value.y)||typeof value.curioMet!=='boolean'||!Number.isInteger(value.moteHits)||value.moteHits<0||value.moteHits>3||typeof value.gateActivated!=='boolean'||(value.clearedAt!==null&&(!Number.isSafeInteger(value.clearedAt)||value.clearedAt<0)))return null;
  if(!sectorWalkable(value,true))return null;
  return {version:1,x:value.x,y:value.y,curioMet:value.curioMet,moteHits:value.moteHits,gateActivated:value.gateActivated,clearedAt:value.clearedAt};
 }catch{return null;}
}
