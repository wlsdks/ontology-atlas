import { inferImports } from '../../infer-imports.mjs';
import { buildImportImpactFocus } from '../../infer-imports/import-impact-focus.mjs';
import { buildNextImportRelationReview } from '../../drift/reconcile-imports.mjs';
import { REPO_ROOT, assertScanRootAllowed } from '../../server/runtime.mjs';
import { okResponseBytes } from '../../server/rpc.mjs';
import {
  IGNORE_ARRAY_MAX_ITEMS,
  SOURCE_FOLDER_ARRAY_MAX_ITEMS,
} from '../../server/tool-schemas/array-limits.mjs';
import {
  requireOptionalBoolean,
  requireOptionalEnum,
  requireOptionalNonBlankString,
  requireOptionalPositiveInteger,
  requireOptionalStringArray,
} from '../../server/validate.mjs';
import { chooseAutomaticImportDelivery, resolveImportReviewMode } from './import-review-rules.mjs';
import { reconcileWithVault } from './vault-reconciliation.mjs';

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

export function inferImportsTool({
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
  const requestedReviewMode = resolveImportReviewMode({
    reviewMode,
    reconcile,
    allowLargeResponse,
    afterReviewId,
    focusPath,
    focusDirection,
    focusLimit,
    focusAfterEdgeId,
  });
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

  if (reconcile !== false) reconcileWithVault(result);

  let effectiveReviewMode = requestedReviewMode ?? 'full';
  let delivery;
  if (reviewMode === undefined || (reviewMode === 'full' && allowLargeResponse !== true)) {
    const choice = chooseAutomaticImportDelivery({
      reviewMode,
      reconcile,
      hasReconciliation: Boolean(result.reconciliation && result.reconciliationSummary),
      estimatedFullResponseBytes: okResponseBytes(result),
    });
    if (choice.whole) return result;
    effectiveReviewMode = 'next';
    delivery = choice.delivery;
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
