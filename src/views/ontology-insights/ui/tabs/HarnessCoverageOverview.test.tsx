import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ko from '../../../../../messages/ko.json';
import en from '../../../../../messages/en.json';
import type { ScopeDeclaration } from '@/entities/agent-files';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';
import { HarnessCoverageOverview } from './HarnessCoverageOverview';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={String(href)} {...props}>{children}</a>,
}));

type Measured = Extract<InsightsBrief['harnessDetail'], { availability: 'measured' }>;
type Evidence = Measured['evidence'];

const declaration = ({ id, ...overrides }: Partial<ScopeDeclaration> & Pick<ScopeDeclaration, 'id'>): ScopeDeclaration => ({
  column: 'told',
  label: id,
  origin: 'rule',
  declaration: 'paths: src/views/ontology-insights/**',
  declaresPath: true,
  scopes: ['src/views/ontology-insights'],
  tools: [],
  ...overrides,
  id,
});

const guide = declaration({ id: '.claude/rules/insights.md', tools: ['claude-code'] });
const secondGuide = declaration({ id: 'src/entities/agent-files/AGENTS.md', label: 'Agent files guidance', scopes: ['src/entities/agent-files'], tools: ['codex'] });
const globalGate = declaration({ id: '.claude/hooks/report-agent-file-drift.sh', label: 'Report agent-file drift', origin: 'hook', column: 'gated', declaration: '', declaresPath: false, scopes: [] });

const evidence: Evidence = {
  areas: [
    {
      slug: 'domains/guidance',
      title: 'Guidance',
      purpose: '지침 범위와 그 근거를 사람이 판단할 수 있게 해요.',
      capabilities: [
        { slug: 'capabilities/overview', title: 'Overview', path: 'src/views/ontology-insights' },
        { slug: 'capabilities/scanner', title: 'Scanner', path: 'src/entities/agent-files' },
      ],
      discoveredTests: 4,
      roles: {
        told: { column: 'told', declarations: [
          { declaration: guide, matchedCapabilities: [{ slug: 'capabilities/overview', title: 'Overview', path: 'src/views/ontology-insights' }] },
          { declaration: secondGuide, matchedCapabilities: [{ slug: 'capabilities/scanner', title: 'Scanner', path: 'src/entities/agent-files' }] },
        ] },
        gated: { column: 'gated', declarations: [] },
        watched: { column: 'watched', declarations: [] },
      },
    },
    {
      slug: 'domains/agents',
      title: 'Agents',
      purpose: '에이전트 연결을 다뤄요.',
      capabilities: [{ slug: 'capabilities/agents', title: 'Agents', path: 'src/features/acp-session' }],
      discoveredTests: 0,
      roles: {
        told: { column: 'told', declarations: [] },
        gated: { column: 'gated', declarations: [] },
        watched: { column: 'watched', declarations: [] },
      },
    },
  ],
  everywhere: { told: [], gated: [globalGate], watched: [] },
  outsideAreas: [],
  unreachedCapabilities: [],
};

const mount = (model: { evidence?: Evidence; drift?: readonly { path: string; message: string }[] } = {}) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'app-nav-rail') return { x: 0, y: 0, left: 0, top: 0, right: 64, bottom: 900, width: 64, height: 900, toJSON: () => ({}) } as DOMRect;
    if (this.dataset.testid === 'harness-role-popup') return { x: 80, y: 160, left: 80, top: 160, right: 460, bottom: 640, width: 380, height: 480, toJSON: () => ({}) } as DOMRect;
    return { x: 120, y: 120, left: 120, top: 120, right: 220, bottom: 152, width: 100, height: 32, toJSON: () => ({}) } as DOMRect;
  });
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <aside data-testid="app-nav-rail" />
      <button type="button" data-testid="outside-control">바깥 컨트롤</button>
      <div data-testid="diagram-host">
        <HarnessCoverageOverview evidence={model.evidence ?? evidence} guideFiles={102} checks={87} drift={model.drift ?? []} />
      </div>
    </NextIntlClientProvider>,
  );
};

