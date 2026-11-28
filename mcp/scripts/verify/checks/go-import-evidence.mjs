import { IMPORT_SOURCE_ROLE_VALUES, IMPORT_USAGE_VALUES } from '../server-vocabularies.mjs';

import { sameArray } from '../value-checks.mjs';

export function goPackageImportEvidenceFailure(evidence) {
  if (evidence === undefined) return null;
  if (!isExactRecord(evidence, [
    'contract',
    'modulePath',
    'sourceQualification',
    'writeAllowed',
    'filesScanned',
    'fileScanLimited',
    'perFileByteLimit',
    'perFileImportLimit',
    'skipped',
    'limitations',
    'packageImports',
    'moduleEdges',
  ])) {
    return 'Go package-import evidence fields drift';
  }
  if (evidence.contract !== 'goPackageImports:v1') {
    return `Go package-import evidence contract drift: ${evidence.contract}`;
  }
  if (typeof evidence.modulePath !== 'string' || evidence.modulePath.length === 0) {
    return 'Go package-import evidence missing modulePath';
  }
  if (
    evidence.sourceQualification !==
    'observed_bounded_go_package_imports_not_runtime_or_semantic_impact'
  ) {
    return 'Go package-import evidence source qualification drift';
  }
  if (evidence.writeAllowed !== false) {
    return 'Go package-import evidence must remain write-blocked';
  }
  for (const field of ['filesScanned', 'perFileByteLimit', 'perFileImportLimit']) {
    if (!Number.isInteger(evidence[field]) || evidence[field] < (field === 'filesScanned' ? 0 : 1)) {
      return `Go package-import evidence invalid ${field}`;
    }
  }
  if (typeof evidence.fileScanLimited !== 'boolean') {
    return 'Go package-import evidence invalid fileScanLimited';
  }
  if (!Array.isArray(evidence.skipped) || !Array.isArray(evidence.limitations) || evidence.limitations.length === 0) {
    return 'Go package-import evidence bounded rows drift';
  }
  for (const [index, row] of evidence.skipped.entries()) {
    if (!isExactRecord(row, ['file', 'reason']) || !isNonBlankString(row.file) || !isNonBlankString(row.reason)) {
      return `Go package-import evidence malformed skipped row at index ${index}`;
    }
  }
  if (evidence.limitations.some((row) => !isNonBlankString(row))) {
    return 'Go package-import evidence malformed limitation';
  }
  if (!Array.isArray(evidence.packageImports) || !Array.isArray(evidence.moduleEdges)) {
    return 'Go package-import evidence missing evidence arrays';
  }
  for (const [index, row] of evidence.packageImports.entries()) {
    const rowFailure = goPackageImportRowFailure(row);
    if (rowFailure) return `Go package-import evidence ${rowFailure} at index ${index}`;
  }
  let moduleEdgeCount = 0;
  for (const [index, edge] of evidence.moduleEdges.entries()) {
    const edgeFailure = goPackageImportModuleEdgeFailure(edge);
    if (edgeFailure) return `Go package-import evidence ${edgeFailure} at index ${index}`;
    moduleEdgeCount += edge.count;
  }
  if (moduleEdgeCount !== evidence.packageImports.length) {
    return 'Go package-import evidence module edge count mismatch';
  }
  return null;
}

export function goPackageImportEvidenceSummaryFailure(summary) {
  if (summary === undefined) return null;
  if (!isExactRecord(summary, [
    'contract',
    'filesScanned',
    'fileScanLimited',
    'packageImports',
    'moduleEdges',
    'fullEvidenceCall',
  ])) {
    return 'Go package-import summary fields drift';
  }
  if (summary.contract !== 'goPackageImports:v1') {
    return `Go package-import summary contract drift: ${summary.contract}`;
  }
  for (const field of ['filesScanned', 'packageImports', 'moduleEdges']) {
    if (!Number.isInteger(summary[field]) || summary[field] < 0) {
      return `Go package-import summary invalid ${field}`;
    }
  }
  if (typeof summary.fileScanLimited !== 'boolean') {
    return 'Go package-import summary invalid fileScanLimited';
  }
  const call = summary.fullEvidenceCall;
  if (!isExactRecord(call, ['tool', 'arguments', 'purpose']) || call.tool !== 'infer_imports') {
    return 'Go package-import summary malformed fullEvidenceCall';
  }
  const argumentKeys = Object.keys(call.arguments ?? {});
  const allowedArgumentKeys = new Set([
    'rootPath',
    'sourceFolders',
    'ignore',
    'maxFiles',
    'reviewMode',
    'allowLargeResponse',
  ]);
  if (
    !call.arguments ||
    typeof call.arguments !== 'object' ||
    Array.isArray(call.arguments) ||
    argumentKeys.some((key) => !allowedArgumentKeys.has(key)) ||
    !argumentKeys.includes('rootPath') ||
    !argumentKeys.includes('reviewMode') ||
    !argumentKeys.includes('allowLargeResponse') ||
    !isNonBlankString(call.arguments.rootPath) ||
    call.arguments.reviewMode !== 'full' ||
    call.arguments.allowLargeResponse !== true ||
    !isNonBlankString(call.purpose)
  ) {
    return 'Go package-import summary malformed fullEvidenceCall';
  }
  for (const key of ['sourceFolders', 'ignore']) {
    const values = call.arguments[key];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        new Set(values).size !== values.length ||
        values.some((value) => !isNonBlankString(value)))
    ) {
      return 'Go package-import summary malformed fullEvidenceCall';
    }
  }
  if (
    call.arguments.maxFiles !== undefined &&
    (!Number.isInteger(call.arguments.maxFiles) ||
      call.arguments.maxFiles < 1 ||
      call.arguments.maxFiles > 50000)
  ) {
    return 'Go package-import summary malformed fullEvidenceCall';
  }
  return null;
}

