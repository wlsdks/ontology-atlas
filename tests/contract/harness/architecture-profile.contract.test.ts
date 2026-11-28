import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import GOLDEN from '../../fixtures/architecture-golden.json';
import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
  LOCALIZED_SUMMARY_REJECT_CASES,
  PATH_MATCH_CASES,
} from '../../fixtures/architecture-profile-cases.mjs';
import {
  parseArchitectureProfile as parseWebProfile,
  deriveArchitectureProfiles as deriveWebProfiles,
  deriveArchitectureProfilesReport as deriveWebReport,
  matchesArchitecturePath as matchesWebPath,
  createArchitecturePathMatcher,
} from '@/entities/architecture-profile';

/**
 * The profile contract the web reads. `tests/fixtures/architecture-golden.json` holds what the
 * script server's parser answered for the same profiles, recorded 2026-11-28.
 */
/** The matcher runs in a child process so a backtracking pattern times out instead of hanging the suite. */
function expectSpawnedMatcherRejects(path: string, pattern: string) {
  const moduleUrl = new URL('../../../src/entities/architecture-profile/model/architecture-occupants.ts', import.meta.url);
  const script = `import {matchesArchitecturePath as match} from ${JSON.stringify(moduleUrl.href)}; process.stdout.write(JSON.stringify(match(${JSON.stringify(path)}, ${JSON.stringify(pattern)})));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000 });
  expect(child.error, 'the spawned matcher must finish').toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stdout).toBe('false');
}

describe('architecture-profile/v1 contract', () => {
  it('rejects a deep nonmatch with repeated directory wildcards without stalling', () => {
    const path = `src/${'segment/'.repeat(28)}actual.ts`;
    const pattern = `src/${'**/'.repeat(16)}absent.ts`;
    expectSpawnedMatcherRejects(path, pattern);
  });

  it.each([
    ['separated directory', `src/${'segment/'.repeat(30)}actual.ts`, `src/${'**/segment/'.repeat(12)}absent.ts`],
    ['same-component', `${'a'.repeat(64)}x`, `${'*a'.repeat(12)}b`],
  ])('rejects %s wildcard ambiguity without stalling', (_kind, path, pattern) => {
    expectSpawnedMatcherRejects(path, pattern);
  });

  it('resets reused ambiguous matchers across positive, negative and UTF16 paths', () => {
    const match = createArchitecturePathMatcher();
    const cases = [
      ['src/a/bx', 'src/**/a/**/b?', true],
      ['src/a/z/bx', 'src/**/a/**/b?', true],
      ['src/a/z/b💡', 'src/**/a/**/b?', false],
      ['src/\na/z/bx', 'src/**/a/**/b?', false],
      ['aaab', '*a*a*b', true],
      ['ab', '*a*a*b', false],
      ['a\nab', '*a*a*b', true],
      ['a/b', '*a*a*b', false],
    ] as const;
    for (let pass = 0; pass < 3; pass += 1) for (const [path, pattern, expected] of cases) {
      expect(match(path, pattern)).toBe(expected);
    }
  });

  it('keeps a traversal matcher equivalent across repeated positive and negative paths', () => {
    const match = createArchitecturePathMatcher();
    for (let pass = 0; pass < 3; pass += 1) {
      for (const row of PATH_MATCH_CASES) {
        expect(match(row.path, row.pattern)).toBe(row.matches);
      }
    }
  });

  it.each([
    ['fsd', FSD_PROFILE_FRONTMATTER],
    ['hexagonal', HEXAGONAL_PROFILE_FRONTMATTER],
    ['ambiguous', AMBIGUOUS_PROFILE_FRONTMATTER],
  ] as const)('%s profile parses as the server parsed it', (name, frontmatter) => {
    const web = parseWebProfile(frontmatter);
    expect(web).toEqual(GOLDEN.profiles[name]);
  });

  it('keeps dependency usage declarations explicit, compatible, and closed', () => {
    expect(parseWebProfile(FSD_PROFILE_FRONTMATTER).dependencyUsages).toEqual(['value']);

    const { dependency_usages: _removed, ...legacy } = FSD_PROFILE_FRONTMATTER;
    expect(parseWebProfile(legacy).dependencyUsages).toEqual(['value', 'type_only']);

    for (const dependency_usages of [[], ['unknown'], ['value', 'value']]) {
      expect(() => parseWebProfile({ ...FSD_PROFILE_FRONTMATTER, dependency_usages })).toThrow(
        /dependency_usages/,
      );
    }
  });

  /*
   * A role's sentence is part of the contract, not a screen decoration: the same `summary_<id>`
   * has to reach the blueprint and the agent brief identically, and a profile that describes only
   * some of its roles must stay valid — the field arrived after profiles existed.
   */
  it('reads role summaries, and silence where none was written', () => {
    const profile = parseWebProfile(FSD_PROFILE_FRONTMATTER);
    const byId = new Map(profile.roles.map((role) => [role.id, role.summary]));
    expect(byId.get('routing')).toBe(
      'Locale-prefixed Next entry wrappers. Metadata and routing only, never logic.',
    );
    expect(byId.get('views')).toBe(
      'One module per route-level screen, assembled from the layers beneath it.',
    );
    expect(byId.get('shared')).toBeUndefined();
  });

  it('refuses a summary for a role that does not exist', () => {
    expect(() =>
      parseWebProfile({ ...FSD_PROFILE_FRONTMATTER, summary_nowhere: 'describes nothing' }),
    ).toThrow(/summary_nowhere/);
  });

  /*
   * ⚠️ **A localized sentence is a restatement, never a second fact.** `summary_<role>` stays the
   * canonical sentence in `roles[].summary` on both surfaces and is the only one an agent brief,
   * a prompt or the CLI prints; `summary_<role>_<locale>` lands in a separate `summaries` map that
   * only the web workbench reads. Parsing them identically is what keeps a Korean reader and an
   * agent looking at one profile rather than two.
   */
  it('reads a localized summary beside the canonical one, not instead of it', () => {
    const profile = parseWebProfile(FSD_PROFILE_FRONTMATTER);
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

  it.each(LOCALIZED_SUMMARY_REJECT_CASES)('refuses %o', (row) => {
    expect(() => parseWebProfile(row.frontmatter)).toThrow(row.message);
  });

  /*
   * One record reached twice is not a conflict: `pnpm docs-vault:build` mirrors the vault into
   * `public/docs-vault/`, so one profile is read twice.
   */
  it('reads a generated mirror of one profile as one profile', () => {
    const found = deriveWebProfiles([
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
  it('refuses two different profiles wearing one slug, and names both', () => {
    const docs = [
      { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
      {
        slug: 'architecture/other',
        frontmatter: { ...FSD_PROFILE_FRONTMATTER, title: 'A different contract' },
      },
    ];
    /*
     * The server throws on a collision so an agent does not mistake a half-scanned vault for a whole
     * one; the screen keeps the readable profiles and names the collision in the same words, the
     * ones the server used when its message was recorded.
     */
    const message = GOLDEN.collisionMessage;
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
   * One glob dialect. The web occupant join (role bands on /architecture) and the server's conformance
   * scan must place the same path in the same role; a divergence would let the screen show a
   * concept inside a role that an agent's brief says it is outside of. Each row states the answer
   * both give.
   */
  it.each(PATH_MATCH_CASES.map((c) => [c.path, c.pattern, c.matches] as const))(
    'path %s vs pattern %s matches (%s)',
    (path, pattern, matches) => {
      expect(matchesWebPath(path, pattern)).toBe(matches);
    },
  );
});
