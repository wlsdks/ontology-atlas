/**
 * The four folder-scanning tools — `analyze_repo_structure`,
 * `inspect_architecture`, `infer_imports`, `index_project` — plus the scan-root
 * guard that keeps them inside the vault's own repository.
 */

import { analyzeRepoStructure } from '../analyze/repo-structure.mjs';
import {
  buildArchitectureBrief,
  buildArchitectureMeasuredStamp,
  findArchitectureProfiles,
} from '../architecture-profile.mjs';
import {
  buildImportImpactFocus,
  inferImports,
} from '../infer-imports.mjs';
import { compileOntology } from '../ontology-compiler.mjs';
import { inspectProjectSource } from '../project-source-inspection.mjs';
import { composeSourceDigest, readSourceEvidence, validateSourceReadSelectors } from '../source-evidence.mjs';
import {
  buildNextImportRelationReview,
  reconcileImportEdges,
} from '../reconcile-imports.mjs';
import { SERVER_VERSION } from '../server-version.mjs';
import {
  COMPILED_ONTOLOGY_CACHE,
  REPO_ROOT,
  VAULT_ROOT,
  assertScanRootAllowed,
} from '../server/runtime.mjs';
import {
  IGNORE_ARRAY_MAX_ITEMS,
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
  SOURCE_FOLDER_ARRAY_MAX_ITEMS,
} from '../server/tool-schemas.mjs';
import {
  requireOptionalBoolean,
  requireOptionalEnum,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
  requireOptionalStringArray,
} from '../server/validate.mjs';
import { loadVaultDocs } from '../vault.mjs';
import { validateVaultTool } from './validate-vault.mjs';
import {
  relative,
  sep,
} from 'node:path';

function analyzeRepoStructureTool({ rootPath, maxDepth, ignore, sourceReads, proposal, qualification } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  if (sourceReads !== undefined) validateSourceReadSelectors(sourceReads);
  if (sourceReads !== undefined && (proposal != null || qualification != null)) {
    const missingHash = sourceReads.findIndex((row) => row?.expectedSha256 === undefined);
    if (missingHash >= 0) {
      throw new Error(`sourceReads[${missingHash}].expectedSha256 is required with proposal or qualification.`);
    }
  }
  const sourceBefore = proposal == null ? undefined : inspectProjectSource(target).fingerprint;
  const sourceEvidence = sourceReads === undefined
    ? undefined
    : readSourceEvidence(target, sourceReads, { ignore });
  const sourceDigest = proposal == null
    ? undefined
    : composeSourceDigest(sourceBefore, sourceEvidence);
  // A proposal may cite up to four exact endpoints already observable through
  // infer_imports. Recompute that bounded, read-only receipt in the proposal
  // call so validation does not depend on hidden state from an earlier
  // index_project/infer_imports call.
  const proposalImportEvidence = proposal == null
    ? undefined
    : inferImports(target, { ignore });
  const result = analyzeRepoStructure(target, {
    maxDepth,
    ignore,
    ...(proposalImportEvidence === undefined
      ? {}
      : { precomputedPythonImports: proposalImportEvidence }),
    proposal,
    qualification,
    sourceDigest,
    sourceEvidence,
  });
  const sourceAfter = proposal != null && sourceReads !== undefined
    ? inspectProjectSource(target).fingerprint
    : sourceBefore;
  if (sourceReads !== undefined && sourceBefore !== sourceAfter) {
    throw new Error('Repository source changed during source-sensitive proposal analysis; retry against one stable snapshot.');
  }
  return result;
}

