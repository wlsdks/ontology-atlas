import { describe, expect, it } from 'vitest';

import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import {
  buildArchitectureAgentPrompt,
  buildArchitectureDraftPrompt,
  deriveArchitectureProfiles,
  deriveArchitectureProfilesReport,
  parseArchitectureProfile,
} from './architecture-profile';

describe('architecture profile read model', () => {
  it.each([
    FSD_PROFILE_FRONTMATTER,
    HEXAGONAL_PROFILE_FRONTMATTER,
    AMBIGUOUS_PROFILE_FRONTMATTER,
  ])('parses the shared profile contract', (frontmatter) => {
    const profile = parseArchitectureProfile(frontmatter);
    expect(profile.contract).toBe('architecture-profile/v1');
    expect(profile.roles.length).toBeGreaterThan(1);
    expect(profile.patterns.length).toBeGreaterThan(0);
  });

  it('derives only architecture documents from a vault manifest', () => {
    const profiles = deriveArchitectureProfiles([
      { slug: 'ontology-atlas', frontmatter: { kind: 'project', title: 'Ontology Atlas' } },
      { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
    ]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.slug).toBe('atlas-web');
    expect(profiles[0]?.documentSlug).toBe('architecture/atlas-web');
  });

  /*
   * ⚠️ **One unreadable document used to take the route down with it.** `/architecture` derives
   * profiles inside a render-phase `useMemo`, so before 2026-09-03 a single unknown key in a
   * single file threw for the whole vault and replaced every profile with an error boundary — the
   * person who added one line lost the screen that would have named it. The parse is unchanged per
   * document; only the failure is now a named report beside what did load.
   */
  it('keeps the readable profiles and names the document it could not read', () => {
    const report = deriveArchitectureProfilesReport([
      {
        slug: 'architecture/broken',
        frontmatter: { ...FSD_PROFILE_FRONTMATTER, profile_slug: 'broken', summary_ghost_ko: 'x' },
      },
      { slug: 'architecture/payments', frontmatter: HEXAGONAL_PROFILE_FRONTMATTER },
    ]);
    expect(report.profiles.map((profile) => profile.slug)).toEqual(['payments-core']);
    expect(report.problems).toEqual([
      {
        documentSlug: 'architecture/broken',
        message: 'summary_ghost_ko describes a role that does not exist.',
      },
    ]);
    /* The list callers already had is the report's profiles, so no caller has to learn a shape. */
    expect(
      deriveArchitectureProfiles([
        {
          slug: 'architecture/broken',
          frontmatter: { ...FSD_PROFILE_FRONTMATTER, profile_slug: 'broken', summary_ghost_ko: 'x' },
        },
        { slug: 'architecture/payments', frontmatter: HEXAGONAL_PROFILE_FRONTMATTER },
      ]).map((profile) => profile.slug),
    ).toEqual(['payments-core']);
  });

  /* A slug collision is a problem entry too, so one bad pair cannot blank the folder either. */
  it('reports a slug collision instead of throwing, and keeps the first document', () => {
    const report = deriveArchitectureProfilesReport([
      { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
      {
        slug: 'architecture/other',
        frontmatter: { ...FSD_PROFILE_FRONTMATTER, title: 'A different contract' },
      },
    ]);
    expect(report.profiles.map((profile) => profile.documentSlug)).toEqual([
      'architecture/atlas-web',
    ]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.documentSlug).toBe('architecture/other');
    expect(report.problems[0]?.message).toContain('architecture/atlas-web');
    expect(report.problems[0]?.message).toContain('architecture/other');
  });

  it('builds an executable architecture-first agent handoff', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const prompt = buildArchitectureAgentPrompt(profile);
    expect(prompt).toContain('inspect_architecture');
    expect(prompt).toContain('"profileSlug":"atlas-web"');
    expect(prompt).toContain('architectureChangePlan:v1');
    expect(prompt).toContain('Do not treat unknown as compliant');
    expect(prompt).toContain('current observation receipt for this revision');
    expect(prompt).toContain('reviewed profile remains architecture intent');
    expect(prompt).toContain('"contract":"architectureAgentTask:v1"');
    expect(prompt).toContain('"kind":"change"');
    expect(prompt).not.toContain('source of truth for this run');
    expect(prompt).toContain('CLI fallback unavailable from this surface');
    expect(prompt).not.toContain('/absolute/path');
  });

  it('includes exact installed paths and a runnable CLI fallback when they are verified', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const prompt = buildArchitectureAgentPrompt(profile, {
      sourceRoot: '/Users/dana/Atlas Source',
      vaultRoot: '/Users/dana/Atlas Source/docs/ontology',
      cliEntry: '/Users/dana/Atlas Source/cli/src/index.mjs',
    });
    expect(prompt).toContain(
      'inspect_architecture with {"rootPath":"/Users/dana/Atlas Source","profileSlug":"atlas-web"}',
    );
    expect(prompt).toContain(
      "node '/Users/dana/Atlas Source/cli/src/index.mjs' architecture '/Users/dana/Atlas Source' --vault '/Users/dana/Atlas Source/docs/ontology' --profile 'atlas-web' --json",
    );
  });

  it('binds the visible stage, selected role, and persisted receipt without calling it current', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const prompt = buildArchitectureAgentPrompt(
      profile,
      {
        sourceRoot: '/Users/dana/product',
        vaultRoot: '/Users/dana/vault',
        cliEntry: null,
      },
      {
        kind: 'verify',
        stage: 'verify',
        selectedRole: 'features',
        receipt: {
          profileContentHash: `sha256:${'ab'.repeat(32)}`,
          measuredAt: '2026-09-02T00:00:00.000Z',
          source: { kind: 'git', revision: 'ff57e45', dirty: true },
          status: 'violated',
          violationCount: 2,
          unmappedEdges: 4,
          unruledEdges: 1,
        },
      },
    );
    expect(prompt).toContain('"kind":"verify"');
    expect(prompt).toContain('"stage":"verify"');
    expect(prompt).toContain('"selectedRole":"features"');
    expect(prompt).toContain('"revision":"ff57e45"');
    expect(prompt).toContain('This is a verification task');
    expect(prompt).toContain('visible receipt may be stale');
  });

  /*
   * ⚠️ One table over every task kind, so the next kind cannot fall through to a sentence written
   * for another one (review, 2026-09-03: a two-way branch would have labelled `improve` "a
   * verification task"). Every task states the profile, the receipt or its absence, the selected
   * role, and refuses to write before the person has seen the result.
   */
  it.each(['change', 'verify', 'improve'] as const)(
    'binds the profile, the receipt state, and the selected role for a %s task',
    (kind) => {
      const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
      const receipt = {
        profileContentHash: `sha256:${'ab'.repeat(32)}`,
        measuredAt: '2026-09-02T00:00:00.000Z',
        source: { kind: 'git' as const, revision: 'ff57e45', dirty: false },
        status: 'conforms' as const,
        violationCount: 0,
        unmappedEdges: 2,
        unruledEdges: 1,
      };
      for (const bound of [receipt, null]) {
        const prompt = buildArchitectureAgentPrompt(profile, null, {
          kind,
          stage: 'understand',
          selectedRole: 'views',
          receipt: bound,
        });
        expect(prompt).toContain(`"kind":"${kind}"`);
        expect(prompt).toContain('"slug":"atlas-web"');
        expect(prompt).toContain('"selectedRole":"views"');
        if (bound) expect(prompt).toContain('"revision":"ff57e45"');
        else expect(prompt).toContain('"receipt":null');
        if (kind !== 'verify') expect(prompt).not.toContain('This is a verification task');
        expect(prompt).toMatch(
          kind === 'change'
            ? /Before editing, return an architectureChangePlan/
            : kind === 'verify'
              ? /This is a verification task/
              : /This is an improvement-finding task/,
        );
      }
    },
  );

  /*
   * The same refusal the draft carries: an agent may not derive a rule, a role name, or a pattern
   * from what the code does today, whichever button asked. `improve` finds and asks; it does not
   * propose, and it writes nothing.
   */
  it('lets an improvement task find disagreements and ask, never propose a rule or write', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const prompt = buildArchitectureAgentPrompt(profile, null, {
      kind: 'improve',
      stage: 'understand',
      selectedRole: null,
      receipt: null,
    });
    expect(prompt).toMatch(/no `allow_\*` keys, no `dependency_policy`, and no `dependency_usages`/);
    expect(prompt).toMatch(/propose none/);
    expect(prompt).toMatch(/Do not name a pattern, do not rename a role/);
    expect(prompt).toMatch(/Write nothing/);
    expect(prompt).toMatch(/you do not guess/);
    expect(prompt).toContain('No persisted receipt is bound to this screen');
  });

  it('tells a verifier that an unbound receipt is absent instead of sending it to the filesystem', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const prompt = buildArchitectureAgentPrompt(profile, null, {
      kind: 'verify',
      stage: 'understand',
      selectedRole: null,
      receipt: null,
    });
    expect(prompt).toContain('No persisted receipt is bound to this screen');
    expect(prompt).toContain('Do not search the filesystem for one');
  });
});

