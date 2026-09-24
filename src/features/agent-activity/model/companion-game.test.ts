import {describe,expect,it} from 'vitest';
import {actCompanionGame,advanceCompanionGame,attackPower,availableSkillPoints,newCompanionGame,OFFLINE_LIMIT_MS,parseCompanionGame,TURN_MS,upgradeCost,type ExpeditionArea} from './companion-game';
const area:ExpeditionArea={uid:'domain-1',slug:'domains/orders',title:'Orders',difficulty:0,requiredKnowledge:5};
const start=()=>actCompanionGame({...newCompanionGame(1000),knowledge:5},{type:'depart',area},1000);
describe('local companion idle adventure',()=>{
 it('requires actual learning XP to depart and never writes ontology meaning',()=>{
  const empty=newCompanionGame(1000);expect(actCompanionGame(empty,{type:'depart',area},1000)).toEqual(empty);
  const learned=actCompanionGame(empty,{type:'knowledge',points:5},1000);
  expect(actCompanionGame(learned,{type:'depart',area},1000)).toMatchObject({mode:'expedition',area:'domain-1',phase:'approach'});
 });
 it('advances battles, rewards and recovery identically in one catch-up or many renders',()=>{
  const game=start();const end=1000+TURN_MS*100;
  const once=advanceCompanionGame(game,end);let incremental=game;
  for(let now=1000+TURN_MS;now<=end;now+=TURN_MS)incremental=advanceCompanionGame(incremental,now);
  expect(once).toEqual(incremental);expect(once.wins).toBeGreaterThan(0);expect(once.gold).toBeGreaterThan(0);expect(once.xp).toBeGreaterThan(0);
  expect(Object.values(once.bestiary).reduce((a,b)=>a+b,0)).toBe(once.wins);
  expect(advanceCompanionGame(once,end)).toBe(once);expect(advanceCompanionGame(once,end-10000)).toBe(once);
  expect(parseCompanionGame(JSON.stringify(once))).toEqual(once);
 });
 it('caps offline work and consumes the capped window once',()=>{
  const game=start();const capped=advanceCompanionGame(game,1000+OFFLINE_LIMIT_MS);const week=advanceCompanionGame(game,1000+7*24*60*60*1000);
  expect({...week,lastAt:capped.lastAt}).toEqual(capped);expect(advanceCompanionGame(week,week.lastAt)).toBe(week);
 });
 it('spends only earned gold, upgrades one item, and cooldown stops skill replay',()=>{
  const poor=start();expect(actCompanionGame(poor,{type:'upgrade',kind:'sword'},1000)).toEqual(poor);
  const rich={...poor,gold:100};const improved=actCompanionGame(rich,{type:'upgrade',kind:'sword'},1000);
  expect(improved.gold).toBe(100-upgradeCost(rich,'sword'));expect(attackPower(improved)).toBe(attackPower(rich)+2);
  const used=actCompanionGame(poor,{type:'skill'},1000);expect(used.cooldown).toBe(8);
  expect(actCompanionGame(used,{type:'skill'},1000)).toEqual(used);
 });
 it('camp stops earning combat rewards and malformed saves fail closed',()=>{
  const camp=actCompanionGame(start(),{type:'return'},1000);const later=advanceCompanionGame(camp,1000+OFFLINE_LIMIT_MS);
  expect(later).toMatchObject({mode:'camp',gold:0,xp:0,wins:0});
  for(const raw of ['bad',JSON.stringify({...start(),gold:-1}),JSON.stringify({...start(),upgrades:{sword:100,armor:0,library:0}}),JSON.stringify({...start(),lastAt:NaN})])expect(parseCompanionGame(raw)).toBeNull();
 });
});

it('supply chests claim all earned milestones once and read older saves safely',()=>{
 const ready={...newCompanionGame(1000),wins:15};const claimed=actCompanionGame(ready,{type:'chest'},1000);
 expect(claimed).toMatchObject({chests:3,gold:45,xp:30});expect(actCompanionGame(claimed,{type:'chest'},1000)).toBe(claimed);
 const {chests:_old,...legacy}=ready;expect(parseCompanionGame(JSON.stringify(legacy))?.chests).toBe(0);
 expect(parseCompanionGame(JSON.stringify({...ready,chests:4}))).toBeNull();
});
it('allocates level-earned skills once, consumes owned potions and strips unknown skill fields',()=>{
 let game={...newCompanionGame(1000),knowledge:30,hp:5};game=actCompanionGame(game,{type:'learn-skill',skill:'recovery'},1000);
 expect(game.skills.recovery).toBe(1);expect(actCompanionGame(game,{type:'learn-skill',skill:'focus'},1000)).toEqual(game);
 const healed=actCompanionGame(game,{type:'heal'},1000);expect(healed).toMatchObject({hp:30,potions:2});
 const parsed=parseCompanionGame(JSON.stringify({...game,skills:{...game.skills,unexpected:-1000}}));expect(parsed?.skills).toEqual(game.skills);
});

it('a fully learned skill tree does not advertise unusable points on a large project',()=>{
 const game={...newCompanionGame(1000),knowledge:100000};expect(availableSkillPoints(game)).toBe(30);
 expect(availableSkillPoints({...game,skills:{focus:5,ward:5,recovery:5,wave:5,fortune:5,insight:5}})).toBe(0);
});
