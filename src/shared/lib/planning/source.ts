import { openPlanningDocument, readPlanningFile, scanPlanningFolder, type PickedPlanningSelection, type PlanningInventory } from './bridge';
import { homePlanningSource } from './home-source';

/** What Planning reads a folder through; the picked folder and the home folder answer alike. */
export interface PlanningSource {
  scan(): Promise<PlanningInventory>;
  /** Rejects with an error containing `file-changed` when the bytes no longer match `expectedIdentity`. */
  openDocument(path: string, expectedIdentity: string | null): Promise<{ identity: string; bytes: Uint8Array }>;
  readFile(path: string): Promise<Uint8Array>;
}

/** `planning/` inside the opened ontology folder, written through that folder's own grant. */
export type HomePlanningSelection = { kind: 'home'; root: FileSystemDirectoryHandle; directory: FileSystemDirectoryHandle; path: string };
export type PlanningSelection = PickedPlanningSelection | HomePlanningSelection;

export function planningSourceFor(selection: PlanningSelection): PlanningSource {
  if (selection.kind === 'home') return homePlanningSource(selection.directory);
  const { generation } = selection;
  return {
    scan: () => scanPlanningFolder(generation),
    openDocument: (path, expectedIdentity) => openPlanningDocument(generation, path, expectedIdentity),
    readFile: (path) => readPlanningFile(generation, path),
  };
}
