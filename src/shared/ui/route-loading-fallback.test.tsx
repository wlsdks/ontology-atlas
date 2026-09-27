import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import koMessages from '../../../messages/ko.json';
import { RouteLoadingFallback } from './route-loading-fallback';

/**
 * The placeholder establishes `#main` at once and states the one fact it knows, never progress
 * it cannot measure.
 */
function renderFallback() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <RouteLoadingFallback />
    </NextIntlClientProvider>,
  );
}

describe('RouteLoadingFallback', () => {
  it('server-renders the waiting character inside the same delayed status before hydration', () => {
    const html = renderToString(
      <NextIntlClientProvider locale="ko" timeZone="Asia/Seoul" messages={koMessages}>
        <RouteLoadingFallback />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('data-waiting-motion="running"');
    expect(html).toContain('route-loading-in');
    expect(html).toContain(koMessages.nav.surfaceLoading);
  });

  it('establishes the #main landmark and marks it busy', () => {
    renderFallback();
    const main = screen.getByTestId('route-loading-fallback');
    expect(main.id).toBe('main');
    expect(main.tagName).toBe('MAIN');
    expect(main).toHaveAttribute('aria-busy', 'true');
  });

  it('carries the marker that keeps the focus manager from treating it as a destination', () => {
    renderFallback();
    expect(screen.getByTestId('route-loading-fallback')).toHaveAttribute(
      'data-route-loading',
      'true',
    );
  });

  it('states one plain sentence instead of a blank screen', () => {
    renderFallback();
    const status = screen.getByRole('status');
    expect(status.textContent?.trim()).toBe(koMessages.nav.surfaceLoading);
    expect(screen.getAllByTestId('brand-waiting-mark')).toHaveLength(1);
    expect(status).toContainElement(screen.getByTestId('brand-waiting-mark'));
  });

  it('draws no fake progress bar or percentage', () => {
    const { container } = renderFallback();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toMatch(/%/);
  });

  it('delays the status line so a fast arrival does not flash it', () => {
    renderFallback();
    expect(screen.getByRole('status').className).toContain('route-loading-in');
  });
});
