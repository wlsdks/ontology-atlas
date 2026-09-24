import type { VaultDoc } from '@/entities/docs-vault';
import {EMPTY_CONSTRUCTION,parseConstruction,type ConstructionCounts} from './companion-construction';
import {blessingChoices,newCompanionRun,nextCompanionRun,parseCompanionRun,runFloor,type Blessing,type CompanionRun} from './companion-run';
import {ADVENTURE_MAPS,adventureMap,adventureSpecies,encounterSpecies,localName} from './companion-catalog';
import {companionLevelForXp} from './companion-growth';

/** All of these values belong to the optional game, never ontology qualification. */
export const GAME_PREFIX = 'ontology-atlas:companion-game:v1:';
export const TURN_MS = 1500;
export const OFFLINE_LIMIT_MS = 4 * 60 * 60 * 1000;
const MONSTERS = ['slime', 'golem', 'moth'] as const;
export type Monster = typeof MONSTERS[number];
export type Upgrade = 'sword' | 'armor' | 'library';
export const COMPANION_SKILLS=['focus','ward','recovery','wave','fortune','insight'] as const;
export type CompanionSkill=typeof COMPANION_SKILLS[number];
type GamePhase = 'camp' | 'approach' | 'attack' | 'hurt' | 'loot' | 'rest';
export type ExpeditionArea = {uid:string;title:string;slug:string;requiredKnowledge:number;difficulty:number};
export type CompanionGame = {
  version:1; run:CompanionRun; guard:number; dodgeCooldown:number; attackId:number; construction:ConstructionCounts; lastAt:number; mode:'camp'|'expedition'; phase:GamePhase;
  area:string|null; difficulty:number; turn:number; encounter:number;
  hp:number; enemyHp:number; gold:number; xp:number; knowledge:number;
  wins:number; chests:number; potions:number; relics:number; skills:Record<CompanionSkill,number>; rests:number; cooldown:number; lastDamage:number;
  upgrades:Record<Upgrade,number>; bestiary:Record<Monster,number>; discoveries:Record<string,number>; journeys:Record<string,number>;
};
export const newCompanionGame = (now:number):CompanionGame => ({version:1,run:newCompanionRun(now%1_000_000_000),guard:0,dodgeCooldown:0,attackId:0,construction:{...EMPTY_CONSTRUCTION},lastAt:now,mode:'camp',phase:'camp',area:null,difficulty:0,turn:0,encounter:0,hp:40,enemyHp:14,gold:0,xp:0,knowledge:0,wins:0,chests:0,potions:3,relics:0,skills:{focus:0,ward:0,recovery:0,wave:0,fortune:0,insight:0},rests:0,cooldown:0,lastDamage:0,upgrades:{sword:0,armor:0,library:0},bestiary:{slime:0,golem:0,moth:0},discoveries:{},journeys:{}});
export const maxHp = (game:CompanionGame) => 40 + game.upgrades.armor*8 + game.skills.ward*5+(game.mode==='expedition'?game.run.boons.ward*12:0);
export const monsterKind = (game:CompanionGame):Monster => MONSTERS[(game.encounter+game.run.seed%3)%MONSTERS.length];
export const isBoss = (game:CompanionGame) => (game.encounter+1)%15===0;
export const currentSpecies=(game:CompanionGame)=>encounterSpecies(game.area,game.encounter,game.run.seed);
const currentMapEffect=(game:CompanionGame)=>adventureMap(game.area)?.effect;
export const monsterMaxHp = (game:CompanionGame) => Math.round((14+game.difficulty*7+(runFloor(game.encounter)-1)*12) * (isBoss(game)?3:1)*(currentSpecies(game)?.vitality??1)*(currentMapEffect(game)==='fortified'?1.25:1));
export function strikeDamage(game:CompanionGame,power:number,wave=false){const trait=currentSpecies(game)?.trait;return Math.max(1,Math.floor(power*(trait==='armored'?.8:wave&&trait==='arcane'?.7:1)));}
export function enemyDamage(game:CompanionGame){const species=currentSpecies(game);const base=3+game.difficulty+runFloor(game.encounter)-1;const attacks=species?.trait==='swarm'?2:1;return attacks*Math.max(1,Math.round(base*(species?.power??1)*(species?.trait==='fierce'?1.3:1)*(attacks===2?.6:1)*(currentMapEffect(game)==='elite'?1.2:1))-Math.floor(game.upgrades.armor/2));}
function enterEncounter(game:CompanionGame):CompanionGame{const species=currentSpecies(game);return {...game,enemyHp:monsterMaxHp(game),discoveries:species&&game.discoveries[species.id]===undefined?{...game.discoveries,[species.id]:0}:game.discoveries};}
export const attackPower = (game:CompanionGame) => 4+(game.mode==='expedition'?game.run.boons.ember*3:0)+game.upgrades.sword*2+game.skills.focus+Math.min(8,Math.floor(game.knowledge/20))+Math.floor(companionLevelForXp(game.xp+game.knowledge)/2);
export const availableSkillPoints=(game:CompanionGame)=>Math.max(0,Math.min(30,companionLevelForXp(game.xp+game.knowledge)-1)-COMPANION_SKILLS.reduce((sum,key)=>sum+game.skills[key],0));
export const waveMultiplier=(game:CompanionGame)=>3+game.skills.wave*.25+(game.mode==='expedition'?game.run.boons.echo*.75:0);
export const upgradeCost = (game:CompanionGame,kind:Upgrade) => 20+game.upgrades[kind]*game.upgrades[kind]*15;

