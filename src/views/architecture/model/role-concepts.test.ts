import { describe, expect, it, vi } from 'vitest';
import { parseArchitectureProfile } from '@/entities/architecture-profile';
import { FSD_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { deriveRoleConcepts } from './role-concepts';

describe('role concept matching', () => {
  it('reuses patterns across documents without retaining a previous profile result', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const docs = Array.from({ length: 100 }, (_, index) => ({ slug: `elements/entity-${index}`,
      frontmatter: { kind: 'element', title: `Entity ${index}`, path: `src/entities/entity-${index}/model.ts` },
    }));
    const expected = deriveRoleConcepts(profile, docs);
    const limit = new Set(profile.roles.flatMap((role) => role.paths)).size;
    const OriginalRegExp = globalThis.RegExp;
    let constructions = 0;
    vi.stubGlobal('RegExp', class extends OriginalRegExp {
      constructor(pattern: string | RegExp, flags?: string) {
        super(pattern, flags); constructions += 1;
      }
    });
    let actual;
    try { actual = deriveRoleConcepts(profile, docs); }
    finally { vi.unstubAllGlobals(); }
    expect(actual).toEqual(expected);
    expect(constructions).toBeGreaterThan(0);
    expect(constructions).toBeLessThanOrEqual(limit);
    profile.roles.find((role) => role.id === 'entities')!.paths = ['src/other/**'];
    expect(deriveRoleConcepts(profile, docs).entities).toEqual([]);
  });
});
