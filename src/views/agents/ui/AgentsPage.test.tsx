import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import { AgentsPage } from './AgentsPage';

/**
 * 「에이전트」 목적지 — **같은 말을 두 번 하지 않는가.**
 *
 * 2026-08-20 설치 앱 캡처에서 잡혔다: 페이지의 lede 와 패널의 소개 줄이 거의
 * 같은 문장이라 위아래로 겹쳐 섰다. 이 화면이 이미 한 번 겪은 「같은 문장 사본」
 * 결함이고(실행기 목록의 20줄 중 18줄), 카운슬 처방도 「설명 문단 3→1」이었다.
 */
vi.mock('@/widgets/app-settings-menu', () => ({
  AcpRuntimeSettings: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="acp-runtimes" data-embedded={embedded ? 'true' : 'false'} />
  ),
}));

function renderPage() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AgentsPage />
    </NextIntlClientProvider>,
  );
}

describe('에이전트 목적지', () => {
  it('제목과 한 줄 설명을 갖는다', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ko.agents.title);
    expect(screen.getByText(ko.agents.lede)).toBeInTheDocument();
  });

  it('패널에게 자기 소개를 그리지 말라고 말한다 — 페이지가 이미 말했다', () => {
    renderPage();
    expect(screen.getByTestId('acp-runtimes')).toHaveAttribute('data-embedded', 'true');
  });

  it('설명이 헤더 밖에 있다 — 안에 두면 제목 반대쪽 끝으로 밀린다', () => {
    renderPage();
    const heading = screen.getByRole('heading', { level: 1 });
    const lede = screen.getByText(ko.agents.lede);
    const header = heading.closest('header');
    expect(header, '헤더가 없다').not.toBeNull();
    expect(header!.contains(lede), '설명이 헤더 안에 있다').toBe(false);
  });
});
