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

describe('첫 실행 폴더 안내 카드 — 세는 숫자와 그리는 개수', () => {
  for (const locale of ['ko', 'en'] as const) {
    it(`${locale} 웹 — 머리글의 숫자가 실제 항목 수와 같다`, () => {
      renderSheet(locale);
      const drawn = bulletCount();
    // Anti-idling: with zero items the comparison below proves nothing.
      expect(drawn, '불릿이 하나도 안 그려졌다 — 이 시험이 헛돈다').toBeGreaterThan(2);
      expect(
        subtitleCount(),
        `머리글은 ${subtitleCount()}가지라고 말하는데 화면에는 ${drawn}개가 그려졌다`,
      ).toBe(drawn);
    });

    it(`${locale} 설치된 앱 — 브라우저 허용 안내가 사라지고 숫자도 따라 줄어든다`, () => {
      isDesktopShell.mockReturnValue(true);
      renderSheet(locale);
      const drawn = bulletCount();
      expect(drawn, '앱에서도 안내는 남아야 한다 — 통째로 사라지면 안 된다').toBeGreaterThan(1);
      // A sentence true only in a browser is absent from the app.
      expect(
        screen.getByRole('dialog').textContent,
        '설치된 앱에서 「브라우저가 허용을 묻는다」고 말하고 있다 — 앱은 OS 폴더창을 연다',
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
  it('계기가 살아 있다 — 웹과 앱이 그리는 항목 수가 다르다', () => {
    isDesktopShell.mockReturnValue(false);
    const web = renderSheet('ko');
    const webCount = bulletCount();
    web.unmount();

    isDesktopShell.mockReturnValue(true);
    renderSheet('ko');
    const appCount = bulletCount();

    expect(webCount, '웹이 앱보다 항목이 많아야 한다(브라우저 전용 한 줄)').toBe(appCount + 1);
  });
});
