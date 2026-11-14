import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InsightsRedirectPage, buildInsightsRedirectHref } from './InsightsRedirectPage';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

// The fallback reads translations; the redirect is the subject, not the spinner.
vi.mock('@/shared/ui', () => ({
  RouteLoadingFallback: () => null,
}));

const target = (query: string) => buildInsightsRedirectHref(new URLSearchParams(query));

describe('the retired /ontology/insights address', () => {
  it('keeps the harness target and every other flag', () => {
    expect(target('tab=harness')).toBe('/architecture/?view=overview');
    expect(target('tab=harness&guides=off&focus=main')).toBe(
      '/architecture/?guides=off&focus=main&view=overview',
    );
  });

  it('sends the library section to the Wiki tab of the Library', () => {
    expect(target('tab=library')).toBe('/library/?tab=wiki');
    expect(target('tab=library&review=analysis:capability:x')).toBe('/library/?tab=wiki');
  });

  it('selects the concept a review or node address named, in its canonical form', () => {
    expect(target('review=analysis:capability:mcp-server')).toBe('/topology/?p=capability%3Amcp-server');
    expect(target('tab=connections&review=analysis:domain:views')).toBe('/topology/?p=domain%3Aviews');
    expect(target('node=capabilities/mcp-server')).toBe('/topology/?p=capability%3Amcp-server');
    expect(target('node=%ED%95%9C%EA%B8%80')).toBe('/topology/?p=%ED%95%9C%EA%B8%80');
  });

  it('opens the map for every other tab, a relation review, a return marker or no query', () => {
    for (const query of [
      '',
      'tab=brief',
      'tab=do-next&guides=off',
      'tab=connections&review=relation:edge-1',
      'via=insights:do-next',
      'review=analysis:',
      'node=',
    ]) {
      expect(target(query)).toBe('/topology/');
    }
  });

  it('replaces history rather than pushing, so Back never returns here', () => {
    mocks.searchParams = new URLSearchParams('tab=brief');
    render(<InsightsRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith('/topology/');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
