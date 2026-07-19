import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsMenu } from './AppSettingsMenu';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => mocks.isDesktopRuntime,
}));

vi.mock('@/shared/lib/use-copy-feedback', () => ({
  useCopyFeedback: () => ({ state: 'idle' as const, copy: vi.fn() }),
}));

vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const TAB_VAULT_NAME = /^nav\.settingsMenu\.tabVault/;

function openVaultTab() {
  render(<AppSettingsMenu mode="static" />);
  fireEvent.click(screen.getByTestId('app-settings-trigger'));
  fireEvent.click(screen.getByRole('tab', { name: TAB_VAULT_NAME }));
}

/**
 * `OperationsNav`'s standalone `ModeBadge` demo-link owned this hosted-vs-
 * installed routing decision before feat/rail-rollout retired it — its exact
 * `isDesktopRuntime ? '/docs/?intent=local' : '/download/'` branch moved
 * verbatim into this widget's "vault" tab (`vaultHref`). `test:desktop:runtime`
 * still needs a direct test guarding that branch, so it now points here
 * instead of the deleted `OperationsNav.test.tsx`.
 */
describe('AppSettingsMenu desktop acquisition boundary', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
  });

  it('routes the hosted browser vault action to the app download page', () => {
    openVaultTab();
    expect(screen.getByRole('link', { name: /nav.settingsMenu.vaultTitle/i })).toHaveAttribute(
      'href',
      '/download/',
    );
  });

  it('keeps the installed desktop app vault action on the native local picker path', () => {
    mocks.isDesktopRuntime = true;
    openVaultTab();
    expect(screen.getByRole('link', { name: /nav.settingsMenu.vaultTitle/i })).toHaveAttribute(
      'href',
      '/docs/?intent=local',
    );
  });

  it('sends an already-loaded local vault straight back to /docs', () => {
    render(<AppSettingsMenu mode="local" />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: TAB_VAULT_NAME }));
    expect(screen.getByRole('link', { name: /nav.settingsMenu.vaultTitle/i })).toHaveAttribute(
      'href',
      '/docs/',
    );
  });
});
