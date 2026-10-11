import { describe, expect, it } from 'vitest';

import { withBasePath } from './base-path';

// NEXT_PUBLIC_BASE_PATH is inlined at build time, so it is an empty string under
// vitest — this pins the root-deployment contract (pass through with no prefix).
describe('withBasePath (root deploy)', () => {
  it('passes absolute paths through unchanged when no base path is set', () => {
    expect(withBasePath('/logo.png')).toBe('/logo.png');
    expect(withBasePath('/en/')).toBe('/en/');
  });

  it('passes relative paths through unchanged', () => {
    expect(withBasePath('docs-vault/a.md')).toBe('docs-vault/a.md');
  });
});
