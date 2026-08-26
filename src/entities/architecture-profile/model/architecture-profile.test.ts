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
});

/**
 * ⚠️ These are not style checks. Each one pins a constraint that was measured, and two of them
 * would silently turn this feature into the thing the standing record forbids.
 */
describe('buildArchitectureDraftPrompt', () => {
  const prompt = () => buildArchitectureDraftPrompt(null);

  /*
   * Measured on this repository: `atlas architecture` reports 18 real Feature-Sliced Design
   * violations, `shared → entities` among them. A rule derived from those same imports would emit
   * `allow_shared: [entities]` and render the repository `conforms` — reaching the standing
   * record's own falsifier, "if an unsupported scan ever renders green", by design.
   */
  it('never asks for rules to be derived from what the code happens to do', () => {
    expect(prompt()).toMatch(/no `allow_\*` keys and no `dependency_policy`/);
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
    expect(buildArchitectureDraftPrompt({
      sourceRoot: '/Users/someone/work/app',
      vaultRoot: '/Users/someone/work/app/atlas',
      cliEntry: null,
    })).toContain('/Users/someone/work/app');
    expect(prompt()).not.toMatch(/\/Users\//);
  });
});
