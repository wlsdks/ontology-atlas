import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_ALLOWED_EDGES,
  FSD_FORBIDDEN_EDGE,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_ALLOWED_EDGES,
  HEXAGONAL_FORBIDDEN_EDGE,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../tests/fixtures/architecture-profile-cases.mjs';
import {
  buildArchitectureBrief,
  evaluateArchitectureConformance,
  findArchitectureProfiles,
  parseArchitectureProfile,
} from './architecture-profile.mjs';

test('feature-sliced profile accepts lower dependencies and rejects an upward edge', () => {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  const green = evaluateArchitectureConformance(profile, {
    edges: [
      ...FSD_ALLOWED_EDGES,
      {
        from: 'src/shared/lib/date.test.ts',
        to: 'src/entities/project/model/project.ts',
        kind: 'static',
        importUsage: 'type_only',
      },
    ],
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
  assert.equal(green.status, 'conforms');
  assert.equal(green.violations.length, 0);
  assert.ok(green.roles.every((role) => role.matchedFiles.length > 0));

  const red = evaluateArchitectureConformance(profile, {
    edges: [...FSD_ALLOWED_EDGES, FSD_FORBIDDEN_EDGE],
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
  assert.equal(red.status, 'violated');
  assert.deepEqual(red.violations[0], {
    fromRole: 'shared',
    toRole: 'entities',
    from: FSD_FORBIDDEN_EDGE.from,
    to: FSD_FORBIDDEN_EDGE.to,
    kind: 'static',
    importUsage: 'value',
    rule: 'lower-only',
  });
});

test('profile-declared usages exclude type-only verdicts while unknown stays fail-closed', () => {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  assert.deepEqual(profile.dependencyUsages, ['value']);

  const typeOnly = evaluateArchitectureConformance(profile, {
    edges: [
      ...FSD_ALLOWED_EDGES,
      { ...FSD_FORBIDDEN_EDGE, importUsage: 'type_only' },
    ],
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
  assert.equal(typeOnly.status, 'conforms');
  assert.equal(typeOnly.violationCount, 0);
  assert.equal(typeOnly.excludedByUsage, 1);
  const sharedToEntities = typeOnly.observedRoleEdges.find(
    (edge) => edge.fromRole === 'shared' && edge.toRole === 'entities',
  );
  assert.deepEqual(sharedToEntities?.importUsageCounts, {
    value: 0,
    type_only: 1,
    unknown: 0,
  });
  assert.equal(sharedToEntities?.evidence[0]?.importUsage, 'type_only');

  const unknown = evaluateArchitectureConformance(profile, {
    edges: [
      ...FSD_ALLOWED_EDGES,
      { ...FSD_FORBIDDEN_EDGE, importUsage: 'unknown' },
    ],
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.violationCount, 0);
  assert.equal(unknown.unknown.unknownImportUsages, 1);
});

test('hexagonal profile keeps pattern axes independent and catches domain to adapter', () => {
  const profile = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
  assert.deepEqual(profile.patterns, [
    { axis: 'dependency', name: 'hexagonal' },
    { axis: 'presentation', name: 'mvp' },
  ]);

  const result = evaluateArchitectureConformance(profile, {
    edges: [...HEXAGONAL_ALLOWED_EDGES, HEXAGONAL_FORBIDDEN_EDGE],
    filesScanned: 8,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
  assert.equal(result.status, 'violated');
  assert.equal(result.violations[0]?.rule, 'allow-domain');
});

test('unmapped source or unsupported language stays unknown instead of green', () => {
  const profile = parseArchitectureProfile(AMBIGUOUS_PROFILE_FRONTMATTER);
  const result = evaluateArchitectureConformance(profile, {
    edges: [{ from: 'src/misc/a.py', to: 'src/core/b.py', kind: 'static', importUsage: 'value' }],
    filesScanned: 2,
    coverage: { allDetectedLanguagesSupported: false, supportedLanguages: ['python'] },
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.unknown.unmappedEdges, 1);
  assert.equal(result.unknown.coverageIncomplete, true);
});

test('architecture brief gives an agent scope, rules, evidence, and a plan contract', () => {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  const brief = buildArchitectureBrief(profile, {
    rootPath: '/repo',
    edges: FSD_ALLOWED_EDGES,
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
  assert.equal(brief.contract, 'architectureBrief:v1');
  assert.equal(brief.sideEffect, 0);
  assert.equal(brief.profile.slug, 'atlas-web');
  assert.deepEqual(brief.profile.dependencyUsages, ['value']);
  assert.deepEqual(brief.agentPlanContract.requiredFields, [
    'touchedRoles',
    'plannedPaths',
    'expectedNewDependencies',
    'crossedBoundaries',
    'preservedInterfaces',
    'verificationCommands',
    'unknowns',
  ]);
  assert.ok(brief.nextActions.some((action) => action.id === 'plan_within_architecture'));
});

test('profile discovery ignores ontology docs and rejects duplicate profile slugs', () => {
  const profiles = findArchitectureProfiles([
    { slug: 'ontology-atlas', frontmatter: { kind: 'project', title: 'Ontology Atlas' } },
    { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
  ]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].slug, 'atlas-web');
  assert.equal(profiles[0].documentSlug, 'architecture/atlas-web');

  /*
   * ⚠️ **This expectation changed on 2026-08-26, and the reason is a measured crash.**
   *
   * `atlas architecture .` at the repository root died with `Duplicate architecture profile slug:
   * atlas-web.` and nothing else. The cause was the repository's own generated mirror --
   * `pnpm docs-vault:build` copies the vault into `public/docs-vault/`, so the one profile was read
   * twice. Refusing to run was wrong: the two documents said exactly the same thing, so there was
   * nothing for a person to resolve, and the message named neither path.
   *
   * Identical `profile_uid` with identical frontmatter is therefore one record reached by two
   * paths, and the first one wins. A copy-paste mistake is not hidden by this: the moment somebody
   * edits one of the two copies the contents disagree and the throw below fires, naming both.
   */
  const mirrored = findArchitectureProfiles([
    { slug: 'architecture/atlas-web', frontmatter: FSD_PROFILE_FRONTMATTER },
    { slug: 'public-mirror/atlas-web', frontmatter: { ...FSD_PROFILE_FRONTMATTER } },
  ]);
  assert.equal(mirrored.length, 1);
  assert.equal(mirrored[0].documentSlug, 'architecture/atlas-web');

  // A real disagreement still fails closed -- and now says which two documents to look at.
  assert.throws(
    () => findArchitectureProfiles([
      { slug: 'architecture/a', frontmatter: FSD_PROFILE_FRONTMATTER },
      {
        slug: 'architecture/b',
        frontmatter: { ...FSD_PROFILE_FRONTMATTER, title: 'A different contract' },
      },
    ]),
    (error) =>
      /duplicate architecture profile slug/i.test(error.message)
      && error.message.includes('architecture/a')
      && error.message.includes('architecture/b'),
  );
});
