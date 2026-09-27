import type React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { VaultOpenGuideSheet } from './VaultOpenGuideSheet';

/**
 * **The number the first-run card states must equal the number it draws** — and a sentence that is
 * true only in a browser must not appear in the installed app.
 *
 * ## What happened (measured 2026-08-08 in the installed app)
 *
 * Two things showed up on the first screen of a freshly built and installed app:
 *
 * 1. The subtitle said "just **three things** to know" while there were **four** items. The browser
 *    permission notice (the fourth) was added on 2026-07-24 without updating that line — ever since,
 *    it said three and showed four.
 * 2. That fourth said "once you pick, **the browser** asks to allow", drawn unconditionally. The
 *    installed app opens an OS folder window and has no such prompt. The same card's subtitle
 *    already correctly said "the OS folder picker", so **one card contradicted itself**.
 *
 * ## Why the existing test missed it
 *
 * The neighbouring `VaultOpenGuideSheet.test.tsx` mocks `useTranslations` **to return the key
 * verbatim**. So it never looks at the copy at all, and both the count mismatch and the runtime
 * condition are outside its view. This file renders with **the real catalogue** — the layer the
 * mock hid was exactly the layer the defect lived in.
 *
 * The number is not copied in here: it is **extracted** from the subtitle and compared against the
 * items actually drawn. It stays right as items are added or drop out at runtime (the same way
 * `DownloadPage`'s caption must equal the graph it draws).
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

/** Extracts the number from the subtitle — both 「Exactly 4 things」 and "just 4 things". */
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
    // Anti-idling: with zero items the comparison below proves nothing.
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
      // A sentence true only in a browser is absent from the app.
      expect(
        screen.getByRole('dialog').textContent,
        'the installed app mentions the browser permission prompt',
      ).not.toMatch(/브라우저|browser/i);
      // And the subtitle's number follows the reduced count.
      expect(subtitleCount()).toBe(drawn);
    });
  }

  /**
   * Is the instrument alive — do the two runtimes really draw **different counts**? If they were
   * equal, the two tests above would be measuring one state twice and the runtime branch would be
   * doing nothing.
   */
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
