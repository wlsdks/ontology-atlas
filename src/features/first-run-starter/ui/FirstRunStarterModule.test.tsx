import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSampleSourceCacheForTests } from '@/shared/lib/sample-source';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from '../model/first-run-starter-dismiss';
import { FirstRunStarterModule } from './FirstRunStarterModule';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  recentVaults: unknown[];
  open: ReturnType<typeof vi.fn>;
  openRecent: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: 'static' as 'static' | 'local',
  desktop: true,
  requestAgentChat: vi.fn(),
  pickedProject: '/Users/dana/my-product' as string | null,
  pickerThrows: false,
  ensureChildDir: vi.fn(async (_root: string, _name: string) => undefined),
}));

vi.mock('@/shared/lib/tauri-vault-fs', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-vault-fs')>(
    '@/shared/lib/tauri-vault-fs',
  );
  return {
    ...actual,
    isTauriVaultRuntime: () => true,
    getTauriVaultRootPath: () => mocks.pickedProject,
    createTauriVaultHandle: (rootPath: string) => ({ name: rootPath }),
    pickTauriVaultDirectory: async () => {
      if (mocks.pickerThrows) throw new Error('picker exploded');
      return mocks.pickedProject === null ? null : { name: 'picked' };
    },
    listTauriDirectoryNames: async () => ['src', 'package.json'],
    ensureTauriChildDirectory: (root: string, name: string) => mocks.ensureChildDir(root, name),
  };
});

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => mocks.desktop,
}));

vi.mock('@/shared/lib/agent-chat-intent', () => ({
  requestAgentChat: (...args: unknown[]) => mocks.requestAgentChat(...args),
}));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => 'ko',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    recentVaults: [],
    open: vi.fn(async () => ({ opened: false, starterWritten: 0, starterError: null })),
    openRecent: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

const openMoreWays = () => fireEvent.click(screen.getByTestId('first-run-starter-more-toggle'));
const openWords = () => fireEvent.click(screen.getByTestId('first-run-starter-glossary-toggle'));

