import { analyzeRepoStructure } from '../../analyze/candidates/repo-structure.mjs';
import { COMPILED_ONTOLOGY_CACHE, REPO_ROOT, VAULT_ROOT, assertScanRootAllowed } from '../../server/runtime.mjs';
import {
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
} from '../../server/tool-schemas/array-limits.mjs';
import {
  requireOptionalBoolean,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
} from '../../server/validate.mjs';
import { validateVaultReport } from '../validate-vault.mjs';
import { inferImportsTool } from './infer-imports.mjs';
import { buildConceptDelta, classifyVaultAlignment } from './plan-rules.mjs';
import { aliasToSlugOf } from './vault-reconciliation.mjs';
import { compareText } from '../../compare-text.mjs';

export function indexProjectTool({ rootPath, maxDepth, maxFiles, threshold, skipImports = false } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  requireOptionalPositiveInteger(threshold, 'threshold');
  requireOptionalBoolean(skipImports, 'skipImports');

  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  let imports = null;
  let importAnalysis = null;
  let thresholdApplied = null;
  if (!skipImports) {
    imports = inferImportsTool({
      rootPath: target,
      maxFiles,
      reviewMode: 'full',
      allowLargeResponse: true,
    });
    // Keep one full receipt: analysis consumes this exact object once, while
    // the plan below reports bounded counters without returning the firehose.
    importAnalysis = imports;
    if (threshold && threshold > 1 && Array.isArray(imports.moduleEdges)) {
      const before = imports.moduleEdges.length;
      thresholdApplied = {
        threshold,
        filteredOut: before - imports.moduleEdges.filter((edge) => Number(edge.count) >= threshold).length,
      };
    }
  }
  const analyze = analyzeRepoStructure(target, {
    maxDepth,
    precomputedPythonImports: importAnalysis,
  });
  const validation = validateVaultReport({ repoRoot: target });

  const conceptCount =
    (analyze.project ? 1 : 0) +
    analyze.domains.length +
    analyze.capabilities.length +
    analyze.elements.length;
  const conceptCandidates = [
    ...(analyze.project ? [analyze.project] : []),
    ...analyze.domains,
    ...analyze.capabilities,
    ...analyze.elements,
  ];
  const compiled = COMPILED_ONTOLOGY_CACHE.get();
  const aliasToSlug = aliasToSlugOf(compiled);
  const vaultProjectNodes = (compiled.nodes ?? []).filter((node) => node.kind === 'project');
  const analyzedProjectSlug = analyze.project?.slug ?? null;
  const {
    alignment: validationAlignment,
    appliesToAnalyzedProject: validationAppliesToAnalyzedProject,
    note: validationNote,
  } = classifyVaultAlignment({
    vaultProjectNodes,
    analyzedProjectSlug,
    aliasToSlug,
    target,
    vaultRoot: VAULT_ROOT,
  });
  const conceptDelta = buildConceptDelta({
    conceptCount,
    candidateSlugs: conceptCandidates.map((candidate) => candidate.slug),
    compiled,
    aliasToSlug,
  });
  const importModuleEdges = thresholdApplied
    ? imports.moduleEdges.filter((edge) => Number(edge.count) >= thresholdApplied.threshold)
    : (imports?.moduleEdges ?? []);
  const packageImportEvidence = imports?.packageImportEvidence;
  const packageModuleEdges = thresholdApplied
    ? (packageImportEvidence?.moduleEdges ?? []).filter(
        (edge) => Number(edge.count) >= thresholdApplied.threshold,
      )
    : (packageImportEvidence?.moduleEdges ?? []);
  const importRelations = importModuleEdges.length + packageModuleEdges.length;
  const reviewCalls = [
    {
      tool: 'analyze_repo_structure',
      arguments: {
        rootPath: analyze.rootPath,
        ...(maxDepth !== undefined ? { maxDepth } : {}),
      },
    },
    ...(imports
      ? [{
          tool: 'infer_imports',
          arguments: {
            rootPath: analyze.rootPath,
            ...(maxFiles !== undefined ? { maxFiles } : {}),
          },
        }]
      : []),
  ];

  return {
    mode: 'plan',
    sideEffect: 0,
    rootPath: analyze.rootPath,
    vaultRoot: VAULT_ROOT,
    analyze: {
      framework: analyze.framework,
      project: analyze.project ?? null,
      domains: analyze.domains.length,
      capabilities: analyze.capabilities.length,
      elements: analyze.elements.length,
      suggestedRelations: analyze.suggestedRelations.length,
    },
    imports: imports
      ? {
          filesScanned: imports.filesScanned,
          moduleEdges: importModuleEdges.length,
          packageImports: packageImportEvidence?.packageImports?.length ?? 0,
          packageModuleEdges: packageModuleEdges.length,
          coverage: imports.coverage,
          ...(imports.staleEdgeFollowUp ? { staleEdgeFollowUp: imports.staleEdgeFollowUp } : {}),
          ...(thresholdApplied ? { thresholdApplied } : {}),
          ...(imports.reconciliationSummary ? { reconciliationSummary: imports.reconciliationSummary } : {}),
        }
      : null,
    plan: {
      concepts: conceptCount,
      conceptDelta,
      suggestedRelations: analyze.suggestedRelations.length,
      importRelations,
      phases: [
        'analyze_repo_structure',
        imports ? 'infer_imports' : 'infer_imports skipped',
        'validate_vault',
        'add_concepts after review; inferred imports remain rationale-review-required',
      ],
    },
    validation: {
      scanned: validation.scanned,
      problemFiles: validation.summary?.problemFiles ?? 0,
      errorFiles: validation.summary?.errorFiles ?? 0,
      warningFiles: validation.summary?.warningFiles ?? 0,
      pathDrift: validation.pathDrift?.drifts?.length ?? 0,
      appliesToAnalyzedProject: validationAppliesToAnalyzedProject,
      alignment: validationAlignment,
      note: validationNote,
    },
    meaningGate: {
      policy: analyze.meaningGate.policy,
      sourceStructureRole: analyze.meaningGate.sourceStructureRole,
      businessOntology: {
        domains: analyze.meaningGate.businessOntology.domains.length,
        capabilities: analyze.meaningGate.businessOntology.capabilities.length,
        evidence: analyze.meaningGate.businessOntology.evidence.length,
        evidenceRows: summarizeBusinessEvidenceRows(analyze.meaningGate.businessOntology.evidence),
      },
      proposedBusinessOntology: {
        domains: analyze.meaningGate.proposedBusinessOntology.domains.length,
        capabilities: analyze.meaningGate.proposedBusinessOntology.capabilities.length,
        domainRows: summarizeProposedBusinessConceptRows(
          analyze.meaningGate.proposedBusinessOntology.domains,
        ),
        capabilityRows: summarizeProposedBusinessConceptRows(
          analyze.meaningGate.proposedBusinessOntology.capabilities,
        ),
      },
      implementationEvidence: {
        elements: analyze.meaningGate.implementationEvidence.elements.length,
        reviewRequiredCapabilities:
          analyze.meaningGate.implementationEvidence.reviewRequiredCapabilities.length,
        reviewRequiredRows: summarizeReviewRequiredCapabilityRows(
          analyze.meaningGate.implementationEvidence.reviewRequiredCapabilities,
        ),
      },
      reviewQuestions: analyze.meaningGate.reviewQuestions,
    },
    extractionContract: analyze.extractionContract,
    semanticEvidence: analyze.semanticEvidence,
    configurationEvidence: analyze.configurationEvidence,
    next: {
      applyTool: 'add_concepts; add_relations only after semantic rationale + human approval',
      review: 'plan.concepts counts raw candidates, not accepted ontology claims; inspect extractionContract and proposedBusinessOntology, manually resolve ambiguous aliases, answer the competency questions, then run reviewCalls. Nothing promotes inferred imports to depends_on.',
      reviewCalls,
    },
  };
}

function summarizeBusinessEvidenceRows(rows) {
  return [...rows]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'capability' ? -1 : 1;
      return compareText(String(a.slug), String(b.slug));
    })
    .slice(0, MEANING_GATE_EVIDENCE_ROW_LIMIT)
    .map((row) => ({
      slug: row.slug,
      kind: row.kind,
      source: row.source,
    }));
}

function summarizeReviewRequiredCapabilityRows(rows) {
  return rows.slice(0, MEANING_GATE_REVIEW_ROW_LIMIT).map((row) => ({
    slug: row.slug,
    reason: row.reason,
    evidence: {
      source: row.evidence.source,
    },
  }));
}

function summarizeProposedBusinessConceptRows(rows) {
  return rows.slice(0, MEANING_GATE_REVIEW_ROW_LIMIT).map((row) => ({
    slug: row.slug,
    reason: row.reason,
    evidence: {
      source: row.evidence.source,
      ...(row.evidence.line ? { line: row.evidence.line } : {}),
    },
  }));
}
