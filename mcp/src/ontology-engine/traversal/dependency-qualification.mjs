export function qualifyDeclaredDependencyEdges(edges) {
  return edges.map((edge) => ({
    ...edge,
    rationale: edge.rationale ?? null,
    qualification: edge.rationale ? 'declared_with_rationale' : 'review_required',
  }));
}

export function buildDependencyImpactQualification(edges) {
  const declaredWithRationaleEdges = edges.filter(
    (edge) => edge.qualification === 'declared_with_rationale',
  ).length;
  const reviewRequiredEdges = edges.length - declaredWithRationaleEdges;
  return {
    status: edges.length === 0
      ? 'unknown'
      : reviewRequiredEdges > 0
        ? 'review_required'
        : 'declared_with_rationale',
    basis: 'declared_dependencies',
    completeness: 'unknown',
    sourceBacked: false,
    declaredEdges: edges.length,
    declaredWithRationaleEdges,
    reviewRequiredEdges,
    sourceBackedEdges: 0,
  };
}
