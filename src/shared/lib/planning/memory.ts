import type { PlanningEditableText } from './editable-text';
import type { PlanningSelection } from './source';

/**
 * Unsaved editor text kept while the person visits another screen or folder; in memory only,
 * never on disk or in browser storage. `homeFolderName` is the home selection's shown path.
 */
export type PlanningDraft = { homeFolderName: string; path: string; text: string; identity: string; lineEnding: PlanningEditableText['lineEnding'] };
type PlanningMemory = { selection: PlanningSelection | null; selected: string | null; scroll: number; identity: string | null; changed: boolean; returnFocus: 'history' | 'map' | null; draft: PlanningDraft | null };
let memory: PlanningMemory = { selection: null, selected: null, scroll: 0, identity: null, changed: false, returnFocus: null, draft: null };
export function readPlanningMemory(): PlanningMemory { return memory; }
/** Merges `next` over the current memory, so a write that names no draft keeps it. */
export function writePlanningMemory(next: Partial<PlanningMemory>): void { memory = { ...memory, ...next }; }
