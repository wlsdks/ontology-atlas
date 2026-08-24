'use client';

import { useCallback, useState } from 'react';

import { CURRENT_LOCAL_FS_HANDLE_ID, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
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
  projectAlreadyHasVault,
  projectVaultLocation,
  type ProjectVaultLocation,
} from './project-vault-location';

/**
 * The 「make a map from my code」 flow: choose a project, **see where the folder will go**, then
 * create it.
 *
 * ⚠️ **The middle step is the point** (owner direction, 2026-08-24). The map now lands *inside* the
 * chosen project, which means this feature writes a folder into somebody's repository. A product
 * that creates files in a person's source tree without showing them the path first has taken a
 * decision that was theirs to take, and `local-first.md` is explicit that nothing about their disk
 * happens silently. So `chooseProject` only computes and describes; nothing is created until
 * `confirm` is called from a screen that has shown `location.displayPath`.
 *
 * **An existing folder is reported, not overwritten.** When the project already carries an `atlas`
 * directory this reuses it and says so, because the alternative — quietly writing into a folder
 * whose contents nobody has looked at — is how a person loses work they had already done.
 */
type BuildFromCodeStage = 'idle' | 'choosing' | 'confirm' | 'creating';

export interface BuildFromCodeState {
  stage: BuildFromCodeStage;
  /** Set once a project is chosen; the screen must render `displayPath` before offering `confirm`. */
  location: ProjectVaultLocation | null;
  /** True when the chosen project already has an `atlas` folder, so the copy says "use" not "create". */
  reusesExisting: boolean;
  errorText: string | null;
}

export interface BuildFromCodeDeps {
  /** Registers and loads a vault without reopening a picker — the app's one existing open path. */
  openRecord: (record: LocalFsHandleRecord) => Promise<void>;
  /** Sends the opening turn once the vault is live. Called with the project root, never the vault. */
  handoff: (location: ProjectVaultLocation) => void;
}

const IDLE: BuildFromCodeState = {
  stage: 'idle',
  location: null,
  reusesExisting: false,
  errorText: null,
};

export function useBuildFromCode({ openRecord, handoff }: BuildFromCodeDeps) {
  const [state, setState] = useState<BuildFromCodeState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  /**
   * Opens the folder picker on the **project**, not on a vault.
   *
   * A cancelled picker returns to idle without an error, matching `use-local-vault`'s contract that
   * cancelling is not a failure — an error card for "I changed my mind" is noise.
   */
  const chooseProject = useCallback(async () => {
    if (!isTauriVaultRuntime()) return;
    setState({ ...IDLE, stage: 'choosing' });
    try {
      const handle = await pickTauriVaultDirectory();
      if (!handle) {
        setState(IDLE);
        return;
      }
      const location = projectVaultLocation(getTauriVaultRootPath(handle) ?? null);
      if (!location) {
        setState({ ...IDLE, errorText: '' });
        return;
      }
      // Listing before offering tells the person whether this creates or reuses. It is a read, so it
      // needs no consent, and it is the difference between two very different sentences on screen.
      let reusesExisting = false;
      try {
        reusesExisting = projectAlreadyHasVault(await listTauriDirectoryNames(location.projectRoot));
      } catch {
        // An unreadable project is not fatal here: the confirm step still shows the path, and the
        // create below will surface the real reason if it is a permission problem.
      }
      setState({ stage: 'confirm', location, reusesExisting, errorText: null });
    } catch (err) {
      setState({ ...IDLE, errorText: messageOf(err) });
    }
  }, []);

  /**
   * Creates `<project>/atlas`, opens it as the vault, and hands the work to the agent.
   *
   * Only reachable from the `confirm` stage, so the path in `location` is one the person has seen.
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
      // Staying on `confirm` keeps the path and the button on screen, so a failure that the person
      // can fix — a read-only checkout, a folder they need to unlock — is one press from retrying.
      setState((s) => ({ ...s, stage: 'confirm', errorText: messageOf(err) }));
    }
  }, [state.location, state.stage, openRecord, handoff]);

  return { ...state, chooseProject, confirm, reset };
}

/** `''` means "it failed and there is no sentence to show", which the screen fills in locale-side. */
function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : '';
}
