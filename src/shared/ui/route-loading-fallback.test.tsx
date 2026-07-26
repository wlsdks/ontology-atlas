import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import koMessages from '../../../messages/ko.json';
import { RouteLoadingFallback } from './route-loading-fallback';

/**
 * 자리표시자는 두 가지 약속만 지킨다: ① `#main` 랜드마크를 즉시 세운다(포커스
 * 관리자와 스크린리더가 착지할 곳), ② 아는 사실 한 문장만 말한다. 스피너·
 * 진행바·퍼센트는 없다 — 모르는 진행을 아는 척하지 않는다.
 */
function renderFallback() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <RouteLoadingFallback />
    </NextIntlClientProvider>,
  );
}

describe('RouteLoadingFallback', () => {
  it('#main 랜드마크를 세우고 로딩 중임을 표시한다', () => {
    renderFallback();
    const main = screen.getByTestId('route-loading-fallback');
    expect(main.id).toBe('main');
    expect(main.tagName).toBe('MAIN');
    expect(main).toHaveAttribute('aria-busy', 'true');
  });

  it('포커스 관리자가 목적지로 착각하지 않도록 표식을 단다', () => {
    renderFallback();
    expect(screen.getByTestId('route-loading-fallback')).toHaveAttribute(
      'data-route-loading',
      'true',
    );
  });

  it('빈 화면 대신 평문 한 문장을 말한다', () => {
    renderFallback();
    const status = screen.getByRole('status');
    expect(status.textContent?.trim()).toBe(koMessages.nav.surfaceLoading);
  });

  it('가짜 진행 표시(진행바 · 퍼센트)를 그리지 않는다', () => {
    const { container } = renderFallback();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toMatch(/%/);
  });

  it('자막은 400ms 침묵 뒤 등장한다 — 빠른 진입에서 번쩍이지 않는다', () => {
    renderFallback();
    expect(screen.getByRole('status').className).toContain('route-loading-in');
  });
});
