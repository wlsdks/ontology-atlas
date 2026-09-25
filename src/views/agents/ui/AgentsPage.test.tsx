import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import { AgentsPage } from './AgentsPage';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let search = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

let bridge = true;
vi.mock('@/shared/lib/tauri-acp', () => ({
  isAcpBridgeAvailable: () => bridge,
}));

vi.mock('@/widgets/app-settings-menu', () => ({
  AcpRuntimeSettings: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="acp-runtimes" data-embedded={embedded ? 'true' : 'false'} />
  ),
  ModelConnections: () => <div data-testid="model-connections" />,
}));

function renderPage(children?: React.ReactNode, mcpCount?: number) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AgentsPage mcpCount={mcpCount}>{children}</AgentsPage>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  bridge = true;
  search = '';
  window.history.replaceState(null, '', '/ko/agents/');
});

describe('에이전트 목적지', () => {
  it('제목과 한 줄 설명을 갖는다', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ko.agents.title);
    expect(screen.getByText(ko.agents.lede)).toBeInTheDocument();
  });

  it('웹에서는 설명의 주어가 맥 앱이다 — 바로 아래 카드가 브라우저는 못 띄운다고 말한다', () => {
    bridge = false;
    renderPage();
    expect(screen.getByText(ko.agents.ledeWeb)).toBeInTheDocument();
    expect(screen.queryByText(ko.agents.lede)).toBeNull();
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

  it('설명은 한 줄뿐이다 — 접힌 문단도, 아래를 가리키는 문장도 없다', () => {
    // Owner, 2026-09-19: "there is so much useless text here". The fold "what this screen
    // does" and its paragraph are gone; the page says one sentence and then the strip.
    renderPage();
    expect(screen.queryByText('이 화면이 하는 일')).toBeNull();
    const main = screen.getByRole('main');
    const paragraphs = [...main.querySelectorAll('p')].filter((p) => p.textContent?.trim());
    expect(paragraphs.map((p) => p.textContent)).toEqual([ko.agents.lede]);
  });
});

describe('한 목록에 이름 하나', () => {
  it('보이지 않는 구역 이름과 보이는 묶음 이름이 같은 말로 시작한다', () => {
    // The region heading and the group label named the same list two different ways, and the
    // count rode parentheses here while the MCP tab's rode a middot. One noun phrase, one
    // count grammar, across both tabs.
    const region = ko.agents.runtimesHeading;
    expect(ko.nav.settingsMenu.runtimes.readyHeading.startsWith(region)).toBe(true);
    expect(ko.nav.settingsMenu.runtimes.readyHeading).toContain('·');
    expect(ko.mcp.connectorsHeadingCount).toContain('·');
  });
});

describe('세 탭, 한 번에 하나', () => {
  it('기본은 에이전트 탭이고 MCP 탭의 몸통은 그리지 않는다', () => {
    renderPage(<div data-testid="mcp-body" />);
    expect(screen.getByRole('tab', { name: ko.agents.workspace.agents })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('acp-runtimes')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-body')).toBeNull();
    expect(screen.getByRole('main')).toHaveAttribute('data-agents-tab', 'agents');
  });

  it('?tab=mcp 는 MCP 탭을 열고 그 탭의 설명을 위에 둔다', () => {
    search = 'tab=mcp';
    renderPage(<div data-testid="mcp-body" />);
    expect(screen.getByTestId('mcp-body')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-runtimes')).toBeNull();
    expect(screen.getByText(ko.mcp.lede)).toBeInTheDocument();
    expect(screen.queryByText(ko.agents.lede)).toBeNull();
    expect(screen.getByRole('main')).toHaveAttribute('data-agents-tab', 'mcp');
  });

  it('탭을 누르면 주소가 따라온다 — 새로 고침과 공유 링크가 같은 탭을 연다', () => {
    window.history.replaceState(null, '', '/ko/agents/?guides=off');
    renderPage(<div data-testid="mcp-body" />);
    fireEvent.click(screen.getByRole('tab', { name: ko.agents.workspace.mcp }));
    expect(screen.getByTestId('mcp-body')).toBeInTheDocument();
    expect(window.location.search).toBe('?guides=off&tab=mcp');
    fireEvent.click(screen.getByRole('tab', { name: ko.agents.workspace.agents }));
    expect(screen.getByTestId('acp-runtimes')).toBeInTheDocument();
    expect(window.location.search).toBe('?guides=off');
  });

  it('탭은 에이전트 | 모델 | MCP 순서다', () => {
    renderPage();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      ko.agents.workspace.agents,
      ko.agents.workspace.models,
      ko.agents.workspace.mcp,
    ]);
  });

  it('?tab=models 는 모델 탭을 열고 그 탭의 설명을 위에 둔다 — 설정에서 옮겨 온 문이 여기로 온다', () => {
    search = 'tab=models';
    renderPage(<div data-testid="mcp-body" />);
    expect(screen.getByTestId('model-connections')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-runtimes')).toBeNull();
    expect(screen.queryByTestId('mcp-body')).toBeNull();
    expect(screen.getByText(ko.agents.models.lede)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-agents-tab', 'models');
    expect(screen.getByRole('region', { name: ko.agents.workspace.models })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'agents-tab-models');
  });

  it('모델 탭을 누르면 주소가 ?tab=models 가 되고, MCP 전용 키는 떨어진다', () => {
    window.history.replaceState(null, '', '/ko/agents/?tab=mcp&mcp=connectors&install=abc');
    search = 'tab=mcp';
    renderPage(<div data-testid="mcp-body" />);
    fireEvent.click(screen.getByRole('tab', { name: ko.agents.workspace.models }));
    expect(screen.getByTestId('model-connections')).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=models');
  });

  it('탭 띠는 페이지 몸통에 있다 — 머리띠(56px 크롬)가 아니다', () => {
    // 2026-09-18 the owner rejected a header strip; 2026-09-19 the stack. The strip lives
    // inside `<main>`, below the title, as the Library's and Insights' do.
    renderPage();
    const strip = screen.getByRole('tablist');
    const main = screen.getByRole('main');
    expect(main.contains(strip)).toBe(true);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('켜 둔 연결 도구 수가 MCP 탭 옆에 선다 — 알기 전에는 0을 찍지 않는다', () => {
    renderPage(undefined, 2);
    expect(screen.getByRole('tab', { name: `${ko.agents.workspace.mcp}, 2` })).toBeInTheDocument();
    const { unmount } = renderPage();
    unmount();
  });
});

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

describe('한 목적지에 한 가지 일', () => {
  it('MCP 칸을 스스로 그리지 않는다 — 앱 층이 자식으로 건넨다', () => {
    renderPage();
    expect(screen.queryByTestId('agent-setup-section')).toBeNull();
    expect(screen.queryByTestId('connectors-panel')).toBeNull();
  });

  /*
   * The name, not the element that used to carry it. Until 2026-09-20 this panel was labelled
   * twice — an `sr-only` heading here and, from that day, a visible group heading inside the
   * runtime panel saying the same words. The heading went; the region's name is the invariant
   * this test was always about, and it is what assistive tech announces on entry.
   */
  it('남은 한 칸은 이름을 갖는다 — 훑을 수 있어야 한다', () => {
    renderPage();
    expect(screen.getByRole('region', { name: ko.agents.runtimesHeading })).toBeInTheDocument();
  });
});
