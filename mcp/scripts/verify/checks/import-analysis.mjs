import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_SOURCE_ROLE_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  IMPORT_USAGE_VALUES,
} from '../../../src/infer-imports.mjs';

import { sameArray } from '../value-checks.mjs';
import {
  fixedCountTotal,
  goPackageImportEvidenceFailure,
  goPackageImportEvidenceSummaryFailure,
} from './go-import-evidence.mjs';

export function importModuleEdgeKindOutputSummary(moduleEdges, limit = 2) {
  if (!Array.isArray(moduleEdges) || moduleEdges.length === 0) return 'none';
  const shown = moduleEdges.slice(0, limit).map((edge) => {
    const from = typeof edge?.from === 'string' && edge.from.length > 0 ? edge.from : 'unknown';
    const to = typeof edge?.to === 'string' && edge.to.length > 0 ? edge.to : 'unknown';
    const count = Number.isInteger(edge?.count) ? edge.count : 'n/a';
    const kindSummary = importKindCountOutputSummary(edge?.kindCounts);
    const kindSuffix = kindSummary === 'none' ? '' : ` (${kindSummary})`;
    return `${from}->${to} x${count}${kindSuffix}`;
  });
  const suffix = moduleEdges.length > shown.length ? `, +${moduleEdges.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

function importKindCountOutputSummary(kindCounts) {
  if (!kindCounts || typeof kindCounts !== 'object' || Array.isArray(kindCounts)) return 'none';
  const ordered = IMPORT_EDGE_KIND_VALUES;
  const known = ordered
    .filter((kind) => Number.isInteger(kindCounts[kind]) && kindCounts[kind] > 0)
    .map((kind) => `${kind}:${kindCounts[kind]}`);
  const extra = Object.entries(kindCounts)
    .filter(([kind, count]) => !ordered.includes(kind) && Number.isInteger(count) && count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`);
  const entries = [...known, ...extra];
  return entries.length > 0 ? entries.join('/') : 'none';
}

const ENTRY_POINT_KINDS = new Set(['executable', 'command', 'route', 'library', 'plugin']);

/** The default survey is the breadth map: units, entry points and docs, and no candidate node. */
export function analyzeRepoStructureFailure(parsed) {
  if (typeof parsed?.rootPath !== 'string' || parsed.rootPath.length === 0) {
    return 'analyze_repo_structure response missing rootPath';
  }
  if (parsed.contract !== 'breadthMap:v1') {
    return `analyze_repo_structure response is not the breadth map: ${parsed?.contract}`;
  }
  for (const propertyName of ['domains', 'capabilities', 'elements', 'suggestedRelations', 'meaningGate']) {
    if (parsed[propertyName] !== undefined) {
      return `analyze_repo_structure survey carries ${propertyName}; the breadth map names no node`;
    }
  }
  const size = parsed.size;
  for (const propertyName of ['productFiles', 'productLines', 'units']) {
    if (!Number.isInteger(size?.[propertyName]) || size[propertyName] < 0) {
      return `analyze_repo_structure response missing size.${propertyName}`;
    }
  }
  if (!Array.isArray(parsed.units) || (!parsed.unitsOmitted && parsed.units.length !== size.units)) {
    return 'analyze_repo_structure response units do not match size.units';
  }
  for (const [index, unit] of parsed.units.entries()) {
    if (typeof unit?.path !== 'string' || unit.path.length === 0) {
      return `analyze_repo_structure response missing unit path at index ${index}`;
    }
    if (!Number.isInteger(unit.files) || unit.files < 1 || !Number.isInteger(unit.lines) || unit.lines < 0) {
      return `analyze_repo_structure response missing unit size: ${unit.path}`;
    }
    if (!Array.isArray(unit.mainFiles) || unit.mainFiles.some((file) => typeof file?.path !== 'string' || !Number.isInteger(file.lines))) {
      return `analyze_repo_structure response malformed main files: ${unit.path}`;
    }
    if (!Array.isArray(unit.exports) || !Array.isArray(unit.imports) || !Number.isInteger(unit.importedBy)) {
      return `analyze_repo_structure response malformed exports or imports: ${unit.path}`;
    }
  }
  if (!Array.isArray(parsed.entryPoints)) return 'analyze_repo_structure response missing entryPoints array';
  for (const [index, row] of parsed.entryPoints.entries()) {
    if (typeof row?.path !== 'string' || typeof row.symbol !== 'string' || !ENTRY_POINT_KINDS.has(row.kind)) {
      return `analyze_repo_structure response malformed entry point at index ${index}`;
    }
  }
  if (!parsed.docs || typeof parsed.docs !== 'object' || !Array.isArray(parsed.docs.pages)) {
    return 'analyze_repo_structure response missing docs';
  }
  if (typeof parsed.next !== 'string' || parsed.next.length === 0) {
    return 'analyze_repo_structure response missing next';
  }
  return null;
}

