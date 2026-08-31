import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The banner must never print an empty pair of brackets.**
 *
 * ⚠️ Census state 1c, 2026-08-31. `vaultStatus.errorBanner` interpolated
 * `localVault.errorMessage ?? ''`, and `path-missing` deliberately carries **no** cause string, so
 * the desktop banner read "Workspace folder is unavailable ()." with the explanation missing. The
 * web hit the opposite face of the same defect: the browser's own `NotFoundError` sentence, in
 * English and written for a developer, filled those brackets on a Korean screen.
 *
 * `DocsVaultPage` is a whole route surface with a vault provider, a manifest, a tree and a
 * renderer behind it, so mounting it to observe one banner line costs far more than the fact
 * proved. What must not come back is the **shape**: a message interpolated with a fallback that
 * can be empty. The branch is the same one `AppSettingsMenu.test.tsx` exercises by rendering, and
 * `classify-vault-access-error.test.ts` proves the classification that feeds it.
 */
const SOURCE = readFileSync(
  join(import.meta.dirname, 'DocsVaultPage.tsx'),
  'utf8',
);

describe('DocsVaultPage vault-status banner', () => {
  it('reads the source it is judging', () => {
    expect(SOURCE).toContain("t('vaultStatus.errorBanner'");
  });

  it('never interpolates a cause that may not exist', () => {
    expect(SOURCE).not.toContain('localVault.errorMessage ?? \'\'');
    // The remaining interpolation is guarded by the value itself being present.
    expect(SOURCE).toContain(
      "localVault.errorMessage\n                      ? t('vaultStatus.errorBanner', { message: localVault.errorMessage })",
    );
  });

  it('gives the two coded failures their own finished sentence', () => {
    expect(SOURCE).toContain("t('vaultStatus.pathMissingBanner')");
    expect(SOURCE).toContain("t('vaultStatus.permissionDeniedBanner')");
    // And a failure that came back with nothing to say still says something.
    expect(SOURCE).toContain("t('vaultStatus.unknownErrorBanner')");
  });
});
