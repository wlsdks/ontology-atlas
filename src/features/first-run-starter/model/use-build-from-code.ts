'use client';

import { useCallback, useState } from 'react';

import { CURRENT_LOCAL_FS_HANDLE_ID, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { failureCodeOf } from '@/shared/lib/failure-code';
import {
  createTauriVaultHandle,
  isTauriVaultRuntime,
  listTauriDirectoryNames,
  ensureTauriChildDirectory,
  getTauriVaultRootPath,
  pickTauriVaultDirectory,
} from '@/shared/lib/tauri-vault-fs';

import {
  PROJECT_VAULT_DIR,
  pickedTheMapFolder,
  projectAlreadyHasVault,
  projectVaultLocation,
  type ProjectVaultLocation,
} from './project-vault-location';

/**
 * The 「make a map from my code」 flow: choose a project, see the path, then create. The folder
 * goes into the person's repository, so nothing is created until `confirm` runs from a screen
 * that showed `location.displayPath` (`local-first.md`). An existing `atlas` folder is reused
 * and reported, never overwritten.
 */
/**
 * English because it is an OS dialog title and the surrounding native chrome is not localised.
 */
const PROJECT_PICKER_TITLE = 'Choose your project folder';

type BuildFromCodeStage = 'idle' | 'choosing' | 'confirm' | 'creating';

export interface BuildFromCodeState {
  stage: BuildFromCodeStage;
  /** The screen must render `displayPath` before offering `confirm`. */
  location: ProjectVaultLocation | null;
  /** So the copy says "use" rather than "create". */
  reusesExisting: boolean;
  /** The map folder itself was picked; the flow names it and proposes the parent. */
  pickedMapFolder: boolean;
  errorText: string | null;
}

export interface BuildFromCodeDeps {
  /** Registers and loads a vault without reopening a picker. */
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

  /**
   * Picks the project, not a vault. A cancelled picker returns to idle without an error.
   */
  const chooseProject = useCallback(async () => {
    if (!isTauriVaultRuntime()) return;
    setState({ ...IDLE, stage: 'choosing' });
    try {
      /*
       * The default title asks for a vault, which the person does not have in this flow.
       */
      const handle = await pickTauriVaultDirectory(PROJECT_PICKER_TITLE);
      if (!handle) {
        setState(IDLE);
        return;
      }
      const picked = getTauriVaultRootPath(handle) ?? null;
      // Handed the map instead of the project: step up one and say so.
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
    } catch (err) {
      setState({ ...IDLE, errorText: messageOf(err) });
    }
  }, []);

  /**
   * Creates `<project>/atlas`, opens it and hands off to the agent. Reachable only from `confirm`.
   */
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
    } catch (err) {
      // Staying on `confirm` keeps the path and button, so a fixable failure is one press from retry.
      setState((s) => ({ ...s, stage: 'confirm', errorText: messageOf(err) }));
    }
  }, [state.location, state.stage, openRecord, handoff]);

  return { ...state, chooseProject, confirm, reset };
}

/**
 * A failure code for the screen, or `''` when nothing recognised it. Never the thrown English,
 * which cannot know the reader's language.
 */
function messageOf(err: unknown): string {
  return failureCodeOf(err) ?? '';
}
