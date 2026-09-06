import { useCallback, useEffect, useState } from 'react';
import type { VaultShape } from '@/shared/lib/vault-shape';
import { shouldClearCreateIntent, shouldScaffoldAfterOpen } from './vault-create-flow';

/**
 * Minimal shape this hook needs from `useLocalVault()` — kept narrow so any
 * caller (real hook or a test double) can supply it without importing the
 * full `LocalVaultValue` type.
 */
export interface VaultCreateFlowVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  open: () => Promise<void>;
  scaffoldOntology: (starterLocale: string, shape?: VaultShape) => Promise<{ created: number; skipped: number }>;
}

/**
 * The "create a new vault" action — after folder selection (open), an empty folder is seeded with the
 * starter (scaffoldOntology). `FirstRunPage` (desktop first run) and `FirstRunChooser` (the web's
 * root-first-open) reuse it identically — zero new pipeline, with the decision logic living as pure
 * functions in `vault-create-flow.ts`.
 *
 * The caller passes the screen's language as `starterLocale` — the same "create a new vault" must not
 * produce a vault in a different language depending on the entry path (walkthrough 2026-07-26).
 */
export function useVaultCreateFlow(vault: VaultCreateFlowVault, starterLocale: string) {
  const [createArmed, setCreateArmed] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** What the person said the folder will hold; `null` keeps the full starter. */
  const [shape, setShape] = useState<VaultShape | null>(null);
  const handleCreate = useCallback(async (chosen: VaultShape | null = null) => {
    setShape(chosen);
    setActionError(null);
    await vault.open();
    // open() resolves after the picker + manifest build settled (or the
    // user cancelled) — arming here avoids racing the status flip.
    setCreateArmed(true);
  }, [vault]);

  useEffect(() => {
    if (!createArmed) return;
    const status = vault.status;
    const docCount = vault.manifest ? vault.manifest.docs.length : null;
    // Deferred to a microtask to avoid a synchronous setState straight after render — the decision
    // inputs are pinned to the values at the time this effect ran.
    queueMicrotask(() => {
      if (shouldScaffoldAfterOpen({ createIntent: true, status, docCount })) {
        setCreateArmed(false);
        setScaffolding(true);
        (shape ? vault.scaffoldOntology(starterLocale, shape) : vault.scaffoldOntology(starterLocale))
          .catch((err: unknown) => {
            // `''` (rather than null) marks "an error occurred but there is no message", so the caller
            // (FirstRunPage and the like) can fill in a locale-specific fallback. null means no error.
            setActionError(err instanceof Error && err.message ? err.message : '');
          })
          .finally(() => setScaffolding(false));
        return;
      }
      if (shouldClearCreateIntent(status)) {
        setCreateArmed(false);
      }
    });
  }, [createArmed, shape, starterLocale, vault, vault.manifest, vault.status]);

  return { handleCreate, scaffolding, actionError, setActionError };
}
