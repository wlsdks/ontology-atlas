import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { HeroCollapsed } from './HeroCollapsed';

/**
 * R6 — 브랜드 pill 의 census 변형(개념/관계 숫자 각인 · 이번 주 성장 · SAMPLE
 * 배지)은 제거됐다(census 는 INDEX 패널/첫 실행 카드로 이관). 남은 계약은 평문
 * eyebrow subtitle 렌더 + 확장 affordance 뿐이라, 이 스위트도 그것만 핀한다.
 */
function renderWithLocale(locale: 'ko' | 'en', ui: React.ReactElement) {
  const messages = locale === 'ko' ? koMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('HeroCollapsed', () => {
  it('평문 eyebrow subtitle 을 렌더한다', () => {
    renderWithLocale('ko', <HeroCollapsed title="지형도" subtitle="선택한 개념" />);
    expect(screen.getByText('지형도')).toBeInTheDocument();
    expect(screen.getByText('선택한 개념')).toBeInTheDocument();
  });

  it('census 잔재를 렌더하지 않는다 — SAMPLE 배지 없음', () => {
    renderWithLocale('ko', <HeroCollapsed title="지형도" subtitle="워크스페이스 지도 펼치기" />);
    expect(screen.queryByTestId('hero-sample-badge')).not.toBeInTheDocument();
  });

  it('onExpand 가 없으면 확장 버튼이 비활성(클릭 불가)', () => {
    renderWithLocale('ko', <HeroCollapsed title="지형도" subtitle="선택한 개념" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('onExpand 가 있으면 활성 버튼', () => {
    renderWithLocale('en', <HeroCollapsed title="Topology" subtitle="Selected concept" onExpand={() => {}} />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