export function inferImportsFailure(parsed) {
  if (typeof parsed?.rootPath !== 'string' || parsed.rootPath.length === 0) {
    return 'infer_imports response missing rootPath';
  }
  if (!Number.isInteger(parsed.filesScanned) || parsed.filesScanned < 0) {
    return 'infer_imports response missing filesScanned count';
  }

  // Large scans arrive as a bounded review packet under the public 128 KiB response
  // limit. Accept the compact branch without its raw edge arrays, but keep the
  // packet's structural checks strict.
  if (parsed.contract === 'inferImportsReview:v1') {
    const summary = parsed.scanSummary;
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return 'infer_imports review response missing scanSummary';
    }
    for (const propertyName of ['fileEdges', 'externalImports', 'unresolvedImports', 'moduleEdges']) {
      if (!Number.isInteger(summary[propertyName]) || summary[propertyName] < 0) {
        return `infer_imports review response missing scanSummary.${propertyName}`;
      }
    }
    const reconciliation = parsed.reconciliationSummary;
    if (!reconciliation || typeof reconciliation !== 'object' || Array.isArray(reconciliation)) {
      return 'infer_imports review response missing reconciliationSummary';
    }
    for (const propertyName of [
      'inBoth',
      'inCodeMissingFromVault',
      'inCodeMissingEndpointAbsent',
      'inVaultNotInCode',
      'unresolvedImports',
    ]) {
      if (!Number.isInteger(reconciliation[propertyName]) || reconciliation[propertyName] < 0) {
        return `infer_imports review response missing reconciliationSummary.${propertyName}`;
      }
    }
    if (typeof reconciliation.hint !== 'string' || reconciliation.hint.length === 0) {
      return 'infer_imports review response missing reconciliationSummary.hint';
    }
    const queue = parsed.reviewQueue;
    if (!queue || typeof queue !== 'object' || Array.isArray(queue)) {
      return 'infer_imports review response missing reviewQueue';
    }
    if (
      !Number.isInteger(queue.total) || queue.total < 0 ||
      !Number.isInteger(queue.returned) || queue.returned < 0 ||
      typeof queue.exhausted !== 'boolean' ||
      (queue.afterReviewId !== null && typeof queue.afterReviewId !== 'string')
    ) {
      return 'infer_imports review response malformed reviewQueue';
    }
    if (queue.returned > queue.total) {
      return 'infer_imports review response reviewQueue returned exceeds total';
    }
    if (parsed.nextReview !== null && (
      !parsed.nextReview || typeof parsed.nextReview !== 'object' || Array.isArray(parsed.nextReview) ||
      parsed.nextReview.contract !== 'nextRelationReview:v1'
    )) {
      return 'infer_imports review response malformed nextReview';
    }
    const goSummaryFailure = goPackageImportEvidenceSummaryFailure(
      parsed.packageImportEvidenceSummary,
    );
    if (goSummaryFailure) return `infer_imports review ${goSummaryFailure}`;
    return null;
  }

  if (parsed.contract === 'inferImportsFocus:v1') {
    if (!parsed.focusReview || typeof parsed.focusReview !== 'object' || Array.isArray(parsed.focusReview)) {
      return 'infer_imports focus response missing focusReview';
    }
    const goSummaryFailure = goPackageImportEvidenceSummaryFailure(
      parsed.packageImportEvidenceSummary,
    );
    if (goSummaryFailure) return `infer_imports focus ${goSummaryFailure}`;
    return null;
  }

  for (const propertyName of ['edges', 'externalImports', 'unresolved', 'moduleEdges']) {
    if (!Array.isArray(parsed[propertyName])) {
      return `infer_imports response missing ${propertyName} array`;
    }
  }
  const edgeKinds = new Set(IMPORT_EDGE_KIND_VALUES);
  const sourceRoles = new Set(IMPORT_SOURCE_ROLE_VALUES);
  const importUsages = new Set(IMPORT_USAGE_VALUES);
  const unresolvedReasons = new Set(IMPORT_UNRESOLVED_REASON_VALUES);
  for (const [index, edge] of parsed.edges.entries()) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      return `infer_imports response malformed edge at index ${index}`;
    }
    for (const propertyName of ['from', 'to']) {
      if (typeof edge[propertyName] !== 'string' || edge[propertyName].length === 0) {
        return `infer_imports response missing edge ${propertyName} at index ${index}`;
      }
    }
    if (!edgeKinds.has(edge.kind)) {
      return `infer_imports response unknown edge kind: ${edge.kind}`;
    }
    if (!sourceRoles.has(edge.sourceRole) || !importUsages.has(edge.importUsage)) {
      return `infer_imports response malformed edge provenance at index ${index}`;
    }
  }
  for (const [index, externalImport] of parsed.externalImports.entries()) {
    if (!externalImport || typeof externalImport !== 'object' || Array.isArray(externalImport)) {
      return `infer_imports response malformed external import at index ${index}`;
    }
    for (const propertyName of ['from', 'spec']) {
      if (typeof externalImport[propertyName] !== 'string' || externalImport[propertyName].length === 0) {
        return `infer_imports response missing external import ${propertyName} at index ${index}`;
      }
    }
  }
  for (const [index, unresolved] of parsed.unresolved.entries()) {
    if (!unresolved || typeof unresolved !== 'object' || Array.isArray(unresolved)) {
      return `infer_imports response malformed unresolved import at index ${index}`;
    }
    if (typeof unresolved.from !== 'string' || unresolved.from.length === 0) {
      return `infer_imports response missing unresolved from at index ${index}`;
    }
    if (typeof unresolved.spec !== 'string') {
      return `infer_imports response missing unresolved spec at index ${index}`;
    }
    if (typeof unresolved.reason !== 'string' || unresolved.reason.length === 0) {
      return `infer_imports response missing unresolved reason at index ${index}`;
    }
    if (!unresolvedReasons.has(unresolved.reason)) {
      return `infer_imports response unknown unresolved reason at index ${index}: ${unresolved.reason}`;
    }
    if (unresolved.reason !== 'empty' && unresolved.spec.length === 0) {
      return `infer_imports response missing unresolved spec at index ${index}`;
    }
  }
  for (const [index, moduleEdge] of parsed.moduleEdges.entries()) {
    if (!moduleEdge || typeof moduleEdge !== 'object' || Array.isArray(moduleEdge)) {
      return `infer_imports response malformed module edge at index ${index}`;
    }
    for (const propertyName of ['from', 'to']) {
      if (typeof moduleEdge[propertyName] !== 'string' || moduleEdge[propertyName].length === 0) {
        return `infer_imports response missing module edge ${propertyName} at index ${index}`;
      }
    }
    if (!Number.isInteger(moduleEdge.count) || moduleEdge.count < 1) {
      return `infer_imports response missing module edge count at index ${index}`;
    }
    if (!moduleEdge.kindCounts || typeof moduleEdge.kindCounts !== 'object' || Array.isArray(moduleEdge.kindCounts)) {
      return `infer_imports response missing module edge kindCounts at index ${index}`;
    }
    const kindTotal = Object.entries(moduleEdge.kindCounts).reduce((sum, [kind, value]) => {
      if (!edgeKinds.has(kind)) return NaN;
      if (!Number.isInteger(value) || value < 1) return NaN;
      return sum + value;
    }, 0);
    if (Number.isNaN(kindTotal)) {
      return `infer_imports response malformed module edge kindCounts at index ${index}`;
    }
    if (kindTotal !== moduleEdge.count) {
      return `infer_imports response module edge kindCounts mismatch at index ${index}`;
    }
    const sourceRoleTotal = fixedCountTotal(moduleEdge.sourceRoleCounts, IMPORT_SOURCE_ROLE_VALUES);
    if (sourceRoleTotal === null) {
      return `infer_imports response malformed module edge sourceRoleCounts at index ${index}`;
    }
    if (sourceRoleTotal !== moduleEdge.count) {
      return `infer_imports response module edge sourceRoleCounts mismatch at index ${index}`;
    }
    const importUsageTotal = fixedCountTotal(moduleEdge.importUsageCounts, IMPORT_USAGE_VALUES);
    if (importUsageTotal === null) {
      return `infer_imports response malformed module edge importUsageCounts at index ${index}`;
    }
    if (importUsageTotal !== moduleEdge.count) {
      return `infer_imports response module edge importUsageCounts mismatch at index ${index}`;
    }
    if (
      !Number.isInteger(moduleEdge.productValueCount) ||
      moduleEdge.productValueCount < 0 ||
      moduleEdge.productValueCount > moduleEdge.sourceRoleCounts.production ||
      moduleEdge.productValueCount > moduleEdge.importUsageCounts.value
    ) {
      return `infer_imports response impossible productValueCount at index ${index}`;
    }
    if (!Array.isArray(moduleEdge.evidence) || moduleEdge.evidence.length > 5) {
      return `infer_imports response malformed module edge evidence at index ${index}`;
    }
    if (typeof moduleEdge.evidenceLimited !== 'boolean') {
      return `infer_imports response missing module edge evidenceLimited at index ${index}`;
    }
    for (const evidence of moduleEdge.evidence) {
      if (
        !evidence ||
        typeof evidence.from !== 'string' ||
        typeof evidence.to !== 'string' ||
        !edgeKinds.has(evidence.kind) ||
        !sourceRoles.has(evidence.sourceRole) ||
        !importUsages.has(evidence.importUsage)
      ) {
        return `infer_imports response malformed module edge evidence at index ${index}`;
      }
    }
  }
  const goEvidenceFailure = goPackageImportEvidenceFailure(parsed.packageImportEvidence);
  if (goEvidenceFailure) return `infer_imports ${goEvidenceFailure}`;
  const coverageFailure = importScanCoverageFailure(parsed.coverage);
  if (coverageFailure) return `infer_imports ${coverageFailure}`;
  return null;
}

