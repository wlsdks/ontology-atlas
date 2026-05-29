import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { TooltipProvider } from '@/shared/ui';
import { SigmaHubRail } from './SigmaHubRail';
import type { Project } from '@/entities/project';

const RAIL_OPEN_KEY = 'demo:sigma-hub-rail-open:v1';

// jsdom 은 scrollIntoView / matchMedia 미구현 — 컴포넌트 effect 가 throw 하지
// 않게 stub.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    slug: 'p',
    name: 'P',
    category: 'frontend',
    status: 'active',
    description: '',
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    isHub: false,
    screenshots: [],
    timeline: { start: undefined, end: undefined } as Project['timeline'],
    position: { x: 0, y: 0 } as Project['position'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Project;
}

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TooltipProvider>{ui}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

const HUBS = [
  project({ slug: 'hub-a', name: 'Hub A', isHub: true, dependencies: ['x', 'y'] }),
  project({ slug: 'hub-b', name: 'Hub B', isHub: true, dependencies: ['z'] }),
  project({ slug: 'leaf', name: 'Leaf', isHub: false }),
];

/**
 * SigmaHubRail roving tabindex — listbox(role=listbox) 는 tab stop 1개만 가져야
 * 한다. 이전엔 모든 option(native button) 이 기본 tabIndex 0 이라 Tab 이 허브마다
 * 멈췄다(roving 패턴 위반). 활성 옵션(없으면 첫 옵션)만 0, 나머지 -1.
 */
describe('SigmaHubRail — roving tabindex a11y', () => {
  beforeEach(() => {
    window.localStorage.setItem(RAIL_OPEN_KEY, '1'); // rail 펼친 상태로 렌더
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('선택이 없으면 첫 option 만 tab stop(0), 나머지 -1', () => {
    render(<SigmaHubRail projects={HUBS} onSelect={() => {}} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2); // hub-a, hub-b (leaf 제외)
    const tabbable = options.filter((o) => o.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(options[0]).toHaveAttribute('tabindex', '0');
    expect(options[1]).toHaveAttribute('tabindex', '-1');
  });

  it('선택된 hub 이 유일한 tab stop', () => {
    render(
      <SigmaHubRail projects={HUBS} selectedSlug="hub-b" onSelect={() => {}} />,
    );
    const options = screen.getAllByRole('option');
    const tabbable = options.filter((o) => o.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    // 선택된 option(aria-selected=true)이 그 tab stop 이어야 한다.
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true');
  });
});