describe('FirstRunStarterModule', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    mocks.desktop = true;
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.pickerThrows = false;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem('demo:sample-source:v1');
    resetSampleSourceCacheForTests();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('renders the real census as a caption line, not a meter block', () => {
    render(<FirstRunStarterModule concepts={102} relations={478} domains={6} />);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    const scale = screen.getByTestId('first-run-starter-sample-scale');
    expect(scale).toHaveTextContent('sampleScale');
    expect(screen.queryByText('102')).not.toBeInTheDocument();
    expect(screen.queryByText('478')).not.toBeInTheDocument();
  });

  it('opens with one sample line, a heading and one body sentence above the actions', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter-sample-line')).toHaveTextContent('sampleLineStorefront');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('headline');
    expect(screen.getByTestId('first-run-starter-context')).toHaveTextContent('body');
    const card = screen.getByTestId('first-run-starter');
    const order = ['first-run-starter-sample-line', 'first-run-starter-headline', 'first-run-starter-context', 'first-run-starter-open'];
    const positions = order.map((id) => [...card.querySelectorAll('[data-testid]')].findIndex((el) => el.getAttribute('data-testid') === id));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('keeps one primary and one secondary action on the face and folds the rest', () => {
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        agentAvailable
        onStartTour={vi.fn()}
        onEnablePlainMode={vi.fn()}
      />,
    );
    const card = screen.getByTestId('first-run-starter');
    const faceButtons = [...card.querySelectorAll('button')]
      .filter((button) => !button.closest('[inert]'))
      .map((button) => button.getAttribute('data-testid'));
    expect(faceButtons).toEqual([
      'first-run-starter-open',
      'first-run-tour-cta',
      'first-run-starter-sample-source-storefront',
      'first-run-starter-sample-source-dogfood',
      'first-run-starter-more-toggle',
      'first-run-starter-glossary-toggle',
    ]);
    for (const folded of [
      'first-run-starter-create',
      'first-run-starter-dismiss',
      'first-run-starter-cli-toggle',
      'first-run-plain-toggle',
      'first-run-build-from-code',
      'first-run-starter-glossary',
    ]) {
      expect(screen.queryByTestId(folded), folded).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('first-run-starter-more-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('first-run-starter-glossary-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('names the other sample in the sample line once it is chosen', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'dogfood');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.getByTestId('first-run-starter-sample-line')).toHaveTextContent('sampleLineDogfood');
    expect(screen.queryByText('sampleRelationExample')).not.toBeInTheDocument();
  });

  it('hides the ⌘O badge on non-Apple platforms', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter-open')).not.toHaveTextContent('⌘O');
  });

  it('shows the ⌘O badge on Apple platforms', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
    Object.defineProperty(window.navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    try {
      render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
      expect(screen.getByTestId('first-run-starter-open')).toHaveTextContent('⌘O');
    } finally {
      if (original) Object.defineProperty(window.navigator, 'platform', original);
    }
  });

  it('renders the tour CTA when onStartTour is provided and routes the click', () => {
    const onStartTour = vi.fn();
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} onStartTour={onStartTour} />,
    );
    const cta = screen.getByTestId('first-run-tour-cta');
    expect(cta.className).toContain('h-10');
    expect(screen.getByTestId('first-run-starter-open').className).toContain('h-10');
    fireEvent.click(cta);
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('renders no tour CTA when onStartTour is omitted', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.queryByTestId('first-run-tour-cta')).not.toBeInTheDocument();
  });

  it('promotes the plain-mode hint to a one-click toggle when the callback is provided', () => {
    const onEnablePlainMode = vi.fn();
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        onEnablePlainMode={onEnablePlainMode}
      />,
    );
    openWords();
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('first-run-plain-toggle'));
    expect(onEnablePlainMode).toHaveBeenCalledTimes(1);
  });

  it('hides the plain-mode toggle entirely once plain mode is already on', () => {
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        onEnablePlainMode={vi.fn()}
        audiencePlain
      />,
    );
    openWords();
    expect(screen.getByTestId('first-run-starter-glossary')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-plain-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
  });

  it('does not render once a vault is active (local mode)', () => {
    mocks.mode = 'local';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('does not render before the vault restore attempt has settled', () => {
    mocks.vault.restoreAttempted = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('opens the guide sheet first, then wires "choose existing" to vault.open()', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(mocks.vault.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('vault-guide-pick-existing'));
    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('the sheet\'s "start fresh" opens a folder that is seeded with the starter when empty', async () => {
    mocks.vault.open = vi.fn(async () => ({ opened: true, starterWritten: 12, starterError: null }));
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-create'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('vault-guide-create-new'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledWith({ starter: { locale: 'ko', shape: undefined } });
    });
  });

  it('dismissing hides the module and persists for the session', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBe('1');
  });

  it('does not render at all on a later mount within the same session', () => {
    window.sessionStorage.setItem(FIRST_RUN_STARTER_DISMISSED_KEY, '1');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('leaves a quiet reopen row after dismiss and restores the card on click', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    const reopen = screen.getByTestId('first-run-starter-reopen');
    fireEvent.click(reopen);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  it('keeps the sample signal alive after the card collapses — both ways', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();

    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-sample-signal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('first-run-starter-reopen'));
    fireEvent.click(screen.getByTestId('first-run-starter-sample-source-dogfood'));
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-sample-signal')).toBeInTheDocument();
  });

  it('auto-opens the folder guide sheet once on the very first visit', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '1');
    window.localStorage.removeItem('vault-open-guide:auto:v1');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    expect(window.localStorage.getItem('vault-open-guide:auto:v1')).toBe('1');
    vi.useRealTimers();
  });

  it('does not auto-open the folder guide sheet on later visits', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('Escape while the guide sheet is open closes the sheet, not the card', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  it('Escape dismisses the module', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('keeps the CLI bootstrap command folded under more ways to start, then under its own row', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter-cli-toggle')).not.toBeInTheDocument();
    openMoreWays();
    expect(screen.getByTestId('first-run-starter-cli-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('first-run-starter-cli-bridge')).not.toBeInTheDocument();
    expect(
      screen.queryByText('node cli/src/index.mjs init && node cli/src/index.mjs bootstrap'),
    ).not.toBeInTheDocument();
  });

  it('reveals the source-checkout command and says it is source-only when expanded', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));

    expect(screen.getByTestId('first-run-starter-cli-bridge')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-cli-source-only')).toHaveTextContent(
      'cliBridgeSourceOnly',
    );
    expect(
      screen.getByText('node cli/src/index.mjs init && node cli/src/index.mjs bootstrap'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('npx node $ATLAS/cli/src/index.mjs init && npx node $ATLAS/cli/src/index.mjs bootstrap'),
    ).not.toBeInTheDocument();
  });

  it('renders the command as a full-width wrapping code line — never mid-word ellipsis', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));

    const code = screen.getByText(
      'node cli/src/index.mjs init && node cli/src/index.mjs bootstrap',
    );
    expect(code.tagName).toBe('CODE');
    expect(code.className).not.toContain('truncate');
    expect(code.className).toContain('whitespace-pre-wrap');
    expect(code.className).toContain('break-words');
  });

  it('demotes both FSA CTAs to an honest notice + download link when the browser is unsupported', () => {
    mocks.vault.status = 'unsupported';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-create')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-unsupported')).toHaveTextContent('unsupportedNotice');
    expect(screen.getByTestId('first-run-starter-unsupported-cta')).toHaveAttribute(
      'href',
      '/download/',
    );
    openMoreWays();
    expect(screen.queryByTestId('first-run-starter-create')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-dismiss')).toBeInTheDocument();
  });

  it('falls back to the plain-mode gear hint under the words disclosure without a callback', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
    openWords();
    const hint = screen.getByTestId('first-run-starter-plain-mode-hint');
    expect(hint).toHaveTextContent('plainModeHint');
  });

  it('renders the sample-source segment defaulting to "storefront" and persists a switch to "dogfood"', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const dogfoodTab = screen.getByTestId('first-run-starter-sample-source-dogfood');
    const storefrontTab = screen.getByTestId('first-run-starter-sample-source-storefront');
    expect(storefrontTab).toHaveAttribute('aria-checked', 'true');
    expect(dogfoodTab).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(dogfoodTab);

    expect(window.localStorage.getItem('demo:sample-source:v1')).toBe('dogfood');
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-reopen')).toBeInTheDocument();
  });

  it('keeps an explicitly persisted "dogfood" choice after the default flipped', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'dogfood');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-sample-source-dogfood')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('does not collapse the card when the already-selected source is clicked again', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );

    fireEvent.click(screen.getByTestId('first-run-starter-sample-source-storefront'));

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-reopen')).not.toBeInTheDocument();
  });

  it('exposes the sample source as an exclusive selection, not a tablist', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const group = screen.getByTestId('first-run-starter-sample-source');
    expect(group).toHaveAttribute('role', 'radiogroup');
    expect(group.querySelectorAll('[role="tab"]')).toHaveLength(0);
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('renders the storefront tab before the dogfood tab', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const tabs = screen
      .getByTestId('first-run-starter-sample-source')
      .querySelectorAll('[role="radio"]');
    expect(tabs[0]).toHaveAttribute(
      'data-testid',
      'first-run-starter-sample-source-storefront',
    );
    expect(tabs[1]).toHaveAttribute(
      'data-testid',
      'first-run-starter-sample-source-dogfood',
    );
  });

  it('restores a previously persisted "storefront" sample-source choice on mount', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'storefront');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-sample-source-storefront')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('first-run-starter-sample-line')).toHaveTextContent(
      'sampleLineStorefront',
    );
    expect(screen.getByTestId('first-run-starter-sample-line')).not.toHaveTextContent(
      'sampleLineDogfood',
    );
  });

  it('copies the CLI bootstrap command to the clipboard once the disclosure is open', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));
    fireEvent.click(screen.getByTestId('first-run-starter-cli-bridge-copy'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'node cli/src/index.mjs init && node cli/src/index.mjs bootstrap',
      );
    });
  });
});