function goPackageImportRowFailure(row) {
  if (!isExactRecord(row, [
    'fromFile',
    'fromPackage',
    'toPackage',
    'importSpec',
    'kind',
    'sourceRole',
    'importUsage',
  ])) return 'package import row fields drift';
  if (['fromFile', 'fromPackage', 'toPackage', 'importSpec'].some((field) => !isNonBlankString(row[field]))) {
    return 'package import row missing path field';
  }
  if (!['static', 'side'].includes(row.kind)) return 'package import row kind drift';
  if (!IMPORT_SOURCE_ROLE_VALUES.includes(row.sourceRole)) return 'package import row source role drift';
  if (row.importUsage !== 'value') return 'package import row usage drift';
  return null;
}

function goPackageImportModuleEdgeFailure(edge) {
  if (!isExactRecord(edge, [
    'fromPackage',
    'toPackage',
    'count',
    'kindCounts',
    'sourceRoleCounts',
    'importUsageCounts',
    'productValueCount',
    'evidence',
    'evidenceLimited',
  ])) return 'package module edge fields drift';
  if (!isNonBlankString(edge.fromPackage) || !isNonBlankString(edge.toPackage)) {
    return 'package module edge missing endpoint';
  }
  if (!Number.isInteger(edge.count) || edge.count < 1) return 'package module edge invalid count';
  if (!edge.kindCounts || typeof edge.kindCounts !== 'object' || Array.isArray(edge.kindCounts)) {
    return 'package module edge invalid kindCounts';
  }
  const kinds = Object.entries(edge.kindCounts);
  if (kinds.length === 0 || kinds.some(([kind, count]) => !['static', 'side'].includes(kind) || !Number.isInteger(count) || count < 1)) {
    return 'package module edge invalid kindCounts';
  }
  if (kinds.reduce((total, [, count]) => total + count, 0) !== edge.count) {
    return 'package module edge kindCounts mismatch';
  }
  const sourceRoleTotal = fixedCountTotal(edge.sourceRoleCounts, IMPORT_SOURCE_ROLE_VALUES);
  if (sourceRoleTotal !== edge.count) return 'package module edge sourceRoleCounts mismatch';
  const usageTotal = fixedCountTotal(edge.importUsageCounts, IMPORT_USAGE_VALUES);
  if (
    usageTotal !== edge.count ||
    edge.importUsageCounts.type_only !== 0 ||
    edge.importUsageCounts.unknown !== 0
  ) return 'package module edge importUsageCounts mismatch';
  if (
    !Number.isInteger(edge.productValueCount) ||
    edge.productValueCount < 0 ||
    edge.productValueCount !== edge.sourceRoleCounts.production ||
    edge.productValueCount > edge.importUsageCounts.value
  ) return 'package module edge productValueCount mismatch';
  if (!Array.isArray(edge.evidence) || edge.evidence.length === 0 || edge.evidence.length > 5) {
    return 'package module edge invalid evidence';
  }
  for (const evidence of edge.evidence) {
    if (
      goPackageImportRowFailure(evidence) ||
      evidence.fromPackage !== edge.fromPackage ||
      evidence.toPackage !== edge.toPackage
    ) return 'package module edge malformed evidence';
  }
  if (typeof edge.evidenceLimited !== 'boolean') return 'package module edge invalid evidenceLimited';
  return null;
}

function isExactRecord(value, keys) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    sameArray(Object.keys(value).sort(), [...keys].sort());
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function fixedCountTotal(counts, values) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
  if (!sameArray(Object.keys(counts), values)) return null;
  let total = 0;
  for (const value of values) {
    if (!Number.isInteger(counts[value]) || counts[value] < 0) return null;
    total += counts[value];
  }
  return total;
}
