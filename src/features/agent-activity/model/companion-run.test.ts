import {expect,it} from 'vitest';
import {actCompanionGame,advanceCompanionGame,maxHp,newCompanionGame,parseCompanionGame,TURN_MS,type CompanionGame} from './companion-game';
import {availableBlessings,blessingChoices,parseCompanionRun} from './companion-run';
const area={uid:'domain',slug:'domain',title:'Domain',difficulty:0,requiredKnowledge:5};
const start=()=>actCompanionGame({...newCompanionGame(1000),knowledge:800},{type:'depart',area},1000);
it('offers three stable, distinct blessings and commits only one current-run choice per earned floor',()=>{
 const game=start(),choices=blessingChoices(game.run,0);expect(new Set(choices).size).toBe(3);expect(blessingChoices(game.run,0)).toEqual(choices);
 const chosen=actCompanionGame(game,{type:'blessing',blessing:choices[0],run:game.run.number},1000);expect(chosen.run.drafted).toBe(1);expect(availableBlessings(chosen.run,0)).toBe(0);
 expect(actCompanionGame(chosen,{type:'blessing',blessing:choices[1],run:game.run.number},1000)).toBe(chosen);
 expect(actCompanionGame(game,{type:'blessing',blessing:choices[0],run:game.run.number-1},1000)).toBe(game);
 expect(availableBlessings(chosen.run,3)).toBe(1);expect(parseCompanionRun({...chosen.run,drafted:4})).toBeNull();
});
it('times a dodge against the next attack and prevents immediate replay',()=>{
 const enemyTurn={...start(),phase:'attack' as const};const dodged=actCompanionGame(enemyTurn,{type:'dodge'},1000);
 expect(actCompanionGame(dodged,{type:'dodge'},1000)).toBe(dodged);
 const after=advanceCompanionGame(dodged,1000+TURN_MS);expect(after.hp).toBe(enemyTurn.hp);expect(after.lastDamage).toBe(0);
 expect(advanceCompanionGame(enemyTurn,1000+TURN_MS).hp).toBeLessThan(enemyTurn.hp);
});
it('completes a finite expedition, banks its reward once, and removes temporary power on return',()=>{
 const game=start();const final:CompanionGame={...game,encounter:14,phase:'loot',enemyHp:0,hp:52,run:{...game.run,repeat:false,drafted:1,boons:{...game.run.boons,ward:1}}};
 const done=advanceCompanionGame(final,1000+TURN_MS);expect(done).toMatchObject({mode:'camp',area:null,run:{clears:1,lastOutcome:'clear'}});expect(done.hp).toBe(maxHp(done));expect(done.gold).toBe(30);
 expect(advanceCompanionGame(done,1000+TURN_MS*5).gold).toBe(30);expect(parseCompanionGame(JSON.stringify(done))).toEqual(done);
});
it('auto retry resets only the temporary build and catches up identically to live turns',()=>{
 const game={...start(),hp:1,phase:'attack' as const,gold:100};const after=advanceCompanionGame(game,1000+TURN_MS);expect(after).toMatchObject({mode:'expedition',phase:'rest',encounter:0,gold:100,run:{number:2,defeats:1,drafted:0}});
 const end=1000+TURN_MS*150;const once=advanceCompanionGame(game,end);let live=game as CompanionGame;for(let now=1000+TURN_MS;now<=end;now+=TURN_MS)live=advanceCompanionGame(live,now);
 expect(once).toEqual(live);expect(parseCompanionGame(JSON.stringify(once))).toEqual(once);
});
it('migrates an old endless expedition without losing saved rewards or producing an invalid enemy',()=>{
 const {run:_run,guard:_guard,dodgeCooldown:_cooldown,...old}=start();const loaded=parseCompanionGame(JSON.stringify({...old,encounter:1009,enemyHp:42,gold:70}));expect(loaded).not.toBeNull();expect(loaded!.gold).toBe(70);expect(loaded!.encounter).toBe(0);expect(parseCompanionGame(JSON.stringify(loaded))).toEqual(loaded);
});
it('a skill accepted during an attack has a fresh event identity without inventing a turn',()=>{
 const game={...start(),encounter:14,enemyHp:180,phase:'attack' as const,attackId:4};
 const struck=actCompanionGame(game,{type:'skill'},1000);expect(struck.turn).toBe(game.turn);expect(struck.attackId).toBe(5);expect(struck.phase).toBe('attack');expect(struck.enemyHp).toBeLessThan(game.enemyHp);
 expect(actCompanionGame(struck,{type:'skill'},1000).attackId).toBe(5);
});
it('returning and departing cannot move the replay boundary backwards with the wall clock',()=>{
 const saved=start();const returned=actCompanionGame(saved,{type:'return'},1);const departed=actCompanionGame(returned,{type:'depart',area},1);expect(departed.lastAt).toBe(saved.lastAt);expect(advanceCompanionGame(departed,saved.lastAt)).toBe(departed);
});
it('banks a guardian clear exactly once when leaving during its loot animation',()=>{
 const before={...start(),encounter:14,enemyHp:1};
 const defeated=actCompanionGame(before,{type:'skill'},1000);expect(defeated.phase).toBe('loot');
 const automatic=advanceCompanionGame({...defeated,run:{...defeated.run,repeat:false}},1000+TURN_MS);
 for(const action of [{type:'return'} as const,{type:'depart',area} as const]){
  const left=actCompanionGame(defeated,action,1000);
  expect(left.run.clears).toBe(1);expect(left.gold).toBe(automatic.gold);expect(left.xp).toBe(automatic.xp);
  const again=actCompanionGame(left,{type:'return'},1000);expect(again.run.clears).toBe(1);expect(again.gold).toBe(left.gold);
 }
});
