import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/en/', desktop: false }));

vi.mock('@/shared/lib/navigation/use-committed-address', () => ({
  useCommittedAddress: () => ({ pathname: mocks.pathname, searchString: '' }),
}));
vi.mock('@/shared/lib/desktop-shell/desktop-shell', () => ({ isDesktopShell: () => mocks.desktop }));

const ROOT_SUBSET = { rootEntry: { redirectTitle: 'from the subset' } };

/** Fresh modules per case: the catalog cache would otherwise carry one case's fetch into the next. */
async function renderAt(pathname: string) {
  vi.resetModules();
  mocks.pathname = pathname;
  const catalog = await import('@/i18n/workbench-catalog');
  const load = vi.spyOn(catalog, 'loadWorkbenchCatalog');
  const { useTranslations } = await import('use-intl');
  const { WorkbenchMessagesProvider } = await import('./WorkbenchMessagesProvider');
  function Probe() {
    const t = useTranslations('rootEntry');
    return <p data-testid="probe">{t('redirectTitle')}</p>;
  }
  // Async `act`: a render suspended in a sync one is never retried under the test environment.
  await act(async () => {
    render(
      <Suspense fallback={<p data-testid="waiting" />}>
        <WorkbenchMessagesProvider locale="en" timeZone="UTC" rootMessages={ROOT_SUBSET}>
          <Probe />
        </WorkbenchMessagesProvider>
      </Suspense>,
    );
  });
  // The suspended render retries once the fetch settles inside `act`.
  const settle = () =>
    act(async () => {
      await catalog.loadWorkbenchCatalog('en');
    });
  return { load, settle };
}

describe('WorkbenchMessagesProvider', () => {
  beforeEach(() => {
    mocks.desktop = false;
  });

  it('renders the web root from its subset without fetching the catalog', async () => {
    const { load } = await renderAt('/en/');

    expect(screen.getByTestId('probe')).toHaveTextContent('from the subset');
    expect(load).not.toHaveBeenCalled();
  });

  it('renders every other workbench route from the whole catalog', async () => {
    const { settle } = await renderAt('/en/topology/');

    await settle();
    const probe = screen.getByTestId('probe');
    expect(probe.textContent).toMatch(/\w/);
    expect(probe).not.toHaveTextContent('from the subset');
  });

  it('gives the installed app the whole catalog at the root', async () => {
    mocks.desktop = true;
    const { settle } = await renderAt('/en/');

    await settle();
    expect(screen.getByTestId('probe')).not.toHaveTextContent('from the subset');
  });
});
