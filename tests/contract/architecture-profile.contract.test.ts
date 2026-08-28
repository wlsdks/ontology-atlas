import { describe, expect, it } from 'vitest';

import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../fixtures/architecture-profile-cases.mjs';
import {
  parseArchitectureProfile as parseWebProfile,
  deriveArchitectureProfiles as deriveWebProfiles,
} from '@/entities/architecture-profile';
import {
  parseArchitectureProfile as parseMcpProfile,
  findArchitectureProfiles as findMcpProfiles,
} from '../../mcp/src/architecture-profile.mjs';

describe('architecture-profile/v1 cross-surface contract', () => {
  it.each([
    ['fsd', FSD_PROFILE_FRONTMATTER],
    ['hexagonal', HEXAGONAL_PROFILE_FRONTMATTER],
    ['ambiguous', AMBIGUOUS_PROFILE_FRONTMATTER],
  ])('%s profile parses identically in web and MCP', (_name, frontmatter) => {
    const web = parseWebProfile(frontmatter);
    const mcp = parseMcpProfile(frontmatter);
    expect(web).toEqual({
      ...mcp,
      allows: Object.fromEntries(mcp.allows),
    });
  });

  it('keeps dependency usage declarations explicit, compatible, and closed', () => {
    expect(parseWebProfile(FSD_PROFILE_FRONTMATTER).dependencyUsages).toEqual(['value']);
    expect(parseMcpProfile(FSD_PROFILE_FRONTMATTER).dependencyUsages).toEqual(['value']);

    const { dependency_usages: _removed, ...legacy } = FSD_PROFILE_FRONTMATTER;
    expect(parseWebProfile(legacy).dependencyUsages).toEqual(['value', 'type_only']);
    expect(parseMcpProfile(legacy).dependencyUsages).toEqual(['value', 'type_only']);

    for (const dependency_usages of [[], ['unknown'], ['value', 'value']]) {
      expect(() => parseWebProfile({ ...FSD_PROFILE_FRONTMATTER, dependency_usages })).toThrow(
        /dependency_usages/,
      );
      expect(() => parseMcpProfile({ ...FSD_PROFILE_FRONTMATTER, dependency_usages })).toThrow(
        /dependency_usages/,
      );
    }
  });

  /*
   * ⚠️ **One record reached twice is not a conflict.** Measured 2026-08-26: `atlas architecture .`
   * at this repository's root died with `Duplicate architecture profile slug: atlas-web.` and
   * nothing else. The cause was the repository's own generated mirror — `pnpm docs-vault:build`
   * copies the vault into `public/docs-vault/`, so the one profile was read twice. Refusing to run
   * was wrong: there was nothing for a person to resolve, and the message named neither document.
   */
  it.each([
    ['web', (docs: Parameters<typeof deriveWebProfiles>[0]) => deriveWebProfiles(docs)],
    ['mcp', (docs: Parameters<typeof deriveWebProfiles>[0]) => findMcpProfiles(docs)],
  ])('%s reads a generated mirror of one profile as one profile', (_surface, derive) => {
    const found = derive([
      { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
      { slug: 'public-mirror/atlas-web', frontmatter: { ...FSD_PROFILE_FRONTMATTER } },
    ]);
    expect(found).toHaveLength(1);
    // The first path wins, so the mirror never displaces the source it was copied from.
    expect(found[0]?.documentSlug).toBe('architecture/atlas-web');
  });

  /*
   * ⚠️ And a real conflict must still fail closed — but name both documents, because "which two?"
   * is the whole question the old message refused to answer.
   */
  it.each([
    ['web', (docs: Parameters<typeof deriveWebProfiles>[0]) => deriveWebProfiles(docs)],
    ['mcp', (docs: Parameters<typeof deriveWebProfiles>[0]) => findMcpProfiles(docs)],
  ])('%s refuses two different profiles wearing one slug, and names both', (_surface, derive) => {
    const call = () =>
      derive([
        { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
        {
          slug: 'architecture/other',
          frontmatter: { ...FSD_PROFILE_FRONTMATTER, title: 'A different contract' },
        },
      ]);
    expect(call).toThrow(/architecture\/atlas-web/);
    expect(call).toThrow(/architecture\/other/);
  });
});
