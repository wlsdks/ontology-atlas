import { afterEach, describe, expect, it } from 'vitest';
import {
  readFirstRunStarterDismissed,
  writeFirstRunStarterDismissed,
} from './first-run-starter-dismiss';

const KEY = 'test:first-run-starter-dismissed';

describe('first-run-starter-dismiss', () => {
  afterEach(() => {
    window.sessionStorage.removeItem(KEY);
  });

  it('defaults to not-dismissed when nothing is stored', () => {
    expect(readFirstRunStarterDismissed(KEY)).toBe(false);
  });

  it('reports dismissed after writing', () => {
    writeFirstRunStarterDismissed(KEY);
    expect(readFirstRunStarterDismissed(KEY)).toBe(true);
  });

  it('uses sessionStorage, not localStorage — a new session forgets the dismissal', () => {
    writeFirstRunStarterDismissed(KEY);
    expect(window.sessionStorage.getItem(KEY)).toBe('1');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