describe('FirstRunStarterModule renders the guide or INDEX exclusively', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem('demo:sample-source:v1');
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('does not render INDEX children while the guide is expanded', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('shows a one-row return and INDEX children after closing', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-reopen')).toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('restores the guide to the panel when return is pressed', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    openMoreWays();
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));
    fireEvent.click(screen.getByTestId('first-run-starter-reopen'));

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('draws only INDEX in local vault mode', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-reopen')).not.toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });
});

describe('FirstRunStarterModule yields to INDEX when a lens is active', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    mocks.desktop = true;
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.pickerThrows = false;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    resetSampleSourceCacheForTests();
  });

  it('collapses the card and renders children when lensActive turns on', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body'), 'the card must fill the panel first').toBeNull();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'INDEX did not open when the lens turned on').toBeInTheDocument();
  });

  it('the tour pointing at the INDEX folds the card for that step, and gives it back after', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body')).toBeNull();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} indexSpotlit>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'the tour lit the INDEX and the list did not open').toBeInTheDocument();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body'), 'the step was left and the card did not come back').toBeNull();
  });

  it("the tour pointing at the command opens both disclosures for that step, and the person's toggle rules after", () => {
    const { rerender } = render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.getByTestId('first-run-starter-more-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('first-run-starter-cli-toggle')).not.toBeInTheDocument();

    rerender(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentSpotlit />);
    expect(screen.getByTestId('first-run-starter-more-toggle'), 'the tour lit the command and its group stayed shut').toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('first-run-starter-cli-toggle'), 'the tour lit the command and the disclosure stayed shut').toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('first-run-starter-cli-bridge')).toBeInTheDocument();

    rerender(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.getByTestId('first-run-starter-more-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('first-run-starter-cli-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays collapsed when the lens turns off', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body')).toBeInTheDocument();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'the tree disappeared when the lens turned off').toBeInTheDocument();
  });

  it('offers the build-from-code door under more ways to start and says it asks before writing', async () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.queryByTestId('first-run-build-from-code')).toBeNull();
    openMoreWays();
    const door = screen.getByTestId('first-run-build-from-code');
    expect(door).toHaveTextContent('buildFromCodeLabel');
    expect(screen.getByTestId('first-run-starter')).toHaveTextContent('buildFromCodeHint');

    await act(async () => {
      fireEvent.click(door);
    });

    expect(screen.getByTestId('build-from-code-path')).toHaveTextContent(
      '/Users/dana/my-product/atlas',
    );
    expect(
      mocks.ensureChildDir,
      'created a folder at the path preview step',
    ).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('build-from-code-go'));
    });
    expect(mocks.ensureChildDir).toHaveBeenCalledWith('/Users/dana/my-product', 'atlas');
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull());
    expect(mocks.vault.openRecent).toHaveBeenCalledTimes(1);
    expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1);
  });

  it('creates nothing and clears the path on cancel', async () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    await screen.findByTestId('build-from-code-path');
    fireEvent.click(screen.getByTestId('build-from-code-cancel'));
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull());
    expect(mocks.ensureChildDir).not.toHaveBeenCalled();
  });

  it('shows the door to someone who opened folders many times without building a map', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={4} relations={2} domains={1} mapUnbuilt agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter'), 'the card was already done').toBeNull();
    expect(
      screen.getByTestId('index-build-from-code'),
      'opening folders many times must not count as done',
    ).toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('hides the door once code is connected', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={40} relations={30} domains={5} agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
  });

  it('reports a failure that happens before the project pick', async () => {
    mocks.pickerThrows = true;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    expect(screen.getByTestId('first-run-build-error')).toBeInTheDocument();
  });

  it('does not draw the door without an agent to hand off to', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    openMoreWays();
    expect(screen.getByTestId('first-run-starter-create')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-build-from-code')).toBeNull();
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });

  it('does not draw the code-owner row without an agent', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={4} relations={2} domains={1} mapUnbuilt>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('has no door at all on the web', () => {
    mocks.desktop = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    openMoreWays();
    expect(screen.getByTestId('first-run-starter-create')).toBeInTheDocument();
    expect(
      screen.queryByTestId('first-run-build-from-code'),
      'drew the door without an agent to hand off to',
    ).toBeNull();
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });
});
