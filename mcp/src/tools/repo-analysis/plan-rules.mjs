import { relative, sep } from 'node:path';

/**
 * Whether the active vault's project is the repository that was analyzed, and so
 * whether its validation counts speak for that repository.
 * `vaultRoot` is compared with `target` to tell a starter vault inside the repository
 * from one elsewhere.
 */
export function classifyVaultAlignment({ vaultProjectNodes, analyzedProjectSlug, aliasToSlug, target, vaultRoot }) {
  const matchingVaultProject = analyzedProjectSlug
    ? vaultProjectNodes.find(
        (node) =>
          node.slug === analyzedProjectSlug ||
          node.frontmatter?.slug === analyzedProjectSlug ||
          aliasToSlug[analyzedProjectSlug] === node.slug,
      )
    : null;
  const vaultRelativeToTarget = relative(target, vaultRoot);
  const vaultInsideTarget =
    vaultRelativeToTarget === '' ||
    (!vaultRelativeToTarget.startsWith(`..${sep}`) && vaultRelativeToTarget !== '..');
  const uninitializedVault =
    vaultProjectNodes.length === 1 &&
    vaultProjectNodes[0].slug === 'project' &&
    /^my project$/i.test(String(vaultProjectNodes[0].title ?? ''));
  const alignment = matchingVaultProject
    ? 'matching-project'
    : uninitializedVault
      ? 'uninitialized-vault'
      : vaultProjectNodes.length > 0 && analyzedProjectSlug
        ? 'mismatched-project'
        : 'unknown';
  const appliesToAnalyzedProject =
    Boolean(matchingVaultProject) || (uninitializedVault && vaultInsideTarget);
  const note = appliesToAnalyzedProject
    ? alignment === 'matching-project'
      ? 'The active vault project identity matches the analyzed repository.'
      : 'The starter vault is inside the analyzed repository; validation is a pre-bootstrap baseline.'
    : 'The active vault is not proven to describe the analyzed repository; treat these counts as active-vault diagnostics, not analyzed-project quality.';
  return { alignment, appliesToAnalyzedProject, note };
}

/** How many candidate concepts the vault already holds (by slug or alias), has ambiguous, or lacks. */
export function buildConceptDelta({ conceptCount, candidateSlugs, compiled, aliasToSlug }) {
  const existingSlugs = new Set((compiled.nodes ?? []).map((node) => node.slug));
  const ambiguousAliases = new Set(
    (compiled.ambiguousAliases ?? []).map((row) => row.alias),
  );
  const existingConceptSlugs = candidateSlugs
    .filter((slug) => existingSlugs.has(slug) || aliasToSlug[slug])
    .sort();
  const ambiguousConceptSlugs = candidateSlugs
    .filter(
      (slug) =>
        !existingSlugs.has(slug) &&
        !aliasToSlug[slug] &&
        ambiguousAliases.has(slug),
    )
    .sort();
  const newConceptSlugs = candidateSlugs
    .filter(
      (slug) =>
        !existingSlugs.has(slug) &&
        !aliasToSlug[slug] &&
        !ambiguousAliases.has(slug),
    )
    .sort();
  return {
    candidates: conceptCount,
    existing: existingConceptSlugs.length,
    ambiguous: ambiguousConceptSlugs.length,
    new: newConceptSlugs.length,
    limited: newConceptSlugs.length > 10 || ambiguousConceptSlugs.length > 10,
    sampleAmbiguousSlugs: ambiguousConceptSlugs.slice(0, 10),
    sampleNewSlugs: newConceptSlugs.slice(0, 10),
  };
}