export function parseCompanionGame(raw:string|null):CompanionGame|null {
  if(raw===null)return null;
  try {
    const value=JSON.parse(raw);
    if(value?.version!==1 || !['camp','expedition'].includes(value.mode) || !['camp','approach','attack','hurt','loot','rest'].includes(value.phase)
      || !(value.area===null || (typeof value.area==='string' && value.area.length>0 && value.area.length<=160)))return null;
    const legacyRun=value.run===undefined;
    if(legacyRun){value.run=newCompanionRun();value.encounter=0;}else value.run=parseCompanionRun(value.run);
    for(const [field,lookup,limit] of [['discoveries',adventureSpecies,108],['journeys',adventureMap,36]] as const){
      const records=value[field]??{};if(!records||typeof records!=='object'||Array.isArray(records)||Object.keys(records).length>limit)return null;
      if(Object.entries(records).some(([id,count])=>!lookup(id)||!Number.isSafeInteger(count)||Number(count)<0||Number(count)>1e9))return null;
      value[field]={...records};
    }
    value.attackId=value.attackId??0;value.guard=value.guard??0;value.dodgeCooldown=value.dodgeCooldown??0;
    if(!value.run)return null;
    value.construction=value.construction===undefined?{...EMPTY_CONSTRUCTION}:parseConstruction(value.construction);
    if(!value.construction)return null;
    value.skills=value.skills??{focus:0,ward:0,recovery:0,wave:0,fortune:0,insight:0};
    for(const key of COMPANION_SKILLS)if(!Number.isInteger(value.skills[key])||value.skills[key]<0||value.skills[key]>5)return null;
    value.skills=Object.fromEntries(COMPANION_SKILLS.map(key=>[key,value.skills[key]]));
    value.potions=value.potions??0;value.relics=value.relics??0;
    for(const key of ['attackId','guard','dodgeCooldown','lastAt','difficulty','turn','encounter','hp','enemyHp','gold','xp','knowledge','wins','potions','relics','rests','cooldown','lastDamage']) {
      if(!Number.isSafeInteger(value[key]) || value[key]<0 || value[key]>(key==='lastAt'?Number.MAX_SAFE_INTEGER:1_000_000_000))return null;
    }
    for(const key of ['sword','armor','library']) if(!Number.isInteger(value.upgrades?.[key]) || value.upgrades[key]<0 || value.upgrades[key]>20)return null;
    for(const key of MONSTERS) if(!Number.isSafeInteger(value.bestiary?.[key]) || value.bestiary[key]<0 || value.bestiary[key]>1_000_000_000)return null;
    if(legacyRun)value.enemyHp=Math.min(value.enemyHp,monsterMaxHp(value));
    if(value.run.drafted>runFloor(value.encounter))return null;
    if(value.guard>2||value.dodgeCooldown>4||value.encounter>14||value.potions>99||value.difficulty>10 || value.rests>6 || value.cooldown>8 || value.hp>maxHp(value) || value.enemyHp>monsterMaxHp(value)
      || (value.mode==='expedition' && (!value.area || value.phase==='camp')) || (value.mode==='camp' && value.phase!=='camp'))return null;
    const chests=value.chests??0;
    if(!Number.isSafeInteger(chests)||chests<0||chests>Math.floor(value.wins/5))return null;
    return {...value,chests} as CompanionGame;
  }catch{return null;}
}

function returnToCamp(game:CompanionGame):CompanionGame {
 const next={...game,mode:'camp' as const,phase:'camp' as const,area:null,enemyHp:0,guard:0};
 return {...next,hp:Math.min(maxHp(next),game.hp)};
}

/** Leaving during the guardian's loot display must bank the same clear as its next turn. */
function settleGuardianClear(game:CompanionGame):CompanionGame {
 if(game.mode!=='expedition'||game.phase!=='loot'||game.encounter!==14)return game;
 return {...game,journeys:adventureMap(game.area)?{...game.journeys,[game.area!]:Math.min(1e9,(game.journeys[game.area!]??0)+1)}:game.journeys,gold:game.gold+30+game.difficulty*10,xp:game.xp+40+game.difficulty*10,run:{...game.run,clears:game.run.clears+1,bestFloor:5,lastOutcome:'clear'}};
}

