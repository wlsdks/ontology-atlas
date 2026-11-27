import type React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { VaultOpenGuideSheet } from './VaultOpenGuideSheet';

/**
 * The subtitle's count must equal the items drawn, and no sentence may promise the permission
 * prompt of a browser picker, which the app's own folder window never shows. Renders with the real
 * catalogue, because the neighbouring test mocks `useTranslations` to return keys. The count is
 * extracted, not copied.
 */

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

describe('first-run folder guide card', () => {
  for (const locale of ['ko', 'en'] as const) {
    it(`${locale} header count equals the drawn item count`, () => {
      renderSheet(locale);
      const drawn = bulletCount();
      expect(drawn, 'no bullet was drawn, so this test proves nothing').toBeGreaterThan(1);
      expect(
        subtitleCount(),
        `header says ${subtitleCount()} but ${drawn} items were drawn`,
      ).toBe(drawn);
    });

    it(`${locale} mentions no browser permission prompt`, () => {
      renderSheet(locale);
      expect(
        screen.getByRole('dialog').textContent,
        'the guide mentions the browser permission prompt',
      ).not.toMatch(/브라우저|browser/i);
    });
  }
});
