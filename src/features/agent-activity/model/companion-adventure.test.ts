import {expect,it} from 'vitest';
import {actCompanionGame,expeditionAreas,newCompanionGame} from './companion-game';

it('provides 36 fictional adventures independently of ontology domain count, gated by project knowledge',()=>{
 const areas=expeditionAreas([],'en');
 expect(areas).toHaveLength(36);
 expect(new Set(areas.map(area=>area.uid)).size).toBe(36);
 const veteran={...newCompanionGame(1000),xp:100000,knowledge:0};
 expect(actCompanionGame(veteran,{type:'depart',area:areas[0]},1000)).toBe(veteran);
 expect(actCompanionGame({...veteran,knowledge:areas[0].requiredKnowledge},{type:'depart',area:areas[0]},1000).mode).toBe('expedition');
});

import {ADVENTURE_MAPS,SPECIES,encounterSpecies,adventureMap} from './companion-catalog';
import {advanceCompanionGame,currentSpecies,enemyDamage,monsterMaxHp,parseCompanionGame,strikeDamage,TURN_MS,victoryReward} from './companion-game';

it('every catalog creature has a reachable encounter and every route has a distinct roster, scene and guardian',()=>{
 const reached=new Set<string>();
 for(const map of ADVENTURE_MAPS){
  expect(map.roster).toHaveLength(5);expect(new Set(map.roster).size).toBe(5);
  for(let room=0;room<15;room++){const species=encounterSpecies(map.id,room,1)!;expect(species.region).toBe(map.region);expect(species.guardian).toBe(room===14);reached.add(species.id);}
 }
 expect(reached).toEqual(new Set(SPECIES.map(species=>species.id)));
 expect(SPECIES).toHaveLength(108);expect(SPECIES.filter(species=>species.guardian)).toHaveLength(18);
 expect(new Set(ADVENTURE_MAPS.map(map=>`${map.region}:${map.index}`)).size).toBe(36);
 expect(new Set(ADVENTURE_MAPS.map(map=>`${map.roster.join(',')}:${map.guardian}`)).size).toBe(36);
});

it('records actual sightings and kills, preserves legacy saves without invented discovery, and banks one map clear',()=>{
 const legacy=newCompanionGame(1000);const {discoveries:_d,journeys:_j,...old}=legacy;
 expect(parseCompanionGame(JSON.stringify(old))).toMatchObject({discoveries:{},journeys:{}});
 const area=expeditionAreas([],'en')[0];let game=actCompanionGame({...legacy,knowledge:10000},{type:'depart',area},1000);
 const seen=currentSpecies(game)!;expect(game.discoveries).toEqual({[seen.id]:0});
 game=actCompanionGame(game,{type:'skill'},1000);expect(game.discoveries[seen.id]).toBe(1);
 const final={...game,encounter:14,phase:'loot' as const,enemyHp:0};
 const camp=actCompanionGame(final,{type:'return'},1000);expect(camp.journeys[area.uid]).toBe(1);
 expect(actCompanionGame(camp,{type:'return'},1000).journeys[area.uid]).toBe(1);
 expect(parseCompanionGame(JSON.stringify(camp))).toEqual(camp);
 expect(parseCompanionGame(JSON.stringify({...camp,discoveries:{forged:99}}))).toBeNull();
 expect(parseCompanionGame(JSON.stringify({...camp,journeys:{[area.uid]:-1}}))).toBeNull();
});

it('all six combat traits change the actual simulation and route effects change actual rewards',()=>{
 const area=expeditionAreas([],'en')[0];const base=actCompanionGame({...newCompanionGame(1000),knowledge:20},{type:'depart',area},1000);
 const gameFor=(trait:string)=>{for(const map of ADVENTURE_MAPS)for(let encounter=0;encounter<15;encounter++){const game={...base,area:map.id,encounter,difficulty:0};if(currentSpecies(game)?.trait===trait)return {...game,enemyHp:monsterMaxHp(game)};}throw Error('Unreachable trait');};
 expect(strikeDamage(gameFor('armored'),100)).toBe(80);
 expect(strikeDamage(gameFor('arcane'),100,true)).toBe(70);expect(strikeDamage(gameFor('arcane'),100,false)).toBe(100);
 for(const trait of ['fierce','swarm'])expect(enemyDamage(gameFor(trait))).toBeGreaterThanOrEqual(4);
 const mender={...gameFor('mender'),phase:'hurt' as const,enemyHp:10};
 const after=advanceCompanionGame(mender,1000+TURN_MS);expect(after.enemyHp).toBeGreaterThan(10-strikeDamage(mender,6));
 const siphon={...gameFor('siphon'),phase:'attack' as const,enemyHp:5};const drained=advanceCompanionGame(siphon,1000+TURN_MS);expect(drained.enemyHp).toBeGreaterThan(5);
 const guarded=advanceCompanionGame({...siphon,guard:2},1000+TURN_MS);expect(guarded.enemyHp).toBe(5);expect(guarded.hp).toBe(siphon.hp);
 expect(victoryReward({...base,area:ADVENTURE_MAPS[1].id}).gold-victoryReward(base).gold).toBe(3);
 expect(victoryReward({...base,area:ADVENTURE_MAPS[4].id}).xp-victoryReward(base).xp).toBe(4);
 expect(monsterMaxHp({...base,area:ADVENTURE_MAPS[3].id})).toBeGreaterThan(0);
});

it('all maps survive bounded offline simulation and round-trip without losing project or discovery data',()=>{
 for(const area of expeditionAreas([],'en')){
  const start=actCompanionGame({...newCompanionGame(1000),knowledge:10000,upgrades:{sword:20,armor:20,library:2}},{type:'depart',area},1000);
  const end=advanceCompanionGame(start,1000+TURN_MS*1000);
  expect(parseCompanionGame(JSON.stringify(end)),area.title).toEqual(end);
  expect(end.knowledge).toBe(10000);expect(Object.keys(end.discoveries).length).toBeGreaterThan(1);expect(end.journeys[area.uid]).toBeGreaterThan(0);
  expect(Object.keys(end.discoveries).every(id=>id.startsWith(adventureMap(area.uid)!.region+'-'))).toBe(true);
  expect(advanceCompanionGame(end,end.lastAt)).toBe(end);
 }
});

it('a defeat retry records the newly encountered creature before it is defeated',()=>{
 const area=expeditionAreas([],'en')[0];const start=actCompanionGame({...newCompanionGame(1000),knowledge:5},{type:'depart',area},1000);
 const lost={...start,hp:1,phase:'attack' as const};const retry=advanceCompanionGame(lost,1000+TURN_MS);
 expect(retry.phase).toBe('rest');expect(retry.run.defeats).toBe(1);
 expect(retry.discoveries[currentSpecies(retry)!.id]).toBe(0);
});
