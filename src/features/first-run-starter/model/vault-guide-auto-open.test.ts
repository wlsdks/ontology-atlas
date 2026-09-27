import { beforeEach, describe, expect, it } from 'vitest';

import { readVaultGuideAutoOpened } from './vault-guide-auto-open';

describe('global auto-show switch scope', () => {
  /*
   * Before this test existed the switch turned off «five of six guides». The screen
   * said "auto-display off" while still raising the sheet on a first screen with no
   * folder. Without a gate, the same hole reappears the next time a guide is added.
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
    // Treated as "already opened" = not auto-displayed.
    expect(readVaultGuideAutoOpened()).toBe(true);
  });

  it('does not auto-open by default with no stored value', () => {
    expect(readVaultGuideAutoOpened()).toBe(true);
  });
});
