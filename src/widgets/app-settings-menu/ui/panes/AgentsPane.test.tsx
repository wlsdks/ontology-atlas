import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENTS_CATALOG } from '../../model/catalog/agents';
import { AgentsPane } from './AgentsPane';

const mocks = vi.hoisted(() => ({
  desktop: false,
  keysRead: true,
  stored: { anthropic: true, openai: false, gemini: true } as Record<string, boolean>,
  push: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? `${namespace}.${key}` : `${namespace}.${key}:${values.count}`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/shared/lib/desktop-shell', () => ({ isDesktopShell: () => mocks.desktop }));
vi.mock('../../model/use-ai-connection', () => ({
  useAiConnection: ({ enabled }: { enabled: boolean }) => ({
    keysRead: enabled && mocks.keysRead,
    statuses: Object.fromEntries(
      Object.entries(mocks.stored).map(([provider, stored]) => [provider, enabled ? { provider, stored } : null]),
    ),
  }),
}));
vi.mock('../WikiWriteModeSettings', () => ({
  WikiWriteModeSettings: () => <div data-setting-id="wiki-write-mode" data-testid="app-settings-wiki-write-mode" />,
}));

beforeEach(() => {
  mocks.desktop = false;
  mocks.keysRead = true;
  mocks.push.mockReset();
});

const anchors = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-setting-id]')].map((el) => el.getAttribute('data-setting-id'));

describe('AgentsPane', () => {
  it('on desktop anchors every agents catalog entry and counts the stored keys', () => {
    mocks.desktop = true;
    const { container } = render(<AgentsPane onClose={vi.fn()} />);
    expect(anchors(container)).toEqual(AGENTS_CATALOG.map((entry) => entry.id));
    expect(screen.getByTestId('app-settings-door-models').textContent).toContain('settingsAgents.modelsCaptionKeys:2');
  });

  it('on the web hides Wiki write mode and points keys at the desktop app', () => {
    const { container } = render(<AgentsPane onClose={vi.fn()} />);
    expect(anchors(container)).toEqual(
      AGENTS_CATALOG.filter((entry) => entry.surface === 'both').map((entry) => entry.id),
    );
    expect(screen.getByTestId('app-settings-door-models').textContent).toContain('settingsAgents.modelsCaptionWeb');
  });

  it('shows no key count before the Keychain answers', () => {
    mocks.desktop = true;
    mocks.keysRead = false;
    render(<AgentsPane onClose={vi.fn()} />);
    expect(screen.getByTestId('app-settings-door-models').textContent).not.toContain('modelsCaption');
  });

  it('closes the sheet and then goes to each door', () => {
    const onClose = vi.fn();
    render(<AgentsPane onClose={onClose} />);
    fireEvent.click(screen.getByTestId('app-settings-door-mcp'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0]?.[0]).toContain('/agents/?tab=mcp');
    fireEvent.click(screen.getByTestId('app-settings-door-models'));
    expect(mocks.push.mock.calls[1]?.[0]).toContain('tab=models');
  });
});
