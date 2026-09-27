import { describe, expect, it } from 'vitest';

import { withQuery } from './destinations';

describe('withQuery', () => {
  it('adds keys to an href that already carries a query without writing a second "?"', () => {
    expect(withQuery('/agents/?tab=mcp', { mcp: 'connectors' })).toBe('/agents/?tab=mcp&mcp=connectors');
  });

  it('starts a query on an href that has none', () => {
    expect(withQuery('/automations/', { kind: 'documents' })).toBe('/automations/?kind=documents');
  });

  it('replaces a key the href already sets instead of repeating it', () => {
    expect(withQuery('/agents/?tab=mcp', { tab: 'models' })).toBe('/agents/?tab=models');
  });
});
