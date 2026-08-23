'use client';

import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';

/**
 * **Is this the moment the first-visit automatic tour may be raised?**
 *
 * Owner confirmation (2026-07-26): "The seven-step tour should appear after choosing a folder or at least
 * connecting) — i.e. **after** the folder guidance is the right order. But measured,
 * one of the two paths turned out to be blocked entirely.
 *
 * The old condition was `restoreAttempted && mode === 'static'` alone. That means
 * "settled onto the sample map", so **a user who chose a folder never received the
 * tour at all** — choosing a folder switches to local mode and makes the condition
 * false. And yet the map, INDEX, and datasheet the tour explains are the same screen
 * in both modes.
 *
 * So the verdict becomes "has it **settled**, either way":
 *
 * - Sample: a vault restore was attempted and the result is static.
 * - My folder: the vault actually loaded.
 *
 * Neither means the mode is still in transition, so it is not raised — firing then
 * puts a card over a blank screen before the map is drawn.
 *
 * Sample-only steps (the `first-run-starter` anchor) are skipped automatically by
 * `computeVisibleSteps` when the anchor fails to resolve — nothing points at something
 * absent in my-folder mode.
 */
export function useGuidedTourAutoStartReady(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  if (mode === 'local') return vault.status === 'loaded';
  return vault.restoreAttempted;
}
