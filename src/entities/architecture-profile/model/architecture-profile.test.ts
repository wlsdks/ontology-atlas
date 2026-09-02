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
