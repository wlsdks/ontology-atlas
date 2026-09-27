import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { TooltipProvider } from '@/shared/ui';
import { HubRail } from './HubRail';
import type { Project } from '@/entities/project';

const RAIL_OPEN_KEY = 'demo:sigma-hub-rail-open:v1';

// jsdom has neither scrollIntoView nor matchMedia; stubbed so effects do not throw.
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

/** A listbox has exactly one tab stop: the active option, or the first without one. */
describe('HubRail — roving tabindex a11y', () => {
  beforeEach(() => {
    window.localStorage.setItem(RAIL_OPEN_KEY, '1'); // render with the rail expanded
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('makes only the first option a tab stop when nothing is selected', () => {
    render(<HubRail projects={HUBS} onSelect={() => {}} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2); // hub-a, hub-b (leaves excluded)
    const tabbable = options.filter((o) => o.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(options[0]).toHaveAttribute('tabindex', '0');
    expect(options[1]).toHaveAttribute('tabindex', '-1');
  });

  it('makes the selected hub the only tab stop', () => {
    render(
      <HubRail projects={HUBS} selectedSlug="hub-b" onSelect={() => {}} />,
    );
    const options = screen.getAllByRole('option');
    const tabbable = options.filter((o) => o.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    // The selected option (aria-selected=true) has to be that tab stop.
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true');
  });
});
