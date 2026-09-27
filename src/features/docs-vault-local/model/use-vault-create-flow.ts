import { useCallback, useState } from 'react';
import { failureCodeOf } from '@/shared/lib/failure-code';
import type { VaultShape } from '@/shared/lib/vault-shape';
import type { VaultOpenOptions, VaultOpenResult } from '@/entities/vault-session';

/**
 * The narrow part of `useLocalVault()` this hook needs, so a test double can supply it.
 */
export interface VaultCreateFlowVault {
  status: string;
  open: (options?: VaultOpenOptions) => Promise<VaultOpenResult>;
}

/**
 * Reports after the folder opened. The installed app unmounts the pressing screen as the open
 * begins, so a swapped-away host passes these and speaks through a toast; a host that stays
 * mounted (the INDEX starter card) omits them and reads `actionError`.
 */
export interface CreationReport {
  /** The folder opened but its starter failed; the raw failure, for the screen to translate. */
  starterFailed?: (error: unknown) => void;
}

/**
 * Creates a new vault: one `open({ starter })` call, because a second step waiting for a later
 * render never runs on the installed app (see `CreationReport`). The session seeds an empty folder
 * and leaves one with documents untouched. `starterLocale` keeps every entry path in the
 * screen's language.
 */
export function useVaultCreateFlow(
  vault: VaultCreateFlowVault,
  starterLocale: string,
  report: CreationReport = {},
) {
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { starterFailed } = report;

  /** `null` keeps the full starter. */
  const handleCreate = useCallback(async (chosen: VaultShape | null = null) => {
    setActionError(null);
    setCreating(true);
    try {
      const result = await vault.open({ starter: { locale: starterLocale, shape: chosen ?? undefined } });
      // A cancel or a failed read is the session's to say (its own error state).
      if (!result.opened) return;
      if (result.starterError !== null) {
        /*
         * A failure code, not a sentence: `''` means nothing more specific; anything else is looked
         * up in `failures`.
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
    /** The chosen folder is being read and seeded; the picker itself is not. */
    scaffolding: creating && vault.status === 'loading',
    actionError,
    setActionError,
  };
}
