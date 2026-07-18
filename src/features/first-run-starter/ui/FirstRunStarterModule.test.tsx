import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from '../model/first-run-starter-dismiss';
import { FirstRunStarterModule } from './FirstRunStarterModule';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  open: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: 'static' as 'static' | 'local',
}));

vi.mock('@/features/docs-vault-local', async () => {
  const actual = await vi.importActual<typeof import('@/features/docs-vault-local')>(
    '@/features/docs-vault-local',
  );
  return { ...actual, useLocalVault: () => mocks.vault };
});

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

describe('FirstRunStarterModule', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
  });

  it('renders the real census numbers passed in (concepts/relations/domains)', () => {
    render(<FirstRunStarterModule concepts={102} relations={478} domains={6} />);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('478')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('does not render once a vault is active (local mode)', () => {
    mocks.mode = 'local';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('does not render before the vault restore attempt has settled', () => {
    mocks.vault.restoreAttempted = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('wires "open my folder" to vault.open() directly', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));

    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('scaffolds a starter structure after "create a new vault" opens an empty folder', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-create'));

    await waitFor(() => {
      expect(mocks.vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
  });

  it('dismissing hides the module and persists for the session', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBe('1');
  });

  it('does not render at all on a later mount within the same session', () => {
    window.sessionStorage.setItem(FIRST_RUN_STARTER_DISMISSED_KEY, '1');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('Escape dismisses the module', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });
});
