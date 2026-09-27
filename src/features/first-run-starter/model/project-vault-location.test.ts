import { describe, expect, it } from 'vitest';

import {
  projectAlreadyHasVault,
  projectVaultLocation,
} from './project-vault-location';

/** The path shown before anything is created must be the path that is created. */
describe('project vault location shown equals the path created', () => {
  it('places the atlas folder directly under the chosen project', () => {
    const location = projectVaultLocation('/Users/dana/my-product');
    expect(location?.projectRoot).toBe('/Users/dana/my-product');
    expect(location?.vaultRoot).toBe('/Users/dana/my-product/atlas');
    // The screen shows this string and the create uses that path.
    expect(location?.displayPath).toBe(location?.vaultRoot);
  });

  it('does not produce a doubled separator from a trailing one', () => {
    // `…/my-product//atlas` is the same folder but does not match what a shell prints.
    expect(projectVaultLocation('/Users/dana/my-product/')?.vaultRoot).toBe(
      '/Users/dana/my-product/atlas',
    );
    expect(projectVaultLocation('/Users/dana/my-product///')?.vaultRoot).toBe(
      '/Users/dana/my-product/atlas',
    );
  });

  it('returns no path without a chosen project', () => {
    // A location invented from no choice would ask the person to confirm something nobody picked.
    for (const nothing of [null, undefined, '', '   ', '/']) {
      expect(projectVaultLocation(nothing), `invented a path for ${String(nothing)}`).toBeNull();
    }
  });


  it('recognises an existing folder as continue rather than create', () => {
    expect(projectAlreadyHasVault(['src', 'atlas', 'package.json'])).toBe(true);
    expect(projectAlreadyHasVault(['src', 'package.json'])).toBe(false);
    // Not a prefix match: a project of its own named `atlas-viewer` has no map in it.
    expect(projectAlreadyHasVault(['atlas-viewer', 'atlasrc'])).toBe(false);
  });
});