export function victoryReward(game:CompanionGame){
 return {gold:4+game.difficulty*2+game.skills.fortune+game.run.boons.fortune*3+(isBoss(game)?10:0)+(currentMapEffect(game)==='bounty'?3:0),xp:6+game.difficulty*2+game.upgrades.library+game.skills.insight+game.run.boons.insight*3+(currentMapEffect(game)==='insight'?4:0)};
}
function victory(game:CompanionGame):CompanionGame {
  const reward=victoryReward(game);const species=currentSpecies(game);
  return {...game,discoveries:species?{...game.discoveries,[species.id]:(game.discoveries[species.id]??0)+1}:game.discoveries,phase:'loot',enemyHp:0,hp:Math.min(maxHp(game),game.hp+2+game.run.boons.leech*3+(currentMapEffect(game)==='vital'?3:0)),gold:game.gold+reward.gold,xp:game.xp+reward.xp,relics:game.relics+(isBoss(game)?1:0),wins:game.wins+1,bestiary:{...game.bestiary,[monsterKind(game)]:game.bestiary[monsterKind(game)]+1}};
}

function tick(game:CompanionGame):CompanionGame {
  const next={...game,guard:Math.max(0,game.guard-1),dodgeCooldown:Math.max(0,game.dodgeCooldown-1),turn:game.turn+1,cooldown:Math.max(0,game.cooldown-1),lastDamage:0};
  if(next.mode==='camp')return {...next,hp:Math.min(maxHp(next),next.hp+3)};
  if(next.phase==='rest') {
    const rests=Math.max(0,next.rests-1);
    return {...next,rests,hp:rests===0?maxHp(next):Math.min(maxHp(next),next.hp+6),phase:rests===0?'approach':'rest',enemyHp:monsterMaxHp(next)};
  }
  if(next.phase==='loot') {
    if(next.encounter===14){
      const won=settleGuardianClear(next);
      if(!won.run.repeat)return returnToCamp(won);
      const restarted={...won,encounter:0,phase:'approach' as const,run:nextCompanionRun(won.run)};
      return enterEncounter({...restarted,hp:maxHp(restarted)});
    }
    const encounter=next.encounter+1;
    const advanced={...next,encounter,run:{...next.run,bestFloor:Math.max(next.run.bestFloor,runFloor(encounter))},phase:'approach' as const};
    return enterEncounter(advanced);
  }
  if(next.phase==='attack') {
    const damage=next.guard>0?0:enemyDamage(next);
    const hp=Math.max(0,next.hp-damage);
    if(hp===0){
      const lost={...next,hp:0,run:{...next.run,defeats:next.run.defeats+1,lastOutcome:'defeat' as const},lastDamage:damage};
      if(!lost.run.repeat)return returnToCamp(lost);
      const restarted={...lost,encounter:0,phase:'rest' as const,rests:6,run:nextCompanionRun(lost.run)};
      return enterEncounter(restarted);
    }
    const siphon=currentSpecies(next)?.trait==='siphon'?Math.ceil(damage/2):0;
    const hit={...next,hp,phase:'hurt' as const,lastDamage:damage,enemyHp:Math.min(monsterMaxHp(next),Math.max(0,next.enemyHp-(damage>0?next.run.boons.thorns*3:0))+siphon)};
    return hit.enemyHp===0?victory(hit):hit;
  }
  const damage=strikeDamage(next,attackPower(next)+(next.turn%5===0?2:0));
  if(currentSpecies(next)?.trait==='mender')next.enemyHp=Math.min(monsterMaxHp(next),next.enemyHp+2+runFloor(next.encounter));
  const hit={...next,attackId:next.attackId+1,phase:'attack' as const,enemyHp:Math.max(0,next.enemyHp-damage),lastDamage:damage};
  return hit.enemyHp===0?victory(hit):hit;
}

/** Bounded catch-up: rendering speed, reopening, or a backward clock cannot mint rewards. */
export function advanceCompanionGame(game:CompanionGame, now:number):CompanionGame {
  if(!Number.isSafeInteger(now) || now<=game.lastAt)return game;
  const elapsed=now-game.lastAt;
  const turns=Math.floor(Math.min(elapsed,OFFLINE_LIMIT_MS)/TURN_MS);
  if(turns===0)return game;
  if(game.mode==='camp')return {...game,turn:game.turn+turns,guard:Math.max(0,game.guard-turns),dodgeCooldown:Math.max(0,game.dodgeCooldown-turns),cooldown:Math.max(0,game.cooldown-turns),lastDamage:0,hp:Math.min(maxHp(game),game.hp+turns*3),lastAt:elapsed>OFFLINE_LIMIT_MS?now:game.lastAt+turns*TURN_MS};
  let next=game;
  for(let i=0;i<turns;i++)next=tick(next);
  return {...next,lastAt:elapsed>OFFLINE_LIMIT_MS?now:game.lastAt+turns*TURN_MS};
}

