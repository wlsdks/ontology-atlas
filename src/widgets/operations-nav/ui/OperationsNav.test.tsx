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
        demoAriaLabelClickable: 'Demo mode — click to start local vault work',
        demoLabel: 'demo',
        demoTooltipClickable: 'Demo mode — local vault work starts in the installed app',
        vaultDocs: `${values?.count ?? 0} docs`,
        vaultLabel: 'vault',
        vaultTooltip: `Vault mode — ${values?.name ?? 'vault'} (${values?.count ?? 0} docs).`,
      },
      nav: {
        ariaLabel: 'Operations',
        ariaLabelMobile: 'Mobile operations',
        back: 'Back',
        backToWorkspace: 'Back to workspace',
        docs: 'Docs',
        ontology: 'Ontology',
        topology: 'Topology',
        tooltipDocs: 'Docs',
        tooltipOntology: 'Ontology',
        tooltipTopology: 'Topology',
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
      name: /Demo mode — click to start local vault work/i,
    })) {
      expect(link).toHaveAttribute('href', '/download/');
    }
  });

  it('keeps the installed desktop app demo badge on the native local picker path', () => {
    mocks.isDesktopRuntime = true;

    render(<OperationsNav />);

    for (const link of screen.getAllByRole('link', {
      name: /Demo mode — click to start local vault work/i,
    })) {
      expect(link).toHaveAttribute('href', '/docs/?intent=local');
    }
  });
});
