import { describe, expect, it } from 'vitest';

import { extractDomainLabel } from './labels';

describe('extractDomainLabel', () => {
  it('labels docs-prefixed topology nodes as the source vault surface', () => {
    expect(extractDomainLabel('docs-vault')).toBe('Source Vault');
    expect(extractDomainLabel('docs-graph')).toBe('Source Vault');
  });
});
