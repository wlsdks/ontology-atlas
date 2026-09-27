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

describe('agents destination', () => {
  it('renders a title and a one-line lede', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ko.agents.title);
    expect(screen.getByText(ko.agents.lede)).toBeInTheDocument();
  });

  it('makes the desktop app the lede subject on the web, since the card below says a browser cannot launch agents', () => {
    bridge = false;
    renderPage();
    expect(screen.getByText(ko.agents.ledeWeb)).toBeInTheDocument();
    expect(screen.queryByText(ko.agents.lede)).toBeNull();
  });

  it('tells the runtime panel not to draw its own intro because the page already did', () => {
    renderPage();
    expect(screen.getByTestId('acp-runtimes')).toHaveAttribute('data-embedded', 'true');
  });

  it('keeps the lede outside the header so it is not pushed to the far end of the title row', () => {
    renderPage();
    const heading = screen.getByRole('heading', { level: 1 });
    const lede = screen.getByText(ko.agents.lede);
    const header = heading.closest('header');
    expect(header).not.toBeNull();
    expect(header!.contains(lede)).toBe(false);
  });

  it('says one lede sentence with no folded paragraph or pointer sentence', () => {
    // Owner, 2026-09-19: "there is so much useless text here". The fold "what this screen
    // does" and its paragraph are gone; the page says one sentence and then the strip.
    renderPage();
    expect(screen.queryByText('이 화면이 하는 일')).toBeNull();
    const main = screen.getByRole('main');
    const paragraphs = [...main.querySelectorAll('p')].filter((p) => p.textContent?.trim());
    expect(paragraphs.map((p) => p.textContent)).toEqual([ko.agents.lede]);
  });
});

describe('one name per list', () => {
  it('starts the hidden region name and the visible group label with the same words', () => {
    // The region heading and the group label named the same list two different ways, and the
    // count rode parentheses here while the MCP tab's rode a middot. One noun phrase, one
    // count grammar, across both tabs.
    const region = ko.agents.runtimesHeading;
    expect(ko.nav.settingsMenu.runtimes.readyHeading.startsWith(region)).toBe(true);
    expect(ko.nav.settingsMenu.runtimes.readyHeading).toContain('·');
    expect(ko.mcp.connectorsHeadingCount).toContain('·');
  });
});

describe('three tabs, one at a time', () => {
  it('opens the agents tab by default and does not render the MCP body', () => {
    renderPage(<div data-testid="mcp-body" />);
    expect(screen.getByRole('tab', { name: ko.agents.workspace.agents })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('acp-runtimes')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-body')).toBeNull();
    expect(screen.getByRole('main')).toHaveAttribute('data-agents-tab', 'agents');
  });

  it('opens the MCP tab for ?tab=mcp with that tab lede on top', () => {
    search = 'tab=mcp';
    renderPage(<div data-testid="mcp-body" />);
    expect(screen.getByTestId('mcp-body')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-runtimes')).toBeNull();
    expect(screen.getByText(ko.mcp.lede)).toBeInTheDocument();
    expect(screen.queryByText(ko.agents.lede)).toBeNull();
    expect(screen.getByRole('main')).toHaveAttribute('data-agents-tab', 'mcp');
  });

  it('writes the clicked tab into the URL so reload and shared links open the same tab', () => {
    window.history.replaceState(null, '', '/ko/agents/?guides=off');
    renderPage(<div data-testid="mcp-body" />);
    fireEvent.click(screen.getByRole('tab', { name: ko.agents.workspace.mcp }));
    expect(screen.getByTestId('mcp-body')).toBeInTheDocument();
    expect(window.location.search).toBe('?guides=off&tab=mcp');
    fireEvent.click(screen.getByRole('tab', { name: ko.agents.workspace.agents }));
    expect(screen.getByTestId('acp-runtimes')).toBeInTheDocument();
    expect(window.location.search).toBe('?guides=off');
  });

  it('orders the tabs agents, models, MCP', () => {
    renderPage();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      ko.agents.workspace.agents,
      ko.agents.workspace.models,
      ko.agents.workspace.mcp,
    ]);
  });

  it('opens the models tab for ?tab=models with that tab lede on top, where the settings door lands', () => {
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

  it('writes ?tab=models when the models tab is clicked and drops the MCP-only keys', () => {
    window.history.replaceState(null, '', '/ko/agents/?tab=mcp&mcp=connectors&install=abc');
    search = 'tab=mcp';
    renderPage(<div data-testid="mcp-body" />);
    fireEvent.click(screen.getByRole('tab', { name: ko.agents.workspace.models }));
    expect(screen.getByTestId('model-connections')).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=models');
  });

  it('places the tab strip in the page body below the title, not in the 56px chrome', () => {
    // 2026-09-18 the owner rejected a header strip; 2026-09-19 the stack. The strip lives
    // inside `<main>`, below the title, as the Library's and Insights' do.
    renderPage();
    const strip = screen.getByRole('tablist');
    const main = screen.getByRole('main');
    expect(main.contains(strip)).toBe(true);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the enabled connector count beside the MCP tab and prints no 0 before it is known', () => {
    renderPage(undefined, 2);
    expect(screen.getByRole('tab', { name: `${ko.agents.workspace.mcp}, 2` })).toBeInTheDocument();
    const { unmount } = renderPage();
    unmount();
  });
});

describe('destination skeleton', () => {
  it('owns the <main> landmark, which views own in this repo instead of the shell', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    // "Skip to content" has to be able to give it focus.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('renders a non-empty main, since an empty one reads as zero violations to audits', () => {
    renderPage();
    expect(screen.getByRole('main').querySelectorAll('*').length).toBeGreaterThan(3);
  });
});

describe('one job per destination', () => {
  it('does not render the MCP section itself; the app layer passes it as a child', () => {
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
  it('names the remaining region so it can be scanned', () => {
    renderPage();
    expect(screen.getByRole('region', { name: ko.agents.runtimesHeading })).toBeInTheDocument();
  });
});