const rect = (width: number, height: number, left = 120, top = 120): DOMRect => ({
  x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}),
} as DOMRect);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HarnessCoverageOverview measured slice', () => {
  it('draws every domain with stable role marks and no connector for a zero', () => {
    mount();
    expect(screen.getByText('지침 파일 102개 · 검사 항목 87개.')).toBeInTheDocument();
    expect(screen.getByText(/도표의 숫자는 도메인에 귀속된 경로 한정 선언 수/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/harness-domain-/)).toHaveLength(2);
    const guidance = screen.getByTestId('harness-domain-domains/guidance');
    expect(guidance.querySelectorAll('[data-role]')).toHaveLength(3);
    expect(guidance.querySelector('[data-role="told"]')).toHaveAttribute('data-state', 'filled');
    expect(guidance.querySelector('[data-role="gated"]')).toHaveAttribute('data-state', 'empty');
    expect(guidance.querySelector('[data-role-connection="told"]')).not.toBeNull();
    expect(guidance.querySelector('[data-role-connection="gated"]')).toBeNull();
    expect(guidance.querySelector('[data-role="gated"]')).toHaveTextContent('훅');
    expect(guidance.querySelector('[data-role="watched"]')).toHaveTextContent('검사·워크플로');
  });

  it('keeps every domain beyond the native eight-domain case', () => {
    const many: Evidence = {
      ...evidence,
      areas: Array.from({ length: 10 }, (_, index) => ({
        ...evidence.areas[index % evidence.areas.length]!,
        slug: `domains/domain-${index}`,
        title: `Domain ${index}`,
      })),
    };
    render(<NextIntlClientProvider locale="ko" messages={ko}><HarnessCoverageOverview evidence={many} guideFiles={102} checks={87} drift={[]} /></NextIntlClientProvider>);
    expect(screen.getAllByTestId(/harness-domain-/)).toHaveLength(10);
    expect(screen.getByTestId('harness-coverage-overview').querySelector('[data-domain-count]')).toHaveAttribute('data-domain-count', '10');
  });

  it('reconciles Diagram and Text members and routes every Stage3 collection through one presenter', () => {
    vi.useFakeTimers();
    const outside = declaration({ id: '.claude/rules/very-long-outside-scope.md', label: 'Outside declaration identity', declaration: 'packages/not-recorded/**', scopes: ['packages/not-recorded/**'], tools: ['claude-code'] });
    const stage3: Evidence = {
      ...evidence,
      areas: Array.from({ length: 10 }, (_, index) => ({ ...evidence.areas[index % evidence.areas.length]!, slug: `domains/domain-${index}`, title: `Long domain identity ${index}` })),
      outsideAreas: [outside],
      unreachedCapabilities: [{ slug: 'capabilities/unreached-long-identity', title: 'Unreached capability', path: 'src/very/long/unreached/capability/entrypoint.ts' }],
    };
    const drift = [
      { path: '.agents/skills/design-build/SKILL.md', message: 'Differs from the independent Claude instruction tree.' },
      { path: '.claude/skills/design-build/SKILL.md', message: 'Retains a separate harness contract.' },
    ];
    mount({ evidence: stage3, drift });
    const diagramFacts = screen.getAllByTestId(/harness-domain-/).map((domain) => ({
      name: domain.getAttribute('aria-label'),
      roles: [...domain.querySelectorAll('[data-role]')].map((role) => role.textContent),
    }));
    const modeText = screen.getByTestId('guidance-mode-text');
    modeText.focus();
    fireEvent.click(modeText);
    expect(modeText).toHaveFocus();
    const textFacts = screen.getAllByTestId(/harness-text-domain-/).map((domain) => ({
      name: domain.querySelector('h4')?.textContent,
      roles: [...domain.querySelectorAll('[data-role]')].map((role) => role.textContent),
    }));
    expect(textFacts).toEqual(diagramFacts);
    expect(textFacts).toHaveLength(10);

    fireEvent.click(screen.getByTestId('guidance-mode-diagram'));
    const firstRole = screen.getAllByTestId(/harness-domain-/)[0]!.querySelector<HTMLButtonElement>('[data-role="told"]')!;
    fireEvent.click(firstRole);
    fireEvent.click(modeText);
    expect(screen.getByTestId('harness-role-popup')).toHaveAttribute('inert');
    act(() => vi.runAllTimers());
    expect(modeText).toHaveFocus();

    const openCollection = (key: string) => fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-guidance-evidence-action="${key}"]`)!);
    openCollection('separate:gated');
    expect(screen.getByTestId('harness-collection-evidence')).toHaveAttribute('data-collection-kind', 'separate');
    expect(screen.getAllByText('.claude/hooks/report-agent-file-drift.sh').length).toBeGreaterThan(0);
    openCollection('outside');
    expect(screen.getByTestId('harness-collection-evidence')).toHaveAttribute('data-collection-kind', 'outside');
    const outsideRow = screen.getByRole('button', { name: /very-long-outside-scope/ });
    fireEvent.click(outsideRow);
    expect(screen.getByTestId('harness-collection-evidence')).toHaveTextContent('.claude/rules/very-long-outside-scope.md');
    expect(screen.getByTestId('harness-collection-evidence')).toHaveTextContent('Outside declaration identity');
    expect(screen.getByTestId('harness-collection-evidence')).toHaveTextContent('packages/not-recorded/**');
    expect(screen.getByTestId('harness-collection-evidence')).toHaveTextContent('claude-code');
    expect(screen.getByTestId('harness-collection-evidence').querySelectorAll('[data-evidence-kind="outside"]')).toHaveLength(1);
    expect(screen.getByTestId('harness-collection-evidence').querySelectorAll('[data-evidence-kind="global"]')).toHaveLength(0);
    openCollection('unreached');
    expect(screen.getByTestId('harness-unreached-list')).toHaveTextContent('capabilities/unreached-long-identity');
    expect(screen.getByTestId('harness-unreached-list')).toHaveTextContent('src/very/long/unreached/capability/entrypoint.ts');
    openCollection('findings');
    expect(document.querySelector('[data-guidance-evidence-action="findings"]')).toHaveTextContent('2');
    expect(screen.getAllByTestId('harness-findings-list').flatMap((list) => [...list.querySelectorAll('li')])).toHaveLength(2);
    expect(screen.getByTestId('harness-collection-evidence')).toHaveTextContent('independent Claude instruction tree');
    expect(screen.getByTestId('harness-collection-evidence')).toHaveTextContent('독립된 하네스를 같게 만들라는 뜻이 아니에요');
  });

  it('opens an honest zero popup with global and discovered-test evidence kept separate', () => {
    vi.useFakeTimers();
    mount();
    const guidance = screen.getByTestId('harness-domain-domains/guidance');
    const gate = guidance.querySelector<HTMLButtonElement>('[data-role="gated"]')!;
    gate.focus();
    fireEvent.click(gate);
    const popup = screen.getByTestId('harness-role-popup');
    expect(document.body).toContainElement(popup);
    expect(screen.getByTestId('diagram-host')).not.toContainElement(popup);
    expect(popup).toHaveFocus();
    expect(Number.parseFloat(popup.style.left)).toBeGreaterThanOrEqual(80);
    expect(popup).toHaveTextContent('경로 한정 훅 선언을 찾지 못했어요');
    const roleBody = screen.getByTestId('harness-role-scroll-body');
    expect(roleBody).toHaveAttribute('tabindex', '0');
    expect(document.getElementById(roleBody.getAttribute('aria-labelledby')!)).toHaveTextContent('Guidance');
    expect(popup).toHaveTextContent('별도로 집계한 1개 보기');
    expect(popup).toHaveTextContent('경로 범위를 추출하지 못했거나 기록된 모든 도메인에 범위가 닿는 항목');
    expect(popup).not.toHaveTextContent('.claude/hooks/report-agent-file-drift.sh');
    fireEvent.click(screen.getByTestId('harness-global-evidence-toggle'));
    expect(popup).toHaveTextContent('.claude/hooks/report-agent-file-drift.sh');
    const sourceRow = screen.getByRole('button', { name: /report-agent-file-drift/ });
    fireEvent.click(sourceRow);
    expect(popup).toHaveTextContent('추출된 경로 범위 없음');
    expect(popup).toHaveTextContent('실행 범위가 제한 없다는 뜻은 아니에요');
    expect(popup).not.toHaveTextContent('*');
    expect(popup).not.toHaveTextContent('테스트 파일 4개');
    expect(screen.getByRole('button', { name: '닫기' }).parentElement).toHaveClass('sticky');
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(popup).toHaveAttribute('inert');
    expect(popup).toHaveTextContent('Guidance');
    expect(gate).not.toHaveFocus();
    act(() => vi.runAllTimers());
    expect(screen.queryByTestId('harness-role-popup')).toBeNull();
    expect(gate).toHaveFocus();
  });

  it('shows the exact declaration and only its canonical matched capability path', () => {
    mount();
    const told = screen.getByTestId('harness-domain-domains/guidance').querySelector<HTMLButtonElement>('[data-role="told"]')!;
    fireEvent.click(told);
    const evidencePanel = screen.getByTestId('harness-role-evidence');
    expect(evidencePanel).toHaveTextContent('.claude/rules/insights.md');
    expect(evidencePanel).not.toHaveTextContent('paths: src/views/ontology-insights/**');
    const sourceRow = screen.getByRole('button', { name: /\.claude\/rules\/insights\.md/ });
    fireEvent.click(sourceRow);
    const sourceDetail = document.getElementById(sourceRow.getAttribute('aria-controls')!)!;
    expect(sourceDetail).toHaveTextContent('paths: src/views/ontology-insights/**');
    expect(sourceDetail).toHaveTextContent('src/views/ontology-insights');
    expect(sourceDetail).not.toHaveTextContent('src/entities/agent-files');
  });

  it('states the empty extracted-scope boundary without inventing unrestricted scope in English', () => {
    render(<NextIntlClientProvider locale="en" messages={en}><HarnessCoverageOverview evidence={evidence} guideFiles={102} checks={87} drift={[]} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByTestId('harness-domain-domains/guidance').querySelector('[data-role="gated"]')!);
    expect(screen.getByTestId('harness-global-evidence-explanation')).toHaveTextContent('no path scope was extracted, or their scope matches every recorded domain');
    fireEvent.click(screen.getByTestId('harness-global-evidence-toggle'));
    fireEvent.click(screen.getByRole('button', { name: /report-agent-file-drift/ }));
    expect(screen.getByTestId('harness-role-evidence')).toHaveTextContent('No path scope extracted');
    expect(screen.getByTestId('harness-role-evidence')).toHaveTextContent('does not prove unrestricted runtime scope');
    expect(screen.getByTestId('harness-role-evidence')).not.toHaveTextContent('all files');
  });

  it('keeps at most one compact declaration row expanded', () => {
    mount();
    fireEvent.click(screen.getByTestId('harness-domain-domains/guidance').querySelector('[data-role="told"]')!);
    const first = screen.getByRole('button', { name: /\.claude\/rules\/insights\.md/ });
    const second = screen.getByRole('button', { name: /src\/entities\/agent-files\/AGENTS\.md/ });
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('replaces one selection with another instead of stacking popups', () => {
    mount();
    const guidance = screen.getByTestId('harness-domain-domains/guidance');
    fireEvent.click(guidance.querySelector('[data-role="told"]')!);
    fireEvent.click(guidance.querySelector('[data-role="watched"]')!);
    expect(screen.getAllByTestId('harness-role-popup')).toHaveLength(1);
    expect(screen.getByTestId('harness-role-evidence')).toHaveAttribute('data-role', 'watched');
    expect(screen.getByTestId('harness-role-evidence')).toHaveTextContent('테스트 파일 4개');
  });

  it('retains the exiting evidence and restores the right trigger after Escape', () => {
    vi.useFakeTimers();
    mount();
    const told = screen.getByTestId('harness-domain-domains/guidance').querySelector<HTMLButtonElement>('[data-role="told"]')!;
    told.focus();
    fireEvent.click(told);
    fireEvent.keyDown(window, { key: 'Escape' });
    const popup = screen.getByTestId('harness-role-popup');
    expect(popup).toHaveAttribute('inert');
    expect(screen.getByTestId('harness-role-evidence')).toHaveAttribute('data-role', 'told');
    act(() => vi.runAllTimers());
    expect(told).toHaveFocus();
  });

  it('does not let an old exit steal focus or content after rapid replacement', () => {
    vi.useFakeTimers();
    mount();
    const domain = screen.getByTestId('harness-domain-domains/guidance');
    const told = domain.querySelector<HTMLButtonElement>('[data-role="told"]')!;
    const watched = domain.querySelector<HTMLButtonElement>('[data-role="watched"]')!;
    fireEvent.click(told);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(watched);
    act(() => vi.runAllTimers());
    expect(screen.getAllByTestId('harness-role-popup')).toHaveLength(1);
    expect(screen.getByTestId('harness-role-evidence')).toHaveAttribute('data-role', 'watched');
    expect(screen.getByTestId('harness-role-popup')).toHaveFocus();
    expect(told).not.toHaveFocus();
  });

  it.each([
    ['zero width', (trigger: HTMLButtonElement) => { trigger.getBoundingClientRect = () => rect(0, 32); }],
    ['zero height', (trigger: HTMLButtonElement) => { trigger.getBoundingClientRect = () => rect(100, 0); }],
    ['disconnected', (trigger: HTMLButtonElement) => { trigger.remove(); }],
    ['display none', (trigger: HTMLButtonElement) => { trigger.style.display = 'none'; }],
    ['visibility hidden', (trigger: HTMLButtonElement) => { trigger.style.visibility = 'hidden'; }],
    ['opacity zero', (trigger: HTMLButtonElement) => { trigger.style.opacity = '0'; }],
    ['inert ancestry', (trigger: HTMLButtonElement) => { trigger.parentElement!.setAttribute('inert', ''); }],
  ])('treats a %s anchor as hidden while retaining the last valid exit geometry', (_label, hide) => {
    vi.useFakeTimers();
    mount();
    const trigger = screen.getByTestId('harness-domain-domains/guidance').querySelector<HTMLButtonElement>('[data-role="told"]')!;
    fireEvent.click(trigger);
    const popup = screen.getByTestId('harness-role-popup');
    const validStyle = popup.getAttribute('style');
    hide(trigger);
    fireEvent.scroll(window);
    expect(popup).toHaveAttribute('inert');
    expect(popup).toHaveAttribute('style', validStyle);
    expect(screen.getByTestId('harness-role-evidence')).toHaveAttribute('data-role', 'told');
    act(() => vi.runAllTimers());
    expect(screen.queryByTestId('harness-role-popup')).toBeNull();
  });

  it('does not focus an unusable field after anchor-hidden dismissal', () => {
    vi.useFakeTimers();
    mount();
    const field = screen.getByLabelText('도메인별 선언된 지침 범위');
    const trigger = screen.getByTestId('harness-domain-domains/guidance').querySelector<HTMLButtonElement>('[data-role="told"]')!;
    fireEvent.click(trigger);
    field.setAttribute('inert', '');
    trigger.getBoundingClientRect = () => rect(0, 32);
    fireEvent.scroll(window);
    act(() => vi.runAllTimers());
    expect(field).not.toHaveFocus();
  });

  it('keeps one current popup when a visible selection replaces an anchor-hidden exit', () => {
    vi.useFakeTimers();
    mount();
    const domain = screen.getByTestId('harness-domain-domains/guidance');
    const told = domain.querySelector<HTMLButtonElement>('[data-role="told"]')!;
    const watched = domain.querySelector<HTMLButtonElement>('[data-role="watched"]')!;
    fireEvent.click(told);
    told.getBoundingClientRect = () => rect(0, 32);
    fireEvent.scroll(window);
    expect(screen.getByTestId('harness-role-popup')).toHaveAttribute('inert');
    fireEvent.click(watched);
    act(() => vi.runAllTimers());
    expect(screen.getAllByTestId('harness-role-popup')).toHaveLength(1);
    expect(screen.getByTestId('harness-role-evidence')).toHaveAttribute('data-role', 'watched');
    expect(screen.getByTestId('harness-role-popup')).toHaveFocus();
    expect(screen.getByLabelText('도메인별 선언된 지침 범위')).not.toHaveFocus();
    expect(told).not.toHaveFocus();
  });

  it('outside dismissal preserves the control the user intentionally focused', () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByTestId('harness-domain-domains/guidance').querySelector('[data-role="told"]')!);
    const outside = screen.getByTestId('outside-control');
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.getByTestId('harness-role-popup')).toHaveAttribute('inert');
    act(() => vi.runAllTimers());
    expect(outside).toHaveFocus();
  });

  it('uses the bounded dialog equivalent at the narrow breakpoint', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, media: '(max-width: 767px)', addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    mount();
    fireEvent.click(screen.getByTestId('harness-domain-domains/guidance').querySelector('[data-role="told"]')!);
    expect(screen.getByTestId('harness-role-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('harness-domain-domains/guidance').querySelector('[data-role="told"]')).toHaveAttribute('aria-controls', 'harness-role-evidence-dialog-content');
    expect(screen.queryByTestId('harness-role-popup')).toBeNull();
    const outside = document.querySelector<HTMLButtonElement>('[data-guidance-evidence-action="outside"]')!;
    expect(outside).toHaveAttribute('aria-controls', 'harness-role-evidence-dialog-content');
    fireEvent.click(outside);
    expect(screen.getByTestId('harness-role-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('harness-collection-evidence')).toHaveAttribute('id', 'harness-role-evidence-dialog-content');
  });

  it('closes on a breakpoint ownership change instead of presenting desktop and narrow surfaces together', () => {
    vi.useFakeTimers();
    let matches = false;
    let listener: (() => void) | null = null;
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return matches; },
      media: '(max-width: 767px)',
      addEventListener: (_type: string, callback: () => void) => { listener = callback; },
      removeEventListener: vi.fn(),
    })));
    mount();
    fireEvent.click(screen.getByTestId('harness-domain-domains/guidance').querySelector('[data-role="told"]')!);
    matches = true;
    act(() => listener?.());
    act(() => vi.runAllTimers());
    expect(screen.queryByTestId('harness-role-dialog')).toBeNull();
    expect(screen.queryByTestId('harness-role-popup')).toBeNull();
  });
});