function inspectArchitectureTool({ rootPath, profileSlug, maxFiles } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonBlankString(profileSlug, 'profileSlug');
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  const profiles = findArchitectureProfiles(loadVaultDocs(VAULT_ROOT));
  if (profiles.length === 0) {
    const error = new Error(
      'No architecture-profile/v1 document exists in the active vault. Add a reviewed Markdown profile under architecture/ before inspecting source conformance.',
    );
    error.repairFields = {
      errorCode: 'architecture_profile_missing',
      profileDirectory: 'architecture/',
    };
    throw error;
  }
  let profile = null;
  if (profileSlug !== undefined) {
    profile = profiles.find((candidate) => candidate.slug === profileSlug) ?? null;
    if (!profile) {
      const error = new Error(`Architecture profile not found: ${profileSlug}.`);
      error.repairFields = {
        errorCode: 'architecture_profile_not_found',
        profileSlug,
        availableProfileSlugs: profiles.map((candidate) => candidate.slug),
      };
      throw error;
    }
  } else if (profiles.length === 1) {
    [profile] = profiles;
  } else {
    const error = new Error(
      `Multiple architecture profiles exist; pass profileSlug. Available profiles: ${profiles.map((candidate) => candidate.slug).join(', ')}.`,
    );
    error.repairFields = {
      errorCode: 'architecture_profile_required',
      availableProfileSlugs: profiles.map((candidate) => candidate.slug),
    };
    throw error;
  }
  const imports = inferImports(target, { maxFiles });
  // Measured stamp (2026-08-27 decision, point 2): when the scan ran, which tool version measured,
  // and the exact source state it saw. Reading the source inspection is still side effect 0.
  const measured = buildArchitectureMeasuredStamp(inspectProjectSource(target), {
    toolName: 'ontology-atlas',
    toolVersion: SERVER_VERSION,
  });
  return buildArchitectureBrief(
    profile,
    {
      ...imports,
      rootPath: target,
    },
    { measured },
  );
}

// Thin wrapper over infer_imports. Zero side effects. The resulting moduleEdges
// are rationale-review candidates carrying exact source evidence.
function buildImportStaleEdgeFollowUp(result) {
  const count = Array.isArray(result?.reconciliation?.inVaultNotInCode)
    ? result.reconciliation.inVaultNotInCode.length
    : 0;
  return {
    status: count > 0 ? 'full_follow_up_required' : 'not_present',
    count,
    nextCall: count > 0
      ? {
          tool: 'infer_imports',
          arguments: {
            rootPath: result.rootPath,
            reviewMode: 'full',
            allowLargeResponse: true,
          },
          purpose: 'Read full reconciliation before judging stale vault edges; compact delivery omits stale details.',
        }
      : null,
  };
}

function buildGoPackageImportEvidenceSummary(
  result,
  { sourceFolders, ignore, maxFiles } = {},
) {
  const receipt = result?.packageImportEvidence;
  if (!receipt) return undefined;
  return {
    contract: 'goPackageImports:v1',
    filesScanned: receipt.filesScanned,
    fileScanLimited: receipt.fileScanLimited,
    packageImports: receipt.packageImports.length,
    moduleEdges: receipt.moduleEdges.length,
    fullEvidenceCall: {
      tool: 'infer_imports',
      arguments: {
        rootPath: result.rootPath,
        ...(sourceFolders !== undefined
          ? { sourceFolders: [...new Set(sourceFolders)] }
          : {}),
        ...(ignore !== undefined ? { ignore: [...new Set(ignore)] } : {}),
        ...(maxFiles !== undefined ? { maxFiles } : {}),
        reviewMode: 'full',
        allowLargeResponse: true,
      },
      purpose: 'Read the complete typed Go package-import evidence; focus only contains legacy file edges.',
    },
  };
}