function rustConfigurationEvidenceFailure(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return 'response missing Rust configuration evidence';
  }
  if (evidence.contract !== 'rustFeatureConfigurationEvidence:v1') {
    return `Rust configuration evidence contract drift: ${evidence.contract}`;
  }
  if (!['not_present', 'unsupported', 'observed', 'limited'].includes(evidence.status)) {
    return `Rust configuration evidence status drift: ${evidence.status}`;
  }
  if (
    evidence.writePolicy?.automaticRelation !== false ||
    evidence.writePolicy?.writeAllowed !== false ||
    evidence.writePolicy?.humanApprovalRequired !== true
  ) {
    return 'Rust configuration evidence write policy is not fail-closed';
  }
  for (const propertyName of [
    'predicateEvaluation',
    'runtimeImpact',
    'importDependency',
    'macroConsumers',
    'semanticDependency',
  ]) {
    if (evidence.claimBoundary?.[propertyName] !== false) {
      return `Rust configuration evidence overclaims ${propertyName}`;
    }
  }
  if (
    evidence.coverage?.predicateEvaluation !== false ||
    evidence.coverage?.macroExpansion !== false ||
    evidence.coverage?.buildScriptsExecuted !== false
  ) {
    return 'Rust configuration evidence execution boundary drift';
  }
  if (
    !Array.isArray(evidence.packages) ||
    !Array.isArray(evidence.unsupportedWorkspaceMembers) ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length === 0
  ) {
    return 'Rust configuration evidence bounded rows drift';
  }
  return null;
}

