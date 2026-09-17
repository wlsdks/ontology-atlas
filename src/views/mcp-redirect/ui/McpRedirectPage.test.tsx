import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { McpRedirectPage, buildMcpRedirectHref } from './McpRedirectPage';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

// The fallback reads translations; the redirect is the subject, not the spinner.
vi.mock('@/shared/ui', () => ({
  RouteLoadingFallback: () => null,
}));

describe('the retired /mcp address', () => {
  it('lands on the MCP tab of Agents', () => {
    expect(buildMcpRedirectHref(new URLSearchParams())).toBe('/agents/?tab=mcp');
    expect(buildMcpRedirectHref(new URLSearchParams('tab=share'))).toBe('/agents/?tab=mcp');
  });

  it('carries its own section into the tab and keeps every other parameter', () => {
    expect(buildMcpRedirectHref(new URLSearchParams('tab=connectors'))).toBe('/agents/?tab=mcp&mcp=connectors');
    // The installed app's deep link: `install` must survive, or the connectors dialog never opens.
    expect(buildMcpRedirectHref(new URLSearchParams('tab=connectors&install=abc&focus=main'))).toBe(
      '/agents/?tab=mcp&mcp=connectors&install=abc&focus=main',
    );
  });

  it('replaces history rather than pushing, so Back never returns here', () => {
    mocks.searchParams = new URLSearchParams('tab=connectors');
    render(<McpRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith('/agents/?tab=mcp&mcp=connectors');
  });
});
