import {expect,it} from 'vitest';
import {actCompanionGame,advanceCompanionGame,expeditionAreas,newCompanionGame,TURN_MS,type GameAction} from './companion-game';

it('planning the next path changes no current health, enemy, or rewards',()=>{
 const now=1000;const game=actCompanionGame({...newCompanionGame(now),knowledge:1000},{type:'depart',area:expeditionAreas([],'en')[0]},now);
 const action={type:'plan-path',path:'cache',run:game.run.number,floor:1} as unknown as GameAction;
 const planned=actCompanionGame(game,action,now);
 expect(planned.run).toMatchObject({plan:'cache',paths:[]});
 expect([planned.hp,planned.enemyHp,planned.gold,planned.xp]).toEqual([game.hp,game.enemyHp,game.gold,game.xp]);
 expect(actCompanionGame(planned,action,now)).toBe(planned);
 const next=advanceCompanionGame({...planned,phase:'loot',encounter:2,enemyHp:0},now+TURN_MS);
 expect(next.run).toMatchObject({paths:[{floor:2,kind:'cache',healed:0}]});
});

import {activePath,maxHp,monsterMaxHp,enemyDamage,parseCompanionGame,victoryReward,OFFLINE_LIMIT_MS} from './companion-game';
import {nextCompanionRun} from './companion-run';
const start=()=>actCompanionGame({...newCompanionGame(1000),knowledge:1000},{type:'depart',area:expeditionAreas([],'en')[0]},1000);
const boundary=()=>({...start(),encounter:2,phase:'loot' as const,enemyHp:0,hp:5});

it('rest heals only at floor entry and changing plans cannot replay it or reshape the current enemy',()=>{
 const entered=advanceCompanionGame(boundary(),1000+TURN_MS);expect(entered.hp).toBe(15);expect(activePath(entered)).toEqual({floor:2,kind:'camp',healed:10});
 const before=[entered.hp,entered.enemyHp,monsterMaxHp(entered),victoryReward(entered)];
 let game=entered;for(const path of ['elite','cache','camp'] as const)game=actCompanionGame(game,{type:'plan-path',path,run:game.run.number,floor:2},game.lastAt);
 expect([game.hp,game.enemyHp,monsterMaxHp(game),victoryReward(game)]).toEqual(before);
 expect(advanceCompanionGame(game,game.lastAt)).toBe(game);
 const full=advanceCompanionGame({...boundary(),hp:maxHp(boundary())},1000+TURN_MS);expect(activePath(full)?.healed).toBe(0);
});

it('supplies and elite effects are fixed on the entered floor, with actual matching tradeoffs',()=>{
 const seed=boundary();const plain={...seed,encounter:3,phase:'approach' as const};
 const enter=(path:'cache'|'elite')=>advanceCompanionGame(actCompanionGame(seed,{type:'plan-path',path,run:seed.run.number,floor:1},1000),1000+TURN_MS);
 const cache=enter('cache');const elite=enter('elite');
 expect(Math.abs(monsterMaxHp(cache)-monsterMaxHp(plain)*1.15)).toBeLessThanOrEqual(1);expect(victoryReward(cache).gold).toBe(victoryReward(plain).gold+3);
 expect(Math.abs(monsterMaxHp(elite)-monsterMaxHp(plain)*1.25)).toBeLessThanOrEqual(1);expect(victoryReward(elite).xp).toBe(victoryReward(plain).xp+6);expect(enemyDamage(elite)).toBeGreaterThanOrEqual(enemyDamage(plain));
 expect(cache.hp).toBe(5);expect(elite.hp).toBe(5);
});

it('rejects stale run and floor choices and resets only path history on the next run',()=>{
 const game=advanceCompanionGame(boundary(),1000+TURN_MS);
 for(const stale of [{run:game.run.number-1,floor:2},{run:game.run.number,floor:1}])expect(actCompanionGame(game,{type:'plan-path',path:'elite',...stale},game.lastAt)).toBe(game);
 const planned=actCompanionGame(game,{type:'plan-path',path:'elite',run:game.run.number,floor:2},game.lastAt);
 expect(nextCompanionRun(planned.run)).toMatchObject({plan:'elite',paths:[]});
 const returned=actCompanionGame(planned,{type:'return'},game.lastAt);expect(activePath(returned)).toBeUndefined();
});

it('keeps legacy floor progress without inventing paths and rejects corrupt or future history',()=>{
 const game=advanceCompanionGame(boundary(),1000+TURN_MS);const {plan:_plan,paths:_paths,...oldRun}=game.run;
 const legacy=parseCompanionGame(JSON.stringify({...game,run:oldRun}));expect(legacy?.run).toMatchObject({plan:'camp',paths:[]});expect(legacy?.hp).toBe(game.hp);
 for(const run of [{...game.run,plan:'fake'},{...game.run,paths:[{floor:3,kind:'camp',healed:10}]},{...game.run,paths:[{floor:2,kind:'camp',healed:-1}]},{...game.run,paths:[...game.run.paths,...game.run.paths]}])expect(parseCompanionGame(JSON.stringify({...game,run}))).toBeNull();
});

it('offline catch-up and live turns produce identical path effects and cannot replay rewards',()=>{
 let base={...start(),upgrades:{sword:20,armor:20,library:0},hp:200};base=actCompanionGame(base,{type:'plan-path',path:'elite',run:base.run.number,floor:1},1000);
 let live=base;for(let i=1;i<=100;i++)live=advanceCompanionGame(live,1000+i*TURN_MS);
 expect(advanceCompanionGame(base,1000+100*TURN_MS)).toEqual(live);
 const away=advanceCompanionGame(base,1000+OFFLINE_LIMIT_MS);expect(parseCompanionGame(JSON.stringify(away))).toEqual(away);expect(away.run.plan).toBe('elite');expect(away.run.clears).toBeGreaterThan(0);
 expect(advanceCompanionGame(away,away.lastAt)).toBe(away);
});
