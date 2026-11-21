'use client';

import { useCallback, useState } from 'react';

import { CURRENT_LOCAL_FS_HANDLE_ID, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { failureCodeOf } from '@/shared/lib/failures/failure-code';
import {
  createTauriVaultHandle,
  isTauriVaultRuntime,
  listTauriDirectoryNames,
  ensureTauriChildDirectory,
  getTauriVaultRootPath,
  pickTauriVaultDirectory,
} from '@/shared/lib/vault-folder/tauri-vault-fs';

import {
  PROJECT_VAULT_DIR,
  pickedTheMapFolder,
  projectAlreadyHasVault,
  projectVaultLocation,
  type ProjectVaultLocation,
} from './project-vault-location';

/** Nothing is created until `confirm` runs from a screen that showed `location.displayPath` (`local-first.md`). An existing `atlas` folder is reused and reported, never overwritten. */
/** English: it is an OS dialog title and the surrounding native chrome is not localised. */
const PROJECT_PICKER_TITLE = 'Choose your project folder';

type BuildFromCodeStage = 'idle' | 'choosing' | 'confirm' | 'creating';

export interface BuildFromCodeState {
  stage: BuildFromCodeStage;
  /** The screen must render `displayPath` before offering `confirm`. */
  location: ProjectVaultLocation | null;
  reusesExisting: boolean;
  pickedMapFolder: boolean;
  errorText: string | null;
}

export interface BuildFromCodeDeps {
  openRecord: (record: LocalFsHandleRecord) => Promise<unknown>;
  /** Called with the project root, never the vault. */
  handoff: (location: ProjectVaultLocation) => void;
}

const IDLE: BuildFromCodeState = {
  stage: 'idle',
  location: null,
  reusesExisting: false,
  pickedMapFolder: false,
  errorText: null,
};

export function useBuildFromCode({ openRecord, handoff }: BuildFromCodeDeps) {
  const [state, setState] = useState<BuildFromCodeState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const chooseProject = useCallback(async () => {
    if (!isTauriVaultRuntime()) return;
    setState({ ...IDLE, stage: 'choosing' });
    try {
      /* The default title asks for a vault, which the person does not have in this flow. */
      const handle = await pickTauriVaultDirectory(PROJECT_PICKER_TITLE);
      if (!handle) {
        setState(IDLE);
        return;
      }
      const picked = getTauriVaultRootPath(handle) ?? null;
      const pickedMapFolder = pickedTheMapFolder(picked);
      const location = projectVaultLocation(
        pickedMapFolder ? (picked ?? '').replace(/[/\\]+[^/\\]+$/, '') : picked,
      );
      if (!location) {
        setState({ ...IDLE, errorText: '' });
        return;
      }
      // Listing is a read, so it needs no consent, and it decides between create and reuse copy.
      let reusesExisting = false;
      try {
        reusesExisting = projectAlreadyHasVault(await listTauriDirectoryNames(location.projectRoot));
      } catch {
        // An unreadable project is not fatal: confirm still shows the path, and the create below
        // surfaces a permission problem.
      }
      setState({ stage: 'confirm', location, reusesExisting, pickedMapFolder, errorText: null });
    } catch (error) {
      setState({ ...IDLE, errorText: failureCodeOrEmpty(error) });
    }
  }, []);

  /** Reachable only from `confirm`. */
  const confirm = useCallback(async () => {
    const location = state.location;
    if (!location || state.stage !== 'confirm') return;
    setState((s) => ({ ...s, stage: 'creating', errorText: null }));
    try {
      await ensureTauriChildDirectory(location.projectRoot, PROJECT_VAULT_DIR);
      const now = Date.now();
      await openRecord({
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle: createTauriVaultHandle(location.vaultRoot),
        desktopRootPath: location.vaultRoot,
        name: PROJECT_VAULT_DIR,
        createdAt: now,
        lastAccessedAt: now,
      });
      handoff(location);
      setState(IDLE);
    } catch (error) {
      // Staying on `confirm` keeps the path and button, so a fixable failure is one press from retry.
      setState((s) => ({ ...s, stage: 'confirm', errorText: failureCodeOrEmpty(error) }));
    }
  }, [state.location, state.stage, openRecord, handoff]);

  return { ...state, chooseProject, confirm, reset };
}

/** Never the thrown English, which cannot know the reader's language. */
function failureCodeOrEmpty(error: unknown): string {
  return failureCodeOf(error) ?? '';
}
