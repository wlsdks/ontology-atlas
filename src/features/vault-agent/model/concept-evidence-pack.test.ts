import { afterEach, describe, expect, it, vi } from 'vitest';

import { packConceptEvidence } from './concept-evidence-pack';

const input = {
  payload: { slug: 'atlas', found: true, title: 'Atlas', kind: 'domain' },
  excerpt: 'A codebase ontology.',
};

describe('packConceptEvidence — an unreadable pack', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads back what it packed', () => {
    const packed = packConceptEvidence([input]);

    expect(packed.deliveredSlugs).toEqual(['atlas']);
    expect(JSON.parse(packed.content)).toMatchObject({ concepts: [{ slug: 'atlas' }] });
  });

  /**
   * ⚠️ The parse used to be bare. A throw here does not stay here — this runs inside
   * the ACP tool pipeline, where an exception kills the whole turn rather than
   * thinning one tool result. An unreadable pack claims nothing and delivers nothing;
   * it is the same shape as a pack with no `concepts` array.
   */
  it('returns the empty pack shape instead of throwing', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new SyntaxError('Unexpected end of JSON input');
    });

    const packed = packConceptEvidence([input]);

    expect(packed.deliveredSlugs).toEqual([]);
    expect(packed.vaultChars).toBe(0);
    expect(packed.omittedCount).toBe(0);
    // The string itself still travels: the model may make sense of what we could not.
    expect(packed.content).toContain('atlas');
  });

  it('returns the same empty shape for a payload that is not an object', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(() => null);

    const packed = packConceptEvidence([input]);

    expect(packed).toMatchObject({ deliveredSlugs: [], vaultChars: 0, omittedCount: 0 });
  });
});
