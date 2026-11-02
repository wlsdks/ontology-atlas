import type { PlanningSelection } from './bridge';
type PlanningMemory = { selection: PlanningSelection | null; selected: string | null; scroll: number; identity: string | null; changed: boolean; returnFocus: 'history' | 'map' | null };
let memory: PlanningMemory = { selection: null, selected: null, scroll: 0, identity: null, changed: false, returnFocus: null };
export function readPlanningMemory(): PlanningMemory { return memory; }
export function writePlanningMemory(next: PlanningMemory): void { memory = next; }