function inferImportsTool({
  rootPath,
  sourceFolders,
  ignore,
  maxFiles,
  reconcile = true,
  reviewMode,
  allowLargeResponse,
  afterReviewId,
  focusPath,
  focusDirection,
  focusLimit,
  focusAfterEdgeId,
} = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalStringArray(sourceFolders, 'sourceFolders', { max: SOURCE_FOLDER_ARRAY_MAX_ITEMS });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  requireOptionalBoolean(reconcile, 'reconcile');
  requireOptionalEnum(reviewMode, 'reviewMode', ['full', 'next', 'focus']);
  requireOptionalBoolean(allowLargeResponse, 'allowLargeResponse');
  requireOptionalNonBlankString(afterReviewId, 'afterReviewId');
  requireOptionalNonBlankString(focusPath, 'focusPath');
  requireOptionalEnum(focusDirection, 'focusDirection', ['incoming', 'outgoing', 'both']);
  requireOptionalPositiveInteger(focusLimit, 'focusLimit', { max: 100 });
  requireOptionalNonBlankString(focusAfterEdgeId, 'focusAfterEdgeId');
  const requestedReviewMode = reviewMode ?? (focusPath === undefined ? undefined : 'focus');
  if (allowLargeResponse !== undefined && reviewMode !== 'full') {
    throw new Error('allowLargeResponse is only valid with reviewMode "full".');
  }
  if (afterReviewId !== undefined && reviewMode !== 'next') {
    throw new Error('afterReviewId is only valid with reviewMode "next".');
  }
  if (requestedReviewMode === 'focus' && focusPath === undefined) {
    throw new Error('reviewMode "focus" requires focusPath.');
  }
  if (focusPath !== undefined && requestedReviewMode !== 'focus') {
    throw new Error('focusPath is only valid with reviewMode "focus" or with reviewMode omitted.');
  }
  if (
    (focusDirection !== undefined || focusLimit !== undefined || focusAfterEdgeId !== undefined) &&
    requestedReviewMode !== 'focus'
  ) {
    throw new Error('focusDirection, focusLimit, and focusAfterEdgeId are only valid in focus mode.');
  }
  if (reviewMode === 'next' && reconcile === false) {
    throw new Error('reviewMode "next" requires reconcile:true because the review queue is a vault diff.');
  }
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  const result = inferImports(target, {
    sourceFolders,
    ignore,
    maxFiles,
  });

  if (requestedReviewMode === 'focus') {
    const focusReview = buildImportImpactFocus(result.edges, {
      focusPath,
      direction: focusDirection,
      limit: focusLimit,
      afterEdgeId: focusAfterEdgeId ?? null,
    });
    const packageImportEvidenceSummary = buildGoPackageImportEvidenceSummary(result, {
      sourceFolders,
      ignore,
      maxFiles,
    });
    if (packageImportEvidenceSummary) {
      focusReview.interpretation +=
        ' This focus response covers legacy file edges only; use the explicit full-evidence call for typed Go package imports.';
    }
    return {
      contract: 'inferImportsFocus:v1',
      rootPath: result.rootPath,
      filesScanned: result.filesScanned,
      coverage: result.coverage,
      scanSummary: {
        fileEdges: result.edges.length,
        externalImports: result.externalImports.length,
        unresolvedImports: result.unresolved.length,
        moduleEdges: result.moduleEdges.length,
      },
      ...(packageImportEvidenceSummary ? { packageImportEvidenceSummary } : {}),
      focusReview,
    };
  }

  // Atlas roadmap Track A #1 — reconcile the code-derived module edges against
  // the vault's compiled depends_on edges so the agent gets "exactly what to
  // review", not a raw firehose. Read-only; raw imports never land directly.
  // Guarded: a missing/unreadable vault must never fail the import scan.
  if (reconcile !== false) {
    try {
      const artifact = compileOntology(loadVaultDocs(VAULT_ROOT), { includeIndexes: true });
      const nodeSlugs = new Set((artifact.nodes ?? []).map((n) => n.slug).filter(Boolean));
      // Where each node says its implementation lives — used to decide **whether
      // to defer judgement**. Calling a relation implemented in a language the
      // scanner cannot read (Rust and friends) "absent from the code" makes an
      // agent delete a correct relation (measured on this repository itself,
      // 2026-08-17: 3 of 3 were that case).
      const pathBySlug = Object.create(null);
      for (const node of artifact.nodes ?? []) {
        if (node?.slug && typeof node.path === 'string') pathBySlug[node.slug] = node.path;
      }
      const r = reconcileImportEdges({
        moduleEdges: result.moduleEdges,
        compiledEdges: artifact.edges,
        aliasToSlug: artifact.indexes?.aliasToSlug,
        nodeSlugs,
        pathBySlug,
        scannedExtensions: result.coverage?.supportedExtensions,
      });
      result.reconciliation = r;
      // Factual, never-lie hint: only report "in sync" when there is genuinely
      // no drift in any bucket (the prior version falsely claimed "match" while
      // silently swallowing real edges — the bug the gate caught).
      const parts = [];
      if (r.inCodeMissingFromVault.length > 0) {
        parts.push(
          `${r.inCodeMissingFromVault.length} import-backed candidate(s) are missing from the vault with both endpoints already nodes — inspect exact evidence, supply semantic rationale, and obtain human approval before one explicit write`,
        );
      }
      if (r.inCodeMissingEndpointAbsent.length > 0) {
        parts.push(
          `${r.inCodeMissingEndpointAbsent.length} import-backed candidate(s) reference a slug that is not yet a vault node (model endpoints before semantic review)`,
        );
      }
      if (r.inVaultNotInCode.length > 0) {
        parts.push(
          // Never assert "stale". An import is **one kind of evidence**, and a
          // dependency may be a spawned process or a config pointer instead — all
          // three of this repository's own edges were that case (2026-08-17).
          `${r.inVaultNotInCode.length} vault depends_on edge(s) have no matching code import. An import is only one kind of evidence: a dependency can be a process spawn, a config reference, or a runtime contract. Read the code before treating any of these as stale`,
        );
      }
      if (r.notJudgeableByImports.length > 0) {
        parts.push(
          `${r.notJudgeableByImports.length} vault depends_on edge(s) could NOT be judged from imports because an endpoint's implementation is not in a scanned language (do not treat these as stale — read the code yourself or leave them alone)`,
        );
      }
      if (result.unresolved.length > 0) {
        parts.push(
          `${result.unresolved.length} unresolved import(s) could not be compared with the vault (inspect unresolved before claiming sync)`,
        );
      }
      result.reconciliationSummary = {
        inBoth: r.inBoth.length,
        inCodeMissingFromVault: r.inCodeMissingFromVault.length,
        inCodeMissingEndpointAbsent: r.inCodeMissingEndpointAbsent.length,
        inVaultNotInCode: r.inVaultNotInCode.length,
        notJudgeableByImports: r.notJudgeableByImports.length,
        unresolvedImports: result.unresolved.length,
        hint:
          parts.length > 0
            ? `${parts.join('; ')}.`
            : `code import graph and vault depends_on edges are in sync (${r.inBoth.length} shared, no drift).`,
      };
    } catch {
      // No loadable vault (e.g. scanning a foreign repo) — skip reconciliation silently.
      result.reconciliation = null;
    }
  }

  const automaticLimitBytes = 128 * 1024;
  let effectiveReviewMode = requestedReviewMode ?? 'full';
  let delivery;
  if (reviewMode === undefined || (reviewMode === 'full' && allowLargeResponse !== true)) {
    const estimatedFullResponseBytes = estimateMcpToolResultUtf8Bytes(result);
    if (estimatedFullResponseBytes <= automaticLimitBytes) {
      return result;
    }
    if (reviewMode === 'full') {
      const confirmationError = new Error(
        `Estimated full response (${estimatedFullResponseBytes} bytes) exceeds the 128 KiB delivery limit. Retry with reviewMode:"full", allowLargeResponse:true only when the complete arrays are intentionally required, or use reviewMode:"next" for one bounded review packet.`,
      );
      confirmationError.repairFields = {
        largeResponseConfirmationRequired: true,
        estimatedFullResponseBytes,
        automaticLimitBytes,
        retryArguments: {
          reviewMode: 'full',
          allowLargeResponse: true,
        },
        boundedAlternative: {
          reviewMode: 'next',
        },
      };
      throw confirmationError;
    }
    if (reconcile === false || !result.reconciliation || !result.reconciliationSummary) {
      const deliveryError = new Error(
        `Estimated full response (${estimatedFullResponseBytes} bytes) exceeds the automatic 128 KiB delivery limit, but compact review requires reconcile:true and a loadable active vault. Retry with reconcile:true, or explicitly opt in to the large payload with reviewMode:"full", allowLargeResponse:true.`,
      );
      deliveryError.repairFields = {
        estimatedFullResponseBytes,
        automaticLimitBytes,
        requiredForCompact: {
          reconcile: true,
          loadableActiveVault: true,
        },
        explicitFullOverride: {
          reviewMode: 'full',
          allowLargeResponse: true,
        },
      };
      throw deliveryError;
    }
    effectiveReviewMode = 'next';
    delivery = {
      selection: 'automatic_compact',
      reason: 'estimated_full_response_exceeds_limit',
      estimatedFullResponseBytes,
      automaticLimitBytes,
      explicitFullAvailable: true,
      explicitFullArguments: {
        reviewMode: 'full',
        allowLargeResponse: true,
      },
    };
  }

  if (effectiveReviewMode === 'next') {
    if (!result.reconciliation || !result.reconciliationSummary) {
      throw new Error(
        'reviewMode "next" requires a loadable active vault so import candidates can be reconciled against existing ontology nodes.',
      );
    }
    const nextReview = buildNextImportRelationReview(result.reconciliation, {
      afterReviewId: afterReviewId ?? null,
      rootPath: result.rootPath,
    });
    const packageImportEvidenceSummary = buildGoPackageImportEvidenceSummary(result, {
      sourceFolders,
      ignore,
      maxFiles,
    });
      return {
        contract: 'inferImportsReview:v1',
        ...(delivery ? { delivery } : {}),
        rootPath: result.rootPath,
        filesScanned: result.filesScanned,
        coverage: result.coverage,
      scanSummary: {
        fileEdges: result.edges.length,
        externalImports: result.externalImports.length,
        unresolvedImports: result.unresolved.length,
        moduleEdges: result.moduleEdges.length,
      },
      ...(packageImportEvidenceSummary ? { packageImportEvidenceSummary } : {}),
      reconciliationSummary: result.reconciliationSummary,
      staleEdgeFollowUp: buildImportStaleEdgeFollowUp(result),
      reviewQueue: {
        total: nextReview?.cursor.total ?? 0,
        returned: nextReview ? 1 : 0,
        exhausted: nextReview === null,
        afterReviewId: afterReviewId ?? null,
      },
      nextReview,
    };
  }

  return result;
}

