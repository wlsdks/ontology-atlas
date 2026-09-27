import type React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { VaultOpenGuideSheet } from './VaultOpenGuideSheet';

/**
 * The subtitle's count must equal the items drawn, and a browser-only sentence must not appear
 * in the installed app. Renders with the real catalogue, because the neighbouring test mocks
 * `useTranslations` to return keys. The count is extracted, not copied.
 */

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const isDesktopShell = vi.fn(() => false);
vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => isDesktopShell(),
}));
vi.mock('@/shared/lib/use-hydrated', () => ({ useHydrated: () => true }));

afterEach(() => {
  isDesktopShell.mockReturnValue(false);
});

function renderSheet(locale: 'ko' | 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? koMessages : enMessages}>
      <VaultOpenGuideSheet open onClose={vi.fn()} onPickExisting={vi.fn()} onCreateNew={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

/** Matches both 「Exactly 4 things」 and "just 4 things". */
function subtitleCount(): number | null {
  const dialog = screen.getByRole('dialog');
  const text = dialog.querySelector('header p')?.textContent ?? '';
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function bulletCount(): number {
  return screen.getByRole('dialog').querySelectorAll('ul li').length;
}

describe('first-run folder guide card count against drawn items', () => {
  for (const locale of ['ko', 'en'] as const) {
    it(`${locale} web header count equals the drawn item count`, () => {
      renderSheet(locale);
      const drawn = bulletCount();
      expect(drawn, 'no bullet was drawn, so this test proves nothing').toBeGreaterThan(2);
      expect(
        subtitleCount(),
        `header says ${subtitleCount()} but ${drawn} items were drawn`,
      ).toBe(drawn);
    });

    it(`${locale} installed app drops the browser permission item and the count follows`, () => {
      isDesktopShell.mockReturnValue(true);
      renderSheet(locale);
      const drawn = bulletCount();
      expect(drawn, 'the app must still show the guide items').toBeGreaterThan(1);
      expect(
        screen.getByRole('dialog').textContent,
        'the installed app mentions the browser permission prompt',
      ).not.toMatch(/브라우저|browser/i);
      expect(subtitleCount()).toBe(drawn);
    });
  }

  /** If the counts were equal the runtime branch would be untested. */
  it('draws a different item count on web and app', () => {
    isDesktopShell.mockReturnValue(false);
    const web = renderSheet('ko');
    const webCount = bulletCount();
    web.unmount();

    isDesktopShell.mockReturnValue(true);
    renderSheet('ko');
    const appCount = bulletCount();

    expect(webCount, 'web must draw the browser-only item the app omits').toBe(appCount + 1);
  });
});
