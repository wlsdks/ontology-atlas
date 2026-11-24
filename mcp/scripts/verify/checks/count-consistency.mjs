import { formatCount } from '../output.mjs';
import { compileSummaryFailure } from './compile.mjs';
import { listConceptsFailure } from './concept-reads.mjs';
import { overviewFailure } from './query-plans.mjs';
import { censusFailure, validateVaultFailure } from './vault-census.mjs';

export function verifyCountConsistencyFailure({ kinds, list, validation, compiled, overview }) {
  if (
    (kinds && censusFailure(kinds)) ||
    (list && listConceptsFailure(list)) ||
    (validation && validateVaultFailure(validation)) ||
    (compiled && compileSummaryFailure(compiled)) ||
    (overview && overviewFailure(overview))
  ) {
    return null;
  }

  const counts = [
    ['census.total', kinds?.total],
    ['list_concepts.total', list?.total],
    ['compile_ontology.nodeCount', compiled?.nodeCount],
    ['overview.graph.nodes', overview?.graph?.nodes],
  ].filter(([, value]) => Number.isInteger(value));

  if (counts.length <= 1) return null;

  const [baseLabel, baseValue] = counts[0];
  for (const [label, value] of counts.slice(1)) {
    if (value !== baseValue) {
      return `verify count mismatch: ${baseLabel} ${baseValue}, ${label} ${value}`;
    }
  }
  if (kinds?.byKind && compiled?.byKind) {
    const kindKeys = new Set([...Object.keys(kinds.byKind), ...Object.keys(compiled.byKind)]);
    for (const kind of [...kindKeys].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const compiledCount = compiled.byKind[kind] ?? 0;
      if (kindsCount !== compiledCount) {
        return `verify byKind mismatch: ${kind}: census ${kindsCount}, compile_ontology ${compiledCount}`;
      }
    }
  }
  if (kinds?.byKind && overview?.byKind) {
    const kindKeys = new Set([...Object.keys(kinds.byKind), ...Object.keys(overview.byKind)]);
    for (const kind of [...kindKeys].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const overviewCount = overview.byKind[kind] ?? 0;
      if (kindsCount !== overviewCount) {
        return `verify byKind mismatch: ${kind}: census ${kindsCount}, overview ${overviewCount}`;
      }
    }
  }
  return null;
}

export function verifyCountConsistencySummary({ kinds, list, compiled, overview }) {
  const sources = [
    ['census', kinds?.total],
    ['list_concepts', list?.total],
    ['compile_ontology', compiled?.nodeCount],
    ['overview', overview?.graph?.nodes],
  ].filter(([, value]) => Number.isInteger(value));
  if (!sources.length) return null;
  const nodeCount = sources[0][1];
  const sourceNames = sources.map(([name]) => name).join('/');
  const kindCount = new Set([
    ...Object.keys(kinds?.byKind ?? {}),
    ...Object.keys(compiled?.byKind ?? {}),
    ...Object.keys(overview?.byKind ?? {}),
  ]).size;
  const kindSuffix = kindCount ? `, ${formatCount(kindCount, 'kind')}` : '';
  return `${formatCount(nodeCount, 'node')} across ${sourceNames}${kindSuffix}`;
}
