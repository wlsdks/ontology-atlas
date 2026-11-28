import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

/** Fresh modules per case: the catalog cache would otherwise carry one case's fetch into the next. */
async function renderProvider() {
  vi.resetModules();
  const catalog = await import('@/i18n/workbench-catalog');
  const load = vi.spyOn(catalog, 'loadWorkbenchCatalog');
  const { useTranslations } = await import('use-intl');
  const { WorkbenchMessagesProvider } = await import('./WorkbenchMessagesProvider');
  function Probe() {
    const t = useTranslations('nav');
    return <p data-testid="probe">{t('notificationsAriaLabel')}</p>;
  }
  // Async `act`: a render suspended in a sync one is never retried under the test environment.
  await act(async () => {
    render(
      <Suspense fallback={<p data-testid="waiting" />}>
        <WorkbenchMessagesProvider locale="en" timeZone="UTC">
          <Probe />
        </WorkbenchMessagesProvider>
      </Suspense>,
    );
  });
  return { load, settle: () => act(async () => void (await catalog.loadWorkbenchCatalog('en'))) };
}

describe('WorkbenchMessagesProvider', () => {
  it('waits for the whole catalog, then renders from it', async () => {
    const { load, settle } = await renderProvider();

    expect(load).toHaveBeenCalledWith('en');
    await settle();
    expect(screen.getByTestId('probe').textContent).toMatch(/\w/);
    expect(screen.queryByTestId('waiting')).not.toBeInTheDocument();
  });
});
