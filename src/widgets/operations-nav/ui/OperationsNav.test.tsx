import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsNav } from './OperationsNav';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
  dataSourceMode: 'static' as 'static' | 'local',
  pathname: '/ontology',
  localVault: {
    handle: null as { name?: string } | null,
    manifest: null as { docs: unknown[] } | null,
  },
}));

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.dataSourceMode,
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.localVault,
}));

vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

vi.mock('@/features/theme-toggle', () => ({
  ThemeToggle: () => <button type="button">theme</button>,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mocks.pathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, Record<string, string>> = {
      modeBadge: {
        demoAriaLabelDownload: 'Demo mode — install the macOS app to start local vault work',
        demoAriaLabelPicker: 'Demo mode — open a local vault folder',
        demoLabel: 'demo',
        demoTooltipDownload: 'Demo mode — install the macOS app to start writable local vault work',
        demoTooltipPicker: 'Demo mode — open a local vault folder to start saving changes',
        vaultDocs: `${values?.count ?? 0} records`,
        vaultLabel: 'vault',
        vaultTooltip: `Vault mode — ${values?.name ?? 'vault'} (${values?.count ?? 0} source records).`,
      },
      nav: {
        ariaLabel: 'Operations',
        ariaLabelMobile: 'Mobile operations',
        back: 'Back',
        backToWorkspace: 'Back to workspace',
        docs: 'Source vault',
        ontology: 'Ontology',
        topology: 'Topology',
        tooltipDocs: 'Source vault — separate guide docs from ontology nodes',
        tooltipOntology: 'Ontology — review concepts, relations, changes, and saves',
        tooltipTopology: 'Topology — inspect the project map and return to changes',
      },
    };
    return messages[namespace]?.[key] ?? key;
  },
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => mocks.isDesktopRuntime,
}));

vi.mock('@/shared/ui', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/widgets/ontology-sub-nav', () => ({
  OntologySubNav: () => <div data-testid="ontology-sub-nav" />,
  shouldShowOntologySubNav: () => false,
}));

describe('OperationsNav desktop acquisition boundary', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    mocks.dataSourceMode = 'static';
    mocks.pathname = '/ontology';
    mocks.localVault = { handle: null, manifest: null };
  });

  it('routes hosted browser demo badges to the app download page', () => {
    render(<OperationsNav />);

    for (const link of screen.getAllByRole('link', {
      name: /Demo mode — install the macOS app to start local vault work/i,
    })) {
      expect(link).toHaveAttribute('href', '/download/');
      expect(link.className).toContain('h-8');
    }
    expect(
      screen.getAllByRole('link', {
        name: /Demo mode — install the macOS app to start local vault work/i,
      }).some((link) => link.textContent?.includes('demo')),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: /open a local vault folder/i })).not.toBeInTheDocument();
  });

  it('keeps the installed desktop app demo badge on the native local picker path', () => {
    mocks.isDesktopRuntime = true;

    render(<OperationsNav />);

    for (const link of screen.getAllByRole('link', {
      name: /Demo mode — open a local vault folder/i,
    })) {
      expect(link).toHaveAttribute('href', '/docs/?intent=local');
      expect(link.className).toContain('h-8');
    }
    expect(screen.queryByRole('link', { name: /install the macOS app/i })).not.toBeInTheDocument();
  });

  it('keeps the three primary app surfaces directly reachable', () => {
    render(<OperationsNav />);

    expect(screen.getAllByRole('link', { name: /Source vault — separate/ })[0]).toHaveAttribute(
      'href',
      '/docs/',
    );
    expect(screen.getAllByRole('link', { name: /Ontology — review/ })[0]).toHaveAttribute(
      'href',
      '/ontology/',
    );
    expect(screen.getAllByRole('link', { name: /Topology — inspect/ })[0]).toHaveAttribute(
      'href',
      '/topology/',
    );
  });

  it('keeps the compact mobile home link large enough to hit', () => {
    render(<OperationsNav />);

    const homeLinks = screen.getAllByRole('link', { name: 'Back to workspace' });
    expect(homeLinks.some((link) => link.className.includes('min-w-8'))).toBe(true);
  });

  it('separates mobile status from the primary surface tabs', () => {
    render(<OperationsNav />);

    expect(screen.getByTestId('operations-mobile-status')).toBeInTheDocument();
    expect(screen.getByTestId('operations-mobile-tabs')).toHaveAttribute(
      'aria-label',
      'Mobile operations',
    );
  });
});
