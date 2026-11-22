const AUTOMATIC_LIMIT_BYTES = 128 * 1024;

/**
 * The review mode the arguments ask for: `reviewMode`, or focus when a `focusPath`
 * is given. Refuses argument combinations no mode supports.
 */
export function resolveImportReviewMode({
  reviewMode,
  reconcile,
  allowLargeResponse,
  afterReviewId,
  focusPath,
  focusDirection,
  focusLimit,
  focusAfterEdgeId,
}) {
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
  return requestedReviewMode;
}

/**
 * What an import scan sent without an explicit full request does with a response
 * of `estimatedFullResponseBytes`: send it whole (`{ whole: true }`), or fall back to
 * the compact review (`{ delivery }`). Refuses where neither is possible: an explicit
 * full request over the limit, or a compact review with no reconciliation to review.
 */
export function chooseAutomaticImportDelivery({ reviewMode, reconcile, hasReconciliation, estimatedFullResponseBytes }) {
  const automaticLimitBytes = AUTOMATIC_LIMIT_BYTES;
  if (estimatedFullResponseBytes <= automaticLimitBytes) {
    return { whole: true };
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
  if (reconcile === false || !hasReconciliation) {
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
  return {
    delivery: {
      selection: 'automatic_compact',
      reason: 'estimated_full_response_exceeds_limit',
      estimatedFullResponseBytes,
      automaticLimitBytes,
      explicitFullAvailable: true,
      explicitFullArguments: {
        reviewMode: 'full',
        allowLargeResponse: true,
      },
    },
  };
}

/** The counts of a reconciliation and the one sentence that says whether the vault and the code agree. */
export function summarizeReconciliation(r, unresolvedCount) {
  // Report "in sync" only when no bucket has drift.
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
      // Never assert "stale": an import is one kind of evidence, and a dependency may be
      // a spawned process or a config pointer instead.
      `${r.inVaultNotInCode.length} vault depends_on edge(s) have no matching code import. An import is only one kind of evidence: a dependency can be a process spawn, a config reference, or a runtime contract. Read the code before treating any of these as stale`,
    );
  }
  if (r.notJudgeableByImports.length > 0) {
    parts.push(
      `${r.notJudgeableByImports.length} vault depends_on edge(s) could NOT be judged from imports because an endpoint's implementation is not in a scanned language (do not treat these as stale — read the code yourself or leave them alone)`,
    );
  }
  if (unresolvedCount > 0) {
    parts.push(
      `${unresolvedCount} unresolved import(s) could not be compared with the vault (inspect unresolved before claiming sync)`,
    );
  }
  return {
    inBoth: r.inBoth.length,
    inCodeMissingFromVault: r.inCodeMissingFromVault.length,
    inCodeMissingEndpointAbsent: r.inCodeMissingEndpointAbsent.length,
    inVaultNotInCode: r.inVaultNotInCode.length,
    notJudgeableByImports: r.notJudgeableByImports.length,
    unresolvedImports: unresolvedCount,
    hint:
      parts.length > 0
        ? `${parts.join('; ')}.`
        : `code import graph and vault depends_on edges are in sync (${r.inBoth.length} shared, no drift).`,
  };
}