function importScanCoverageFailure(coverage) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
    return 'response missing import scan coverage';
  }
  if (coverage.contract !== 'importScanCoverage:v1') {
    return `import scan coverage contract drift: ${coverage.contract}`;
  }
  if (
    !Array.isArray(coverage.supportedLanguages) ||
    !Array.isArray(coverage.supportedExtensions) ||
    !Array.isArray(coverage.detectedUnsupportedLanguages) ||
    typeof coverage.allDetectedLanguagesSupported !== 'boolean' ||
    Object.hasOwn(coverage, 'completeForDetectedLanguages') ||
    coverage.zeroEdgesMeaning !== 'no_supported_static_import_edges_observed' ||
    !Array.isArray(coverage.limitations) ||
    coverage.limitations.length === 0
  ) {
    return 'import scan coverage boundary drift';
  }
  if (!sameArray(coverage.supportedLanguages, ['go', 'javascript', 'python', 'rust', 'typescript'])) {
    return 'import scan coverage supported-language enum drift';
  }
  if (
    new Set(coverage.detectedUnsupportedLanguages).size !== coverage.detectedUnsupportedLanguages.length ||
    coverage.detectedUnsupportedLanguages.some((language) => language !== 'c')
  ) {
    return 'import scan coverage unsupported-language enum drift';
  }
  if (
    coverage.detectedUnsupportedLanguages.includes('c') &&
    coverage.allDetectedLanguagesSupported !== false
  ) {
    return 'import scan coverage overclaims C support';
  }
  return null;
}

