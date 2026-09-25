/** Guaranteed upgrades use earned gold and existing guardian relics, without chance or destruction. */
export const equipmentTier=(level:number)=>Math.floor(level/5);
export const forgeRelicCost=(level:number)=>level<5?0:Math.floor(level/5);
