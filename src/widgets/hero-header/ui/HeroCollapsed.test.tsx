import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { HeroCollapsed } from './HeroCollapsed';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderWithLocale(locale: 'ko' | 'en', ui: React.ReactElement) {
  const messages = locale === 'ko' ? koMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('HeroCollapsed', () => {
  it('does not show a SAMPLE badge by default', () => {
    renderWithLocale('ko', <HeroCollapsed />);
    expect(screen.queryByTestId('hero-sample-badge')).not.toBeInTheDocument();
  });

  it('shows a SAMPLE badge when sampleBadge is set (static/no-vault mode)', () => {
    renderWithLocale('ko', <HeroCollapsed sampleBadge />);
    expect(screen.getByTestId('hero-sample-badge')).toBeInTheDocument();
  });

  it('hides the SAMPLE badge in compact mode (no room for it)', () => {
    renderWithLocale('ko', <HeroCollapsed sampleBadge compact />);
    expect(screen.queryByTestId('hero-sample-badge')).not.toBeInTheDocument();
  });
});

/**
 * HomePage 의 실제 census 조립(`workspace.subtitle` t.rich + engraved-numeral
 * <b>)을 재현하는 얇은 harness — HeroCollapsed 자체는 t.rich 를 호출하지
 * 않고 이미 렌더된 ReactNode 를 subtitle prop 으로 받기만 하므로, 실제
 * 소비 지점(HomePage)과 같은 조립 방식으로 렌더해야 카피 정합을 검증한다.
 */
function CensusSubtitleHarness({ concepts, relations }: { concepts: number; relations: number }) {
  const t = useTranslations('topology');
  const subtitle = t.rich('workspace.subtitle', {
    concepts,
    relations,
    growth: '',
    b: (chunks) => <b data-testid="census-numeral">{chunks}</b>,
  });
  return <HeroCollapsed subtitle={subtitle} subtitleVariant="census" title="ontology-atlas" />;
}

describe('HeroCollapsed — census 세그먼트 각인 (feat/chrome-finish)', () => {
  it('ko: 개념/관계 숫자 두 세그먼트가 각각 <b> 로 감싸진다', () => {
    renderWithLocale('ko', <CensusSubtitleHarness concepts={289} relations={483} />);
    const numerals = screen.getAllByTestId('census-numeral');
    expect(numerals).toHaveLength(2);
    expect(numerals[0]).toHaveTextContent('289');
    expect(numerals[1]).toHaveTextContent('483');
    expect(screen.getByText(/개념/)).toBeInTheDocument();
    expect(screen.getByText(/관계/)).toBeInTheDocument();
  });

  it('en: 개념/관계 숫자 두 세그먼트가 각각 <b> 로 감싸진다', () => {
    renderWithLocale('en', <CensusSubtitleHarness concepts={289} relations={483} />);
    const numerals = screen.getAllByTestId('census-numeral');
    expect(numerals).toHaveLength(2);
    expect(numerals[0]).toHaveTextContent('289');
    expect(numerals[1]).toHaveTextContent('483');
    expect(screen.getByText(/concepts/)).toBeInTheDocument();
    expect(screen.getByText(/relations/)).toBeInTheDocument();
  });
});
