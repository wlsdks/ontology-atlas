import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGACY_UNSCOPED_READ_AT_KEY,
  forgetLegacyUnscopedReadAt,
  readAtStorageKey,
  readReadAt,
  writeReadAt,
} from './read-at-storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('알림 읽음 시각 — 볼트별 자리', () => {
  it('키에 볼트가 들어간다', () => {
    expect(readAtStorageKey('local:alpha')).toBe('atlas.agentActivity.readAt:local:alpha');
  });

  /**
   * **This test locks the defect.** There used to be one global key, so opening the bell in one vault
   * marked another vault's unseen items as read.
   */
  it('한 볼트에서 읽음 처리해도 다른 볼트는 그대로다', () => {
    writeReadAt('local:alpha', 1_700_000_000_000);

    expect(readReadAt('local:alpha')).toBe(1_700_000_000_000);
    expect(readReadAt('local:bravo')).toBe(0);
  });

  it('샘플 둘도 서로 다른 자리다 — vaultScopeKey 가 뭉뚱그리는 바로 그 축', () => {
    writeReadAt('sample:dogfood', 42);

    expect(readReadAt('sample:dogfood')).toBe(42);
    expect(readReadAt('sample:storefront')).toBe(0);
  });

  it('옛 전역 키는 읽지 않는다 — 어느 볼트 것인지 알 수 없다', () => {
    window.localStorage.setItem(LEGACY_UNSCOPED_READ_AT_KEY, '999');

    expect(readReadAt('local:alpha')).toBe(0);
  });

  it('옛 전역 키는 한 번 치운다', () => {
    window.localStorage.setItem(LEGACY_UNSCOPED_READ_AT_KEY, '999');
    forgetLegacyUnscopedReadAt();

    expect(window.localStorage.getItem(LEGACY_UNSCOPED_READ_AT_KEY)).toBeNull();
  });
});