export type GameAction = {type:'depart';area:ExpeditionArea}|{type:'return'}|{type:'upgrade';kind:Upgrade}|{type:'skill'}|{type:'heal'}|{type:'chest'}|{type:'knowledge';points:number}|{type:'learn-skill';skill:CompanionSkill}|{type:'buy-potion'}|{type:'blessing';blessing:Blessing;run:number}|{type:'repeat';enabled:boolean}|{type:'dodge'};
export function actCompanionGame(game:CompanionGame, action:GameAction, now:number):CompanionGame {
  const current=advanceCompanionGame(game,now);const actionTime=Math.max(current.lastAt,now);
  if(action.type==='repeat')return {...current,run:{...current.run,repeat:action.enabled}};
  if(action.type==='blessing'){if(current.mode!=='expedition'||action.run!==current.run.number||!blessingChoices(current.run,current.encounter).includes(action.blessing))return current;const next={...current,run:{...current.run,drafted:current.run.drafted+1,boons:{...current.run.boons,[action.blessing]:current.run.boons[action.blessing]+1}}};return {...next,hp:Math.min(maxHp(next),current.hp+(action.blessing==='ward'?12:0))};}
  if(action.type==='dodge')return current.mode==='expedition'&&current.dodgeCooldown===0&&current.phase!=='rest'&&current.phase!=='loot'?{...current,guard:2,dodgeCooldown:4}:current;
  if(action.type==='knowledge')return Number.isSafeInteger(action.points)&&action.points>=0?{...current,knowledge:Math.min(action.points,100000)}:current;
  if(action.type==='return')return returnToCamp({...settleGuardianClear(current),lastAt:actionTime});
  if(action.type==='depart') {
    if(current.knowledge<action.area.requiredKnowledge || !action.area.uid || action.area.difficulty<0 || action.area.difficulty>10)return current;
    const banked=settleGuardianClear(current);
    const next={...banked,mode:'expedition' as const,phase:'approach' as const,area:action.area.uid,difficulty:action.area.difficulty,encounter:0,run:{...nextCompanionRun(banked.run),lastOutcome:'none' as const,bestFloor:Math.max(1,banked.run.bestFloor)},guard:0,dodgeCooldown:0,cooldown:0,rests:0,lastAt:actionTime};
    return enterEncounter({...next,hp:maxHp(next)});
  }
  if(action.type==='upgrade') {
    const cost=upgradeCost(current,action.kind);
    if(current.upgrades[action.kind]>=20 || current.gold<cost)return current;
    return {...current,gold:current.gold-cost,upgrades:{...current.upgrades,[action.kind]:current.upgrades[action.kind]+1}};
  }
  if(action.type==='chest'){const pending=Math.floor(current.wins/5)-current.chests;return pending>0?{...current,chests:current.chests+pending,gold:current.gold+pending*15,xp:current.xp+pending*10}:current;}
  if(action.type==='learn-skill')return availableSkillPoints(current)>0&&current.skills[action.skill]<5?{...current,skills:{...current.skills,[action.skill]:current.skills[action.skill]+1}}:current;
  if(action.type==='buy-potion')return current.gold>=5&&current.potions<99?{...current,gold:current.gold-5,potions:current.potions+1}:current;
  if(action.type==='heal')return current.potions>0&&current.hp<maxHp(current)?{...current,potions:current.potions-1,hp:Math.min(maxHp(current),current.hp+20+current.skills.recovery*5)}:current;
  if(current.mode!=='expedition'||current.phase==='loot'||current.phase==='rest'||current.cooldown>0)return current;
  const damage=strikeDamage(current,attackPower(current)*waveMultiplier(current),true);
  const hit={...current,attackId:current.attackId+1,phase:'attack' as const,cooldown:Math.max(2,8-current.run.boons.haste),lastDamage:damage,enemyHp:Math.max(0,current.enemyHp-damage)};
  return hit.enemyHp===0?victory(hit):hit;
}

export function expeditionAreas(_docs:readonly VaultDoc[],locale:string):ExpeditionArea[] {
 return ADVENTURE_MAPS.map(map=>({uid:map.id,slug:map.id,title:localName(map.name,locale),requiredKnowledge:map.requiredKnowledge,difficulty:map.difficulty}));
}
