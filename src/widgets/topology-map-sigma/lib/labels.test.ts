import { describe, expect, it } from 'vitest';

import { extractDomainLabel } from './labels';

describe('extractDomainLabel', () => {
  it('labels docs-prefixed topology nodes as the workspace surface', () => {
    expect(extractDomainLabel('docs-vault')).toBe('Workspace');
    expect(extractDomainLabel('docs-graph')).toBe('Workspace');
  });
});
