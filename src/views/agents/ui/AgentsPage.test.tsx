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
  AgentSetupSection: () => <div data-testid="agent-setup-section" />,
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

/**
 * **랜드마크와 하단 예약** — 목적지가 되면서 처음으로 검사 대상이 된 것들.
 *
 * 첫 판은 `<div>` 로 그렸고, 접근성 래칫이
 * *"`/ko/agents/`: `<main>` 안 요소 0"* 으로 잡았다. 그 검사의 말이 정확했다:
 * 「위반 0」이 통과가 아니라 **미측정**이었고, 「본문으로 건너뛰기」도 이
 * 화면에서만 갈 곳이 없었다. e2e 가 잡아 주기 전에 여기서 먼저 막는다.
 */
describe('목적지의 기본 골격', () => {
  it('`<main>` 랜드마크를 소유한다 — 이 저장소는 셸이 아니라 뷰가 소유한다', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    // 「본문으로 건너뛰기」가 초점을 줄 수 있어야 한다.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('본문이 비어 있지 않다 — 빈 `<main>` 은 검사에 «위반 0» 으로 보인다', () => {
    renderPage();
    expect(screen.getByRole('main').querySelectorAll('*').length).toBeGreaterThan(3);
  });

  it('하단 탭바 자리를 예약한다 — 안 하면 마지막 줄이 탭바 뒤로 숨는다', () => {
    renderPage();
    expect(screen.getByRole('main').className).toContain(
      'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]',
    );
  });
});

/**
 * **강등 문장이 가리키는 곳이 실재하는가.**
 *
 * 실행기 칸은 웹에서 「프로그램을 못 띄운다」고 말하면서 *"이 화면에서도 「MCP
 * 연결」 칸에서 …"* 라고 가리킨다. 그 칸이 같은 화면에 없으면 그 문장은
 * 가리키는 곳이 없는 안내가 된다 — 이 저장소가 강등 카드에 대해 금지한 모양이다.
 */
describe('강등 문장이 가리키는 곳', () => {
  it('MCP 연결 칸을 같은 화면에 데려온다', () => {
    renderPage();
    expect(screen.getByTestId('agent-setup-section')).toBeInTheDocument();
  });

  it('두 칸이 각자 제목을 갖는다 — 훑을 수 있어야 한다', () => {
    renderPage();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });
});
