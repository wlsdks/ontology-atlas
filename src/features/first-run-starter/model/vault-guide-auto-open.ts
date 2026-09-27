/**
 * First-visit folder prompt: in settled sample mode with this flag unrecorded,
 * `VaultOpenGuideSheet` auto-opens once; its skip hands over to the guided tour, whose
 * transient guard waits for the sheet. localStorage because one prompt is enough; the folder CTA
 * always opens the same sheet.
 */
import { readGuideAutoStart } from '@/shared/lib/guide-auto-start';

const VAULT_GUIDE_AUTO_OPENED_KEY = 'vault-open-guide:auto:v1';

export function readVaultGuideAutoOpened(
  key: string = VAULT_GUIDE_AUTO_OPENED_KEY,
): boolean {
  if (typeof window === 'undefined') return true;
  /*
   * The global auto-display switch covers this sheet too; it lives in `shared/lib` because two
   * features read it and FSD forbids a feature-to-feature import.
   */
  if (!readGuideAutoStart()) return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private mode: treat as opened to avoid prompting repeatedly.
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
    /* Private mode: skip. */
  }
}
