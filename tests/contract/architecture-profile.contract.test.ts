import { describe, expect, it } from 'vitest';

import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
  LOCALIZED_SUMMARY_REJECT_CASES,
  PATH_MATCH_CASES,
} from '../fixtures/architecture-profile-cases.mjs';
import {
  parseArchitectureProfile as parseWebProfile,
  deriveArchitectureProfiles as deriveWebProfiles,
  deriveArchitectureProfilesReport as deriveWebReport,
  matchesArchitecturePath as matchesWebPath,
} from '@/entities/architecture-profile';
import {
  parseArchitectureProfile as parseMcpProfile,
  findArchitectureProfiles as findMcpProfiles,
  matchesPathPattern as matchesMcpPath,
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
   * A role's sentence is part of the contract, not a screen decoration: the same `summary_<id>`
   * has to reach the blueprint and the agent brief identically, and a profile that describes only
   * some of its roles must stay valid — the field arrived after profiles existed.
   */
  it.each([
    ['web', parseWebProfile],
    ['mcp', parseMcpProfile],
  ])('%s reads role summaries, and silence where none was written', (_surface, parse) => {
    const profile = parse(FSD_PROFILE_FRONTMATTER);
    const byId = new Map(profile.roles.map((role) => [role.id, role.summary]));
    expect(byId.get('routing')).toBe(
      'Locale-prefixed Next entry wrappers. Metadata and routing only, never logic.',
    );
    expect(byId.get('views')).toBe(
      'One module per route-level screen, assembled from the layers beneath it.',
    );
    expect(byId.get('shared')).toBeUndefined();
  });

  it.each([
    ['web', parseWebProfile],
    ['mcp', parseMcpProfile],
  ])('%s refuses a summary for a role that does not exist', (_surface, parse) => {
    expect(() =>
      parse({ ...FSD_PROFILE_FRONTMATTER, summary_nowhere: 'describes nothing' }),
    ).toThrow(/summary_nowhere/);
  });

  /*
   * ⚠️ **A localized sentence is a restatement, never a second fact.** `summary_<role>` stays the
   * canonical sentence in `roles[].summary` on both surfaces and is the only one an agent brief,
   * a prompt or the CLI prints; `summary_<role>_<locale>` lands in a separate `summaries` map that
   * only the web workbench reads. Parsing them identically is what keeps a Korean reader and an
   * agent looking at one profile rather than two.
   */
  it.each([
    ['web', parseWebProfile],
    ['mcp', parseMcpProfile],
  ])('%s reads a localized summary beside the canonical one, not instead of it', (_surface, parse) => {
    const profile = parse(FSD_PROFILE_FRONTMATTER);
    const byId = new Map(profile.roles.map((role) => [role.id, role]));
    expect(byId.get('views')?.summary).toBe(
      'One module per route-level screen, assembled from the layers beneath it.',
    );
    expect(byId.get('views')?.summaries).toEqual({
      ko: '라우트가 열 수 있는 화면 하나마다 모듈 하나입니다.',
    });
    /* A role whose sentence nobody translated, and a role with no sentence at all. */
    expect(byId.get('routing')?.summaries).toEqual({});
    expect(byId.get('shared')?.summary).toBeUndefined();
    expect(byId.get('shared')?.summaries).toEqual({});
  });

  it.each(
    LOCALIZED_SUMMARY_REJECT_CASES.flatMap((row) => [
      ['web', row, parseWebProfile] as const,
      ['mcp', row, parseMcpProfile] as const,
    ]),
  )('%s refuses %o', (_surface, row, parse) => {
    expect(() => parse(row.frontmatter)).toThrow(row.message);
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
  it('refuses two different profiles wearing one slug, and names both on either surface', () => {
    const docs = [
      { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
      {
        slug: 'architecture/other',
        frontmatter: { ...FSD_PROFILE_FRONTMATTER, title: 'A different contract' },
      },
    ];
    /*
     * ⚠️ **One sentence, two ways of delivering it.** An agent reading a half-scanned vault must
     * not mistake it for a whole one, so the MCP still throws; the screen keeps the profiles it
     * could read and names the collision beside them (2026-09-03). The wording is the same on
     * both surfaces, because "which two documents?" is the same question either way.
     */
    let thrown: unknown = null;
    try {
      findMcpProfiles(docs);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/architecture\/atlas-web/);
    expect(message).toMatch(/architecture\/other/);

    const report = deriveWebReport(docs);
    expect(report.profiles).toHaveLength(1);
    expect(report.problems).toEqual([
      { documentSlug: 'architecture/other', message },
    ]);
    expect(deriveWebProfiles(docs)).toHaveLength(1);
  });

  /*
   * One glob dialect. The web occupant join (role bands on /architecture) and the MCP conformance
   * scan must place the same path in the same role; a divergence would let the screen show a
   * concept inside a role that an agent's brief says it is outside of.
   */
  it.each(PATH_MATCH_CASES.map((c) => [c.path, c.pattern, c.matches] as const))(
    'path %s vs pattern %s matches identically in web and MCP (%s)',
    (path, pattern, matches) => {
      expect(matchesWebPath(path, pattern)).toBe(matches);
      expect(matchesMcpPath(path, pattern)).toBe(matches);
    },
  );
});
