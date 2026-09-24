import {expect,it} from 'vitest';
import {actCompanionGame,advanceCompanionGame,maxHp,monsterMaxHp,newCompanionGame,parseCompanionGame,TURN_MS,type GameAction} from './companion-game';
import {blessingChoices} from './companion-run';
it('keeps saves readable through 4800 mixed actions, deaths, retries and offline windows',()=>{
 let checked=0;
 for(let seed=1;seed<=12;seed++){
  let rng=seed;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;};
  let now=1000,game={...newCompanionGame(now),knowledge:seed*80};
  const area={uid:'area',slug:'domains/area',title:'Area',difficulty:seed%6,requiredKnowledge:5};
  for(let i=0;i<400;i++){
   now+=i%97===0?4*60*60*1000:random()%(TURN_MS*8);
   game=advanceCompanionGame(game,now);
   const choices=blessingChoices(game.run,game.encounter);
   const actions:GameAction[]=[{type:'depart',area},{type:'return'},{type:'skill'},{type:'dodge'},{type:'heal'},{type:'buy-potion'},{type:'chest'},{type:'upgrade',kind:'sword'},{type:'upgrade',kind:'armor'},{type:'upgrade',kind:'library'},{type:'learn-skill',skill:'ward'},{type:'repeat',enabled:random()%2===0}];
   if(choices.length)actions.push({type:'blessing',blessing:choices[random()%choices.length],run:game.run.number});
   game=actCompanionGame(game,actions[random()%actions.length],now);
   expect(parseCompanionGame(JSON.stringify(game)),`seed ${seed}, action ${i}`).toEqual(game);
   expect(game.hp).toBeLessThanOrEqual(maxHp(game));expect(game.enemyHp).toBeLessThanOrEqual(monsterMaxHp(game));
   expect(game.bestiary.slime+game.bestiary.golem+game.bestiary.moth).toBe(game.wins);
   expect(advanceCompanionGame(game,game.lastAt)).toBe(game);checked++;
  }
 }
 expect(checked).toBe(4800);
});
