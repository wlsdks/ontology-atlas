import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { TooltipProvider } from '@/shared/ui';
import { HubRail } from './HubRail';
import type { Project } from '@/entities/project';

// jsdom implements neither scrollIntoView nor matchMedia — stubbed so the
// component's effects do not throw.
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

const HUBS = [project({ slug: 'hub-a', name: 'Hub A', isHub: true, dependencies: ['x'] })];

/**
 * ⚠️ `localStorage` **throws** rather than returning null when storage is disabled,
 * which the installed app's WKWebView does under some privacy settings. The read sat
 * in a `useState` initializer, so the throw happened during render and the map went
 * with it. Storage nobody can read means "not expanded yet": closed, and drawn.
 */
describe('HubRail — storage that throws', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    cleanup();
    if (original) Object.defineProperty(window, 'localStorage', original);
  });

  function breakStorage() {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        return {
          getItem() {
            throw new DOMException('The operation is insecure.', 'SecurityError');
          },
          setItem() {
            throw new DOMException('The operation is insecure.', 'SecurityError');
          },
        };
      },
    });
  }

  it('renders closed instead of throwing when reading storage fails', () => {
    breakStorage();

    expect(() => render(<HubRail projects={HUBS} onSelect={() => {}} />)).not.toThrow();
    // Closed: the option list is not in the tree, only the reopen tab.
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('still opens when the write fails', () => {
    breakStorage();

    render(<HubRail projects={HUBS} onSelect={() => {}} />);
    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});
