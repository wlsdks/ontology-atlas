import {describe,expect,it} from 'vitest';
import {moveSector,nearbySectorTarget,newSectorSave,parseSectorSave,sectorGateOpen,sectorRoute,sectorStorageKey,sectorWalkable,sootheSectorMote,SECTOR_CURIO,SECTOR_EXIT,SECTOR_GATE,SECTOR_MOTE_PATH,SECTOR_START,SECTOR_TERMINAL,type SectorDirection,type SectorPoint} from './companion-sector';

function route(from:SectorPoint,to:SectorPoint,open:boolean):SectorDirection[]{
 const steps:[SectorDirection,number,number][]=[['up',0,-1],['right',1,0],['down',0,1],['left',-1,0]];
 const queue:[SectorPoint,SectorDirection[]][]=[[from,[]]],seen=new Set([`${from.x},${from.y}`]);
 while(queue.length){const [point,path]=queue.shift()!;if(Math.abs(point.x-to.x)+Math.abs(point.y-to.y)<=1)return path;
  for(const [direction,dx,dy] of steps){const next={x:point.x+dx,y:point.y+dy},key=`${next.x},${next.y}`;if(!seen.has(key)&&sectorWalkable(next,open)){seen.add(key);queue.push([next,[...path,direction]]);}}
 }throw new Error('Sector objective is unreachable');
}

describe('direct sector',()=>{
 it('has walkable paths to both interactions and a gate that actually divides the room',()=>{
  expect(route(SECTOR_START,SECTOR_CURIO,false).length).toBeGreaterThan(0);
  expect(route(SECTOR_CURIO,SECTOR_TERMINAL,false).length).toBeGreaterThan(0);
  for(const mote of SECTOR_MOTE_PATH)expect(route(SECTOR_START,mote,false).length).toBeGreaterThan(0);
  expect(route(SECTOR_TERMINAL,SECTOR_GATE,false).length).toBeGreaterThan(0);
  expect(()=>route(SECTOR_START,SECTOR_EXIT,false)).toThrow('unreachable');
  expect(route(SECTOR_START,SECTOR_EXIT,true).length).toBeGreaterThan(0);
 });
 it('requires a local interaction and current reflection before crossing; a prior claim is insufficient',()=>{
  let save={...newSectorSave(),x:25,y:8};
  expect(nearbySectorTarget(save)).toBe('gate');
  expect(moveSector(save,'right',false)).toBe(save);
  save={...save,curioMet:true,moteHits:3,gateActivated:true};
  expect(sectorGateOpen(save,false)).toBe(false);
  expect(moveSector(save,'right',sectorGateOpen(save,false))).toBe(save);
  expect(moveSector(save,'right',sectorGateOpen(save,true))).toMatchObject({x:26,y:8});
 });
 it('makes the harmless mote move between three reachable encounters before the gate can open',()=>{
  let save=newSectorSave();for(const point of SECTOR_MOTE_PATH){save={...save,x:point.x-1,y:point.y};expect(nearbySectorTarget(save)).toBe('mote');save=sootheSectorMote(save);}expect(save.moteHits).toBe(3);expect(nearbySectorTarget(save)).toBeNull();
 });
 it('scans walkable route length and direction instead of a wall-crossing Manhattan guess',()=>{
  const save=newSectorSave(),route=sectorRoute(save,SECTOR_CURIO,false)!;
  expect(route.path.length).toBeGreaterThan(0);
  const first=route.path[0];expect(({up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]})[route.direction!]).toEqual([first.x-save.x,first.y-save.y]);
  expect(route.path.every(point=>sectorWalkable(point,false))).toBe(true);
  expect(Math.abs(route.path.at(-1)!.x-SECTOR_CURIO.x)+Math.abs(route.path.at(-1)!.y-SECTOR_CURIO.y)).toBe(1);
  expect(sectorRoute(save,SECTOR_EXIT,false)).toBeNull();
  expect(sectorRoute({...save,curioMet:true,moteHits:3,gateActivated:true},SECTOR_EXIT,true)).not.toBeNull();
 });
 it('keeps the save separate by project and refuses malformed or invented position state',()=>{
  const first=sectorStorageKey('one')!,second=sectorStorageKey('two')!;localStorage.setItem(first,JSON.stringify({...newSectorSave(),x:7,curioMet:true}));
  expect(parseSectorSave(localStorage.getItem(first))).toMatchObject({x:7,curioMet:true});
  expect(parseSectorSave(localStorage.getItem(second))).toEqual(newSectorSave());
  expect(first).toBe('ontology-atlas:companion-sector:v1:one');
  expect(second).toBe('ontology-atlas:companion-sector:v1:two');
  expect(sectorStorageKey(null)).toBeNull();
  expect(parseSectorSave(null)).toEqual(newSectorSave());
  expect(parseSectorSave(JSON.stringify({...newSectorSave(),x:0}))).toBeNull();
  expect(parseSectorSave(JSON.stringify({...newSectorSave(),gateActivated:'yes'}))).toBeNull();
  expect(parseSectorSave(JSON.stringify({...newSectorSave(),moteHits:4}))).toBeNull();
  expect(parseSectorSave(JSON.stringify({...newSectorSave(),clearedAt:-1}))).toBeNull();
  localStorage.removeItem(first);
 });
});
