import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The banner must never print an empty pair of brackets: `path-missing` carries no cause, and a
 * browser's English error must not fill them on a Korean screen. Reads the source because
 * mounting the whole route costs more than the fact; `AppSettingsMenu.test.tsx` renders the branch.
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
    expect(SOURCE).toContain(
      "localVault.errorMessage\n                      ? t('vaultStatus.errorBanner', { message: localVault.errorMessage })",
    );
  });

  it('gives the two coded failures their own finished sentence', () => {
    expect(SOURCE).toContain("t('vaultStatus.pathMissingBanner')");
    expect(SOURCE).toContain("t('vaultStatus.permissionDeniedBanner')");
    expect(SOURCE).toContain("t('vaultStatus.unknownErrorBanner')");
  });
});
