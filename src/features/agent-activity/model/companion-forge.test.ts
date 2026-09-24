import {expect,it} from 'vitest';
import {actCompanionGame,attackPower,maxHp,newCompanionGame,parseCompanionGame,upgradeCost,waveMultiplier} from './companion-game';
import {forgeRelicCost} from './companion-forge';
import {QUESTS,type QuestClaims} from './companion-quests';
const claims=(n:number):QuestClaims=>Object.fromEntries(QUESTS.slice(0,n).map(q=>[q.id,{at:1,count:q.goal,targetUid:null,targetSlug:null}]));
it('quest milestones unlock forge tiers while retaining previously earned equipment',()=>{
 const game={...newCompanionGame(1000),gold:10000,relics:10,upgrades:{sword:5,armor:0,library:0}};
 expect(actCompanionGame(game,{type:'upgrade',kind:'sword'},1000)).toBe(game);
 const unlocked={...game,questClaims:claims(2)};const upgraded=actCompanionGame(unlocked,{type:'upgrade',kind:'sword'},1000);
 expect(upgraded.upgrades.sword).toBe(6);expect(upgraded.gold).toBe(game.gold-upgradeCost(unlocked,'sword'));expect(upgraded.relics).toBe(9);
 const legacy={...game,upgrades:{sword:18,armor:12,library:8}};expect(parseCompanionGame(JSON.stringify(legacy))?.upgrades).toEqual(legacy.upgrades);
 expect(actCompanionGame({...unlocked,relics:0},{type:'upgrade',kind:'sword'},1000).upgrades.sword).toBe(5);
});
it('every five enhancement levels adds actual personal equipment power',()=>{
 const game={...newCompanionGame(1000),gold:10000,relics:20,questClaims:claims(6),upgrades:{sword:4,armor:4,library:4}};
 const sword=actCompanionGame(game,{type:'upgrade',kind:'sword'},1000);expect(attackPower(sword)-attackPower(game)).toBe(4);
 const cloak=actCompanionGame(game,{type:'upgrade',kind:'armor'},1000);expect(maxHp(cloak)-maxHp(game)).toBe(13);
 const book=actCompanionGame(game,{type:'upgrade',kind:'library'},1000);expect(waveMultiplier(book)-waveMultiplier(game)).toBe(.25);
 expect([0,4,5,9,10,14,15,19].map(forgeRelicCost)).toEqual([0,0,1,1,2,2,3,3]);
});
it('a completed forge upgrade consumes its exact resources and cannot advance past the cap',()=>{
 const game={...newCompanionGame(1000),gold:100000,relics:100,questClaims:claims(6),upgrades:{sword:19,armor:0,library:0}};
 const last=actCompanionGame(game,{type:'upgrade',kind:'sword'},1000);expect(last.upgrades.sword).toBe(20);expect(last.relics).toBe(97);expect(actCompanionGame(last,{type:'upgrade',kind:'sword'},1000)).toBe(last);
});