function estimateMcpToolResultUtf8Bytes(result) {
  const response = {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
  return Buffer.byteLength(JSON.stringify(response), 'utf8');
}

function indexProjectTool({ rootPath, maxDepth, maxFiles, threshold, skipImports = false } = {}) {
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
  const validation = validateVaultTool({ repoRoot: target });

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
  const compiled = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const vaultProjectNodes = (compiled.nodes ?? []).filter((node) => node.kind === 'project');
  const analyzedProjectSlug = analyze.project?.slug ?? null;
  const matchingVaultProject = analyzedProjectSlug
    ? vaultProjectNodes.find(
        (node) =>
          node.slug === analyzedProjectSlug ||
          node.frontmatter?.slug === analyzedProjectSlug ||
          compiled.indexes?.aliasToSlug?.[analyzedProjectSlug] === node.slug,
      )
    : null;
  const vaultRelativeToTarget = relative(target, VAULT_ROOT);
  const vaultInsideTarget =
    vaultRelativeToTarget === '' ||
    (!vaultRelativeToTarget.startsWith(`..${sep}`) && vaultRelativeToTarget !== '..');
  const uninitializedVault =
    vaultProjectNodes.length === 1 &&
    vaultProjectNodes[0].slug === 'project' &&
    /^my project$/i.test(String(vaultProjectNodes[0].title ?? ''));
  const validationAlignment = matchingVaultProject
    ? 'matching-project'
    : uninitializedVault
      ? 'uninitialized-vault'
      : vaultProjectNodes.length > 0 && analyzedProjectSlug
        ? 'mismatched-project'
        : 'unknown';
  const validationAppliesToAnalyzedProject =
    Boolean(matchingVaultProject) || (uninitializedVault && vaultInsideTarget);
  const validationNote = validationAppliesToAnalyzedProject
    ? validationAlignment === 'matching-project'
      ? 'The active vault project identity matches the analyzed repository.'
      : 'The starter vault is inside the analyzed repository; validation is a pre-bootstrap baseline.'
    : 'The active vault is not proven to describe the analyzed repository; treat these counts as active-vault diagnostics, not analyzed-project quality.';
  const existingSlugs = new Set((compiled.nodes ?? []).map((node) => node.slug));
  const aliasToSlug = compiled.indexes?.aliasToSlug ?? {};
  const ambiguousAliases = new Set(
    (compiled.ambiguousAliases ?? []).map((row) => row.alias),
  );
  const candidateSlugs = conceptCandidates.map((candidate) => candidate.slug);
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
  const conceptDelta = {
    candidates: conceptCount,
    existing: existingConceptSlugs.length,
    ambiguous: ambiguousConceptSlugs.length,
    new: newConceptSlugs.length,
    limited: newConceptSlugs.length > 10 || ambiguousConceptSlugs.length > 10,
    sampleAmbiguousSlugs: ambiguousConceptSlugs.slice(0, 10),
    sampleNewSlugs: newConceptSlugs.slice(0, 10),
  };
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
        'CLI index --apply may write analyzer concepts/containment; inferred imports remain rationale-review-required',
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
      applyTool: 'add_concepts; add_relation only after semantic rationale + human approval',
      cliApply: 'ontology-atlas index [rootPath] --apply --vault [vault]',
      review: 'plan.concepts counts raw candidates, not accepted ontology claims; inspect extractionContract and proposedBusinessOntology, manually resolve ambiguous aliases, answer the competency questions, then run reviewCalls. CLI apply never promotes inferred imports to depends_on.',
      reviewCalls,
    },
  };
}

function summarizeBusinessEvidenceRows(rows) {
  return [...rows]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'capability' ? -1 : 1;
      return String(a.slug).localeCompare(String(b.slug));
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

export {
  analyzeRepoStructureTool,
  inspectArchitectureTool,
  inferImportsTool,
  indexProjectTool,
};
