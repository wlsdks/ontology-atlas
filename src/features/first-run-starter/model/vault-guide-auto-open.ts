/**
 * First-visit folder-first onboarding (owner instruction 2026-07-24): "when the
 * first screen opens with no folder selected, it should start by prompting for a
 * folder. Provide a skip."
 *
 * On a first visit (sample mode settled and this flag unrecorded) the guidance sheet
 * (`VaultOpenGuideSheet`) auto-opens once. Pressing its "later" (skip) closes it and
 * the automatic guided tour (HomePage) takes over from there — the tour's
 * stacked-transient guard defers firing while the sheet is open, so the order is
 * naturally "folder prompt → (if skipped) tour".
 *
 * Why localStorage (permanent): pressing for a folder is enough once, at the first
 * meeting. Pushing it every session blocks a user who only wants to look around. The
 * manual path (pressing the folder CTA opens the same sheet) always remains.
 */
import { readGuideAutoStart } from '@/shared/lib/guide-auto-start';

const VAULT_GUIDE_AUTO_OPENED_KEY = 'vault-open-guide:auto:v1';

export function readVaultGuideAutoOpened(
  key: string = VAULT_GUIDE_AUTO_OPENED_KEY,
): boolean {
  if (typeof window === 'undefined') return true;
  /*
   * The global "auto-display" switch covers **this sheet too** (2026-08-02, owner
   * report: "It keeps appearing, which is annoying while testing).
   *
   * That switch used to cover only the map tour and the five destination guides
   * while this sheet looked at its own key alone. So with guidance turned off in
   * settings, the sheet still appeared on a first screen with no folder — **a rule
   * with too short a reach is the same as no rule**. That is also why this verdict
   * moved down to `shared/lib`: two features must look at the same switch, and FSD
   * forbids a feature→feature import.
   */
  if (!readGuideAutoStart()) return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private mode — give up on auto-opening (treated as true) to avoid pressing repeatedly.
    return true;
  }
}

export function writeVaultGuideAutoOpened(
  key: string = VAULT_GUIDE_AUTO_OPENED_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode — skip */
  }
}
