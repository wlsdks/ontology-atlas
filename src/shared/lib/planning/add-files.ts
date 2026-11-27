import {
  importTauriSourceFiles,
  pickTauriSourceFiles,
} from '@/shared/lib/vault-folder/native-vault/tauri-library-sources';
import { PLANNING_HOME_FOLDER } from './home-source';

/** What one "Add files" did; `added` holds home-folder paths in the order the person picked. */
export type PlanningAddOutcome = { added: string[]; duplicates: number; unsupported: number; failed: number };

/** The native picker's title; native dialogs are titled in English. */
const NATIVE_DIALOG_TITLE = 'Add planning files';

/**
 * Copies every path the native picker offered through the app's import command, which applies the
 * home scan's type rule to the file it would copy and answers `unsupported-type` for the rest.
 */
async function addPlanningFilesInApp(rootPath: string, pickedPaths: readonly string[]): Promise<PlanningAddOutcome> {
  const outcome: PlanningAddOutcome = { added: [], duplicates: 0, unsupported: 0, failed: 0 };
  const prefix = `${PLANNING_HOME_FOLDER}/`;
  for (const result of (await importTauriSourceFiles(rootPath, pickedPaths, 'planning')) ?? []) {
    if ((result.status === 'added' || result.status === 'renamed') && result.relativePath?.startsWith(prefix)) outcome.added.push(result.relativePath.slice(prefix.length));
    else if (result.status === 'duplicate') outcome.duplicates += 1;
    else if (result.reason === 'unsupported-type') outcome.unsupported += 1;
    else outcome.failed += 1;
  }
  return outcome;
}

/** Adding files needs the app's native picker, which needs the folder's absolute path. */
export function planningAddAvailable(rootPath: string | null): boolean {
  return rootPath !== null;
}

/**
 * Lets the person pick files and copies them into the home folder through the app's native import.
 * Returns null when the picker was dismissed or the folder has no absolute path.
 */
export async function pickPlanningFiles({ rootPath }: { rootPath: string | null }): Promise<PlanningAddOutcome | null> {
  if (!rootPath) return null;
  const picked = await pickTauriSourceFiles(NATIVE_DIALOG_TITLE);
  return picked && picked.length > 0 ? addPlanningFilesInApp(rootPath, picked) : null;
}