/**
 * ⚠️ These are not style checks. Each one pins a constraint that was measured, and two of them
 * would silently turn this feature into the thing the standing record forbids.
 */
describe('buildArchitectureDraftPrompt', () => {
  const prompt = () => buildArchitectureDraftPrompt(null);

  /*
   * Observed edges can prove what the source currently does, but cannot declare whether a
   * direction or import usage is allowed. Deriving any of those rules from the same observation
   * would make the status quo self-approving.
   */
  it('never asks for rules to be derived from what the code happens to do', () => {
    expect(prompt()).toMatch(
      /no `allow_\*` keys, no `dependency_policy`, and no `dependency_usages`/,
    );
    expect(prompt()).toMatch(/unknown/);
  });

  /*
   * "A pattern label is never inferred from folders." A role id is that claim in miniature, so the
   * sentence has to refuse both and hand both back to the person.
   */
  it('asks the person to name the architecture and the groups, and refuses to guess either', () => {
    const text = prompt();
    expect(text).toMatch(/Do not name a pattern/);
    expect(text).toMatch(/do not give a group an architectural name/);
    expect(text).toMatch(/you do not guess them/);
  });

  /*
   * The other falsifier: "if a profile becomes a second source of observed imports." Evidence
   * points at the authorities a human already wrote.
   */
  it('keeps observed edges out of the evidence field', () => {
    expect(prompt()).toMatch(/never a list of the edges you just observed/);
  });

  it('keeps the record out of the map — no kind, no uid', () => {
    expect(prompt()).toMatch(/no `kind:` and no `uid:`/);
  });

  /*
   * A drafted record must say a machine drafted it. `created_by` is a contract-tested vocabulary,
   * and an unstamped file would wear the person's authorship.
   */
  it('stamps the draft as machine-written', () => {
    expect(prompt()).toMatch(/created_by: agent:/);
  });

  it('names an absolute source root when the desktop bridge knows one, and never invents one', () => {
    const bound = buildArchitectureDraftPrompt({
      sourceRoot: '/Users/someone/work/app',
      vaultRoot: '/Users/someone/work/app/atlas',
      cliEntry: null,
    });
    expect(bound).toContain('/Users/someone/work/app');
    expect(bound).toContain('"vaultRoot":"/Users/someone/work/app/atlas"');
    expect(bound).toContain('"kind":"draft"');
    expect(prompt()).not.toMatch(/\/Users\//);
  });
});
