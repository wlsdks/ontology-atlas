import { describe, expect, it } from 'vitest';
import { getStarterRecovery } from './starter-recovery-store';

describe('starter recovery across screens', () => {
  it('recovers a failed operation when the same folder is visited again', () => {
    const folder = {};
    const leaving = getStarterRecovery(folder);
    leaving.begin();
    leaving.fail();
    const returning = getStarterRecovery(folder);
    expect(returning.read()).toBe('failed');
    expect(returning.begin()).toBe(true);
    returning.clear();
    expect(getStarterRecovery(folder).read()).toBe('idle');
  });

  it('keeps earlier operations separate from another folder and from no folder', () => {
    const first = getStarterRecovery({ name: 'ontology' });
    const second = getStarterRecovery({ name: 'ontology' });
    first.begin();
    second.begin();
    first.fail();
    expect(second.read()).toBe('creating');
    expect(getStarterRecovery(null).read()).toBe('idle');
  });

  it('refuses a second creation while the same folder is being written', () => {
    const folder = {};
    expect(getStarterRecovery(folder).begin()).toBe(true);
    expect(getStarterRecovery(folder).begin()).toBe(false);
  });
});
