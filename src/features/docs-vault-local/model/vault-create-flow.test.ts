import { describe, expect, it } from 'vitest';
import { shouldClearCreateIntent, shouldScaffoldAfterOpen } from './vault-create-flow';

describe('shouldScaffoldAfterOpen', () => {
  it('scaffolds only when create intent opened an empty vault', () => {
    expect(
      shouldScaffoldAfterOpen({ createIntent: true, status: 'loaded', docCount: 0 }),
    ).toBe(true);
  });

  it('never scaffolds a vault that already has docs', () => {
    expect(
      shouldScaffoldAfterOpen({ createIntent: true, status: 'loaded', docCount: 3 }),
    ).toBe(false);
  });

  it('never scaffolds without create intent (plain open)', () => {
    expect(
      shouldScaffoldAfterOpen({ createIntent: false, status: 'loaded', docCount: 0 }),
    ).toBe(false);
  });

  it('waits until the vault is loaded', () => {
    expect(
      shouldScaffoldAfterOpen({ createIntent: true, status: 'opening', docCount: null }),
    ).toBe(false);
    expect(
      shouldScaffoldAfterOpen({ createIntent: true, status: 'error', docCount: null }),
    ).toBe(false);
  });
});

describe('shouldClearCreateIntent', () => {
  it('keeps intent while the picker/build is in flight', () => {
    expect(shouldClearCreateIntent('opening')).toBe(false);
    expect(shouldClearCreateIntent('loading')).toBe(false);
  });

  it('clears intent once open settles (loaded, cancel back to idle, or error)', () => {
    expect(shouldClearCreateIntent('loaded')).toBe(true);
    expect(shouldClearCreateIntent('idle')).toBe(true);
    expect(shouldClearCreateIntent('error')).toBe(true);
  });
});
