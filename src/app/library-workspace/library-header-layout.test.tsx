import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('tab=ontology') }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useFormatter: () => ({ number: String }) }));
vi.mock('@/views/library', () => ({
  LibraryConstellations: () => null, LibraryPage: () => null, LibraryRounds: () => null,
  useLibraryRounds: () => null,
}));
vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => ({ status: 'loaded', handle: null, manifest: { docs: [] } }) }));
vi.mock('@/entities/docs-vault', () => ({ selectWikiPages: () => [] }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/shared/lib/preferences/appearance-preferences', () => ({ useLibraryIndexSegment: () => 'wiki', writeLibraryIndexSegment: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/select-open-vault-handle', () => ({ selectOpenVaultHandle: () => null }));
vi.mock('@/shared/ui', () => ({
  PageHeaderBar: ({ tabs, actions }: { tabs: React.ReactNode; actions: React.ReactNode }) => <div data-page-header-row style={{ padding: 0, columnGap: 0 }}><div>{tabs}</div>{actions}</div>,
  TabBar: () => <div role="tablist" />,
  RouteLoadingFallback: () => null,
}));
vi.mock('@/shared/ui/fields/segmented-control', () => ({ SegmentedControl: () => <div data-testid="ontology-selector" /> }));
vi.mock('./panel-arrival', () => ({ fadeIn: vi.fn(), prefersReducedMotion: () => true, tabSwitchFade: () => null, whenIdle: () => () => {}, whenLoaded: () => () => {} }));

const { LibraryWorkspace } = await import('./index');

describe('library header placement', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps the selector usable when the tab strip reports persistent overflow', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tablist' ? 100 : 1000;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tablist' ? 101 : 1000;
    });
    render(<LibraryWorkspace />);
    expect(screen.getByTestId('ontology-selector')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('moves the selector back when the header grows and the tabs fit', () => {
    let width = 1000;
    let overflow = true;
    let notifyResize: (() => void) | undefined;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyResize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tablist' ? 100 : width;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tablist' && overflow ? 101 : 100;
    });
    render(<LibraryWorkspace />);
    expect(screen.getByTestId('ontology-selector').closest('[role="tabpanel"]')).not.toBeNull();
    width = 1200;
    overflow = false;
    act(() => notifyResize?.());
    expect(screen.getByTestId('ontology-selector').closest('[data-page-header-row]')).not.toBeNull();
  });
});
