/** Temporary expedition builds are separate from permanent project growth. */
export const BLESSINGS=['ember','ward','leech','echo','fortune','insight','haste','thorns'] as const;
export type Blessing=typeof BLESSINGS[number];
export type CompanionRun={number:number;seed:number;drafted:number;boons:Record<Blessing,number>;clears:number;defeats:number;bestFloor:number;repeat:boolean;lastOutcome:'none'|'clear'|'defeat'};
const emptyBoons=():Record<Blessing,number>=>({ember:0,ward:0,leech:0,echo:0,fortune:0,insight:0,haste:0,thorns:0});
export const newCompanionRun=(seed=1):CompanionRun=>({number:0,seed:Math.max(1,seed>>>0),drafted:0,boons:emptyBoons(),clears:0,defeats:0,bestFloor:0,repeat:true,lastOutcome:'none'});
function random(seed:number){let value=seed|0;value^=value<<13;value^=value>>>17;value^=value<<5;return value>>>0||1;}
export const runFloor=(encounter:number)=>Math.min(5,1+Math.floor(encounter/3));
export const nextCompanionRun=(run:CompanionRun):CompanionRun=>({...run,number:run.number+1,seed:random(run.seed+run.number+1)%1_000_000_000||1,drafted:0,boons:emptyBoons()});
export const availableBlessings=(run:CompanionRun,encounter:number)=>Math.max(0,runFloor(encounter)-run.drafted);
export function blessingChoices(run:CompanionRun,encounter:number):Blessing[]{
 if(availableBlessings(run,encounter)===0)return [];
 const pool=BLESSINGS.filter(key=>run.boons[key]<3);let seed=random(run.seed+run.drafted*7919);
 for(let i=pool.length-1;i>0;i--){seed=random(seed);const j=seed%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,3);
}
export function parseCompanionRun(value:unknown):CompanionRun|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const run=value as CompanionRun;
 for(const key of ['number','seed','drafted','clears','defeats','bestFloor'] as const)if(!Number.isSafeInteger(run[key])||run[key]<0||run[key]>1e9)return null;
 if(run.seed<1||run.drafted>5||run.bestFloor>5||typeof run.repeat!=='boolean'||!['none','clear','defeat'].includes(run.lastOutcome))return null;
 for(const key of BLESSINGS)if(!Number.isInteger(run.boons?.[key])||run.boons[key]<0||run.boons[key]>3)return null;
 if(BLESSINGS.reduce((sum,key)=>sum+run.boons[key],0)!==run.drafted)return null;
 return {...run,boons:Object.fromEntries(BLESSINGS.map(key=>[key,run.boons[key]])) as Record<Blessing,number>};
}
