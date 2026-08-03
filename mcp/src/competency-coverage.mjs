/**
 * Derive quantifier coverage for competency questions that say "each".
 *
 * Callers supply their own trusted target inventory. Proposal validation has
 * canonical capability paths; fresh-receipt validation has only the compiled
 * containment graph. Both still share the same target and relation semantics.
 */
export function evaluateQuantifiedCompetencyCoverage({
  id,
  domains = [],
  capabilities = [],
  witnesses,
  requireCapabilityPaths = false,
} = {}) {
  if (id !== 'abilities' && id !== 'evidence') return null;

  const witnessedConcepts = new Set(witnesses?.concepts ?? []);
  if (id === 'evidence') {
    const targetSet = unique(capabilities.map((row) => row.slug));
    const witnessedPaths = new Set(witnesses?.paths ?? []);
    const covered = unique(capabilities
      .filter((row) =>
        witnessedConcepts.has(row.slug)
        && (!requireCapabilityPaths || (
          typeof row.path === 'string'
          && row.path.length > 0
          && witnessedPaths.has(row.path)
        )))
      .map((row) => row.slug));
    return coverage(targetSet, covered);
  }

  const targetSet = unique(domains.map((row) => row.slug));
  const capabilityDomains = new Map(
    capabilities.map((row) => [row.slug, row.domain]),
  );
  const covered = unique((witnesses?.relations ?? [])
    .filter((relation) =>
      (relation?.type === 'capabilities' || relation?.type === 'contains')
      && capabilityDomains.get(relation.to) === relation.from
      && witnessedConcepts.has(relation.to))
    .map((relation) => relation.from));
  return coverage(targetSet, covered);
}

function coverage(targetSet, coveredCandidates) {
  const coveredSet = new Set(coveredCandidates);
  const covered = targetSet.filter((slug) => coveredSet.has(slug));
  return {
    targetSet,
    covered,
    uncovered: targetSet.filter((slug) => !coveredSet.has(slug)),
  };
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}
