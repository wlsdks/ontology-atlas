import { describe, expect, it } from 'vitest';

import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import {
  buildArchitectureAgentPrompt,
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
