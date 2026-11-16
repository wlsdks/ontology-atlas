import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import { useSettingsTriggerLabel } from './use-settings-trigger-label';

let pending: { pendingVersion: string | null; readyVersion: string | null } = {
  pendingVersion: null,
  readyVersion: null,
};

vi.mock('@/features/app-update', () => ({
  usePendingUpdate: () => pending,
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ko" messages={ko}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('useSettingsTriggerLabel', () => {
  it.each([
    ['nothing pending', null, null, [ko.nav.settingsMenu.triggerAria], ['2.1.0']],
    ['an offered version', '2.1.0', null, ['2.1.0', '새 버전'], ['설치됨']],
    ['an installed version', '2.1.0', '2.1.0', ['2.1.0', '설치됨', '다시 시작'], []],
  ] as const)('names %s in the trigger name', (_, pendingVersion, readyVersion, present, absent) => {
    pending = { pendingVersion, readyVersion };
    const { result } = renderHook(() => useSettingsTriggerLabel(), { wrapper });
    expect(result.current.label.startsWith(ko.nav.settingsMenu.triggerAria)).toBe(true);
    for (const text of present) expect(result.current.label).toContain(text);
    for (const text of absent) expect(result.current.label).not.toContain(text);
  });
});
