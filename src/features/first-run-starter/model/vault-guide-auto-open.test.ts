import { beforeEach, describe, expect, it } from 'vitest';

import { readVaultGuideAutoOpened } from './vault-guide-auto-open';

describe('global auto-show switch scope', () => {
  /*
   * Without this gate, a newly added guide ignores the auto-display switch.
   */
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('auto-opens when the switch is on and the guide is unseen', () => {
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '1');
    expect(readVaultGuideAutoOpened()).toBe(false);
  });

  it('does not auto-open the folder-first sheet when the switch is off', () => {
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '0');
    // Treated as already opened, so not auto-displayed.
    expect(readVaultGuideAutoOpened()).toBe(true);
  });

  it('does not auto-open by default with no stored value', () => {
    expect(readVaultGuideAutoOpened()).toBe(true);
  });
});
