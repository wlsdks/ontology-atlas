import type React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { VaultOpenGuideSheet } from './VaultOpenGuideSheet';

/**
 * **첫 실행 카드가 세는 숫자와 그리는 개수가 같아야 한다** — 그리고 브라우저에서만
 * 참인 문장이 설치된 앱에 나오면 안 된다.
 *
 * ## 무엇이 났나 (2026-08-08, 설치된 앱 실측)
 *
 * 새로 빌드해 설치한 앱의 첫 화면에서 두 가지가 잡혔다:
 *
 * 1. 머리글이 「딱 **세 가지만** 알아두세요」인데 항목이 **넷**이었다. 2026-07-24 에
 *    브라우저 허용 안내(넷째)를 더하면서 이 줄을 안 고친 것이다 — 그 뒤로 줄곧
 *    셋이라 말하고 넷을 보여 줬다.
 * 2. 그 넷째가 「고르고 나면 **브라우저가** '허용'을 물어요」인데 조건 없이
 *    그려졌다. 설치된 앱은 OS 폴더창을 열고 그런 확인창이 없다. 같은 카드의
 *    머리글은 이미 「OS 폴더 선택창」이라고 맞게 적혀 있어 **한 카드가 스스로와
 *    어긋났다**.
 *
 * ## 왜 기존 시험이 못 잡았나
 *
 * 옆의 `VaultOpenGuideSheet.test.tsx` 는 `useTranslations` 를 **키를 그대로
 * 돌려주도록 목킹**한다. 그래서 문구를 아예 보지 않고, 개수 불일치도 런타임 조건도
 * 시야 밖이다. 이 파일은 **실제 카탈로그**를 넣고 렌더한다 — 목킹이 가린 층이
 * 정확히 결함이 살던 층이었다.
 *
 * 숫자를 여기 베껴 적지 않는다: 머리글에서 숫자를 **뽑아내** 실제로 그려진
 * 항목 수와 비교한다. 항목이 늘거나 런타임에 따라 줄어도 저절로 맞는다
 * (`DownloadPage` 캡션이 자기가 그리는 그래프와 같아야 하는 것과 같은 방식).
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

/** 머리글에서 숫자를 뽑는다 — 「딱 4가지만」 · "just 4 things" 둘 다. */
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
      // 공회전 차단 — 항목이 0개면 아래 비교가 아무것도 증명하지 않는다.
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
      // 브라우저에서만 참인 문장은 앱에 없다.
      expect(
        screen.getByRole('dialog').textContent,
        '설치된 앱에서 「브라우저가 허용을 묻는다」고 말하고 있다 — 앱은 OS 폴더창을 연다',
      ).not.toMatch(/브라우저|browser/i);
      // 그리고 머리글의 숫자가 줄어든 개수를 따라간다.
      expect(subtitleCount()).toBe(drawn);
    });
  }

  /**
   * 계기가 살아 있는지 — 두 런타임이 **실제로 다른 개수**를 그리는가. 같은 값이면
   * 위 두 시험이 같은 상태를 두 번 재는 셈이고, 런타임 분기는 아무것도 안 하는
   * 것이 된다.
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
