import { describe, expect, it } from 'vitest';
import { getDataSourceMode } from './data-source-mode';

describe('getDataSourceMode', () => {
  it('vault loaded gives local (the user disk is the source of truth)', () => {
    expect(getDataSourceMode({ vaultLoaded: true })).toBe('local');
  });

  it('no folder open gives no-folder (the first-run and restoring state)', () => {
    expect(getDataSourceMode({ vaultLoaded: false })).toBe('no-folder');
  });
});
