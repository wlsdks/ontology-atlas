import { useCallback, useState } from 'react';
import { failureCodeOf } from '@/shared/lib/failure-code';
import type { VaultShape } from '@/shared/lib/vault-shape';
import type { VaultOpenOptions, VaultOpenResult } from '@/entities/vault-session';

/**
 * Minimal shape this hook needs from `useLocalVault()` — kept narrow so any
 * caller (real hook or a test double) can supply it without importing the
 * full `LocalVaultValue` type.
 */
export interface VaultCreateFlowVault {
  status: string;
  open: (options?: VaultOpenOptions) => Promise<VaultOpenResult>;
}

/**
 * What a creation door says once its folder has opened.
 *
 * ⚠️ **By then the screen that pressed the door is usually gone** (2026-09-25, D1). On the
 * installed app the shell swaps the first-run screen for the opening pane as soon as the open
 * begins, and the root entry swaps that for the map, so hook state set afterwards reaches nothing.
 * A host that is swapped away passes these and speaks through something that outlives it (a
 * toast); a host that stays mounted (the INDEX starter card) omits them and reads `actionError`.
 */
export interface CreationReport {
  /** The folder opened but its starter could not be written; the raw failure, for the screen to translate. */
  starterFailed?: (error: unknown) => void;
}

/**
 * The "create a new vault" action — after folder selection, an empty folder is seeded with the
 * starter. `FirstRunPage` (desktop first run) and the web INDEX starter card reuse it identically.
 *
 * It is one call, `open({ starter })`, and not `open()` followed by `scaffoldOntology()`. The second
 * half used to wait for this hook's next render to see the opened folder, and on the installed app
 * that render never happens (see `CreationReport`); the session now writes the starter into an
 * empty folder before showing it, and a folder that already holds documents is left untouched.
 *
 * The caller passes the screen's language as `starterLocale` — the same "create a new vault" must not
 * produce a vault in a different language depending on the entry path (walkthrough 2026-07-26).
 */
export function useVaultCreateFlow(
  vault: VaultCreateFlowVault,
  starterLocale: string,
  report: CreationReport = {},
) {
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { starterFailed } = report;

  /** `chosen` is what the person said the folder will hold; `null` keeps the full starter. */
  const handleCreate = useCallback(async (chosen: VaultShape | null = null) => {
    setActionError(null);
    setCreating(true);
    try {
      const result = await vault.open({ starter: { locale: starterLocale, shape: chosen ?? undefined } });
      // A cancel or a failed read is the session's to say (its own error state).
      if (!result.opened) return;
      if (result.starterError !== null) {
        /*
         * `actionError` carries a **failure code**, not a sentence: `''` means "it failed and
         * there is nothing more specific to say", anything else is looked up in `failures`. It
         * used to be `err.message`, which a Korean screen printed verbatim (v1.2.2, B2).
         */
        if (starterFailed) starterFailed(result.starterError);
        else setActionError(failureCodeOf(result.starterError) ?? '');
      }
    } finally {
      setCreating(false);
    }
  }, [vault, starterLocale, starterFailed]);

  return {
    handleCreate,
    /** The chosen folder is being read and, when empty, seeded — the picker itself is not this. */
    scaffolding: creating && vault.status === 'loading',
    actionError,
    setActionError,
  };
}