export function indexProjectFailure(parsed) {
  if (parsed?.mode !== 'plan') {
    return `index_project response mode drift: ${parsed?.mode}`;
  }
  if (parsed.sideEffect !== 0) {
    return 'index_project response must be side effect 0';
  }
  if (typeof parsed.rootPath !== 'string' || parsed.rootPath.length === 0) {
    return 'index_project response missing rootPath';
  }
  if (!parsed.analyze || typeof parsed.analyze !== 'object' || Array.isArray(parsed.analyze)) {
    return 'index_project response missing analyze summary';
  }
  for (const propertyName of ['domains', 'capabilities', 'elements', 'suggestedRelations']) {
    if (!Number.isInteger(parsed.analyze[propertyName]) || parsed.analyze[propertyName] < 0) {
      return `index_project response missing analyze.${propertyName} count`;
    }
  }
  if (!parsed.imports || typeof parsed.imports !== 'object' || Array.isArray(parsed.imports)) {
    return 'index_project response missing imports summary';
  }
  if (!Number.isInteger(parsed.imports.filesScanned) || parsed.imports.filesScanned < 0) {
    return 'index_project response missing imports.filesScanned count';
  }
  if (!Number.isInteger(parsed.imports.moduleEdges) || parsed.imports.moduleEdges < 0) {
    return 'index_project response missing imports.moduleEdges count';
  }
  if (!Number.isInteger(parsed.imports.packageImports) || parsed.imports.packageImports < 0) {
    return 'index_project response missing imports.packageImports count';
  }
  if (!Number.isInteger(parsed.imports.packageModuleEdges) || parsed.imports.packageModuleEdges < 0) {
    return 'index_project response missing imports.packageModuleEdges count';
  }
  const importCoverageFailure = importScanCoverageFailure(parsed.imports.coverage);
  if (importCoverageFailure) return `index_project imports ${importCoverageFailure}`;
  const configurationFailure = rustConfigurationEvidenceFailure(
    parsed.configurationEvidence,
  );
  if (configurationFailure) return `index_project ${configurationFailure}`;
  if (!parsed.plan || typeof parsed.plan !== 'object' || Array.isArray(parsed.plan)) {
    return 'index_project response missing plan summary';
  }
  for (const propertyName of ['concepts', 'suggestedRelations', 'importRelations']) {
    if (!Number.isInteger(parsed.plan[propertyName]) || parsed.plan[propertyName] < 0) {
      return `index_project response missing plan.${propertyName} count`;
    }
  }
  if (
    parsed.plan.importRelations !==
    parsed.imports.moduleEdges + parsed.imports.packageModuleEdges
  ) {
    return 'index_project response plan.importRelations must equal legacy and package module edge counts';
  }
  if (!Array.isArray(parsed.plan.phases)) {
    return 'index_project response missing plan.phases array';
  }
  if (!parsed.validation || typeof parsed.validation !== 'object' || Array.isArray(parsed.validation)) {
    return 'index_project response missing validation summary';
  }
  for (const propertyName of ['scanned', 'problemFiles', 'errorFiles', 'warningFiles']) {
    if (!Number.isInteger(parsed.validation[propertyName]) || parsed.validation[propertyName] < 0) {
      return `index_project response missing validation.${propertyName} count`;
    }
  }
  if (!parsed.next || typeof parsed.next !== 'object' || Array.isArray(parsed.next)) {
    return 'index_project response missing next actions';
  }
  if (typeof parsed.next.cliApply !== 'string' || !/ontology-atlas index/.test(parsed.next.cliApply)) {
    return 'index_project response missing CLI apply guidance';
  }
  return null;
}
