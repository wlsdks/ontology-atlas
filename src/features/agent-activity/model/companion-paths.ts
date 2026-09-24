/** Saved preferences affect the next floor, never the encounter being fought. */
export const RUN_PATHS=['camp','cache','elite'] as const;
export type RunPath=typeof RUN_PATHS[number];
export type PathStep={floor:number;kind:RunPath;healed:number};
export const PATH_EFFECTS={
 camp:{icon:8,heal:.25,health:1,damage:1,gold:-2,xp:0},
 cache:{icon:6,heal:0,health:1.15,damage:1,gold:3,xp:0},
 elite:{icon:0,heal:0,health:1.25,damage:1.15,gold:2,xp:6},
} as const;
export const isRunPath=(value:unknown):value is RunPath=>RUN_PATHS.includes(value as RunPath);
export function parsePathSteps(value:unknown):PathStep[]|null{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>4)return null;
 let last=1;const steps:PathStep[]=[];
 for(const step of value){if(!step||!Number.isInteger(step.floor)||step.floor<=last||step.floor>5||!isRunPath(step.kind)||!Number.isSafeInteger(step.healed)||step.healed<0||step.healed>1000)return null;last=step.floor;steps.push({floor:step.floor,kind:step.kind,healed:step.healed});}
 return steps;
}
