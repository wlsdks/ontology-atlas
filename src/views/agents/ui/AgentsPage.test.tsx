import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import { AgentsPage } from './AgentsPage';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * The "agents" destination — **does it say the same thing twice?**
 *
 * Caught in a 2026-08-20 capture of the installed app: the page's lede and the panel's intro line were
 * near-identical sentences stacked one above the other. This screen had already suffered that
 * same-sentence-copy defect once (18 of the runner list's 20 lines), and the council's prescription was
 * "three explanatory paragraphs down to one".
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

/**
 * **Landmarks and the bottom reserve** — things that became checkable only once this became a destination.
 *
 * The first draft drew a `<div>`, and the accessibility ratchet caught it with
 * *"`/ko/agents/`: 0 elements inside `<main>`"*. That check's wording was exact: "zero violations" was
 * not a pass but **nothing measured**, and "skip to content" had nowhere to go on this screen alone.
 * It is blocked here before e2e has to catch it.
 */
describe('목적지의 기본 골격', () => {
  it('`<main>` 랜드마크를 소유한다 — 이 저장소는 셸이 아니라 뷰가 소유한다', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    // "Skip to content" has to be able to give it focus.
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
 * **One job per destination** (2026-09-05).
 *
 * This screen used to carry the MCP connection pane as well, and the two halves shared only the
 * word "agent": one is about programs installed on this computer, the other about a wire that
 * works identically in a browser. MCP moved to `/mcp`, and what this asserts is that the move
 * really happened here rather than being drawn twice — two screens rendering the same pane is the
 * duplicate-source defect this repository names by name.
 *
 * Where the runner row's web sentence now points is asserted by `AcpRuntimeSettings.test.tsx`
 * (a link) and by `web-surface-smoke` (the link resolves), because that sentence belongs to the
 * runner list, not to this page.
 */
describe('한 목적지에 한 가지 일', () => {
  it('MCP 칸을 더는 그리지 않는다 — 같은 칸을 두 화면이 그리면 어느 쪽이 현재인지 알 수 없다', () => {
    renderPage();
    expect(screen.queryByTestId('agent-setup-section')).toBeNull();
    expect(screen.queryByTestId('connectors-panel')).toBeNull();
  });

  it('남은 한 칸은 이름을 갖는다 — 훑을 수 있어야 한다', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      ko.agents.runtimesHeading,
    );
  });
});
