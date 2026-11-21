import type { LibraryAgentOpeningRequest } from "../../ui/agent/LibraryAgentDock";
import type { QuestionDeskReportRequest } from "../../ui/questions/LibraryQuestionDesk";

export interface RetainedLibraryAnswer {
  generation: number;
  question: string;
  text: string;
  askedOn: string | null;
  origin?: 'question-report';
}

export type LibraryAskContext = {
  question: string;
  askedOn: string | null;
  report?: Pick<QuestionDeskReportRequest, 'searchId' | 'listingVersion' | 'vaultScope' | 'coverage' | 'limits'> & { epoch: number };
};

export interface RetryAsk {
  nonce: number;
  text: string;
  scope: string;
  context: LibraryAskContext;
}

/** The opening request a typed turn answers: the same text, and not one already consumed. */
export function matchLibraryOpeningRequest(
  text: string,
  request: LibraryAgentOpeningRequest | null,
  consumedNonce: number | null,
): LibraryAgentOpeningRequest | null {
  return request && request.nonce !== consumedNonce && request.text.trim() === text.trim()
    ? request
    : null;
}

/** A filed answer leaves the offer only if it is still the one on offer, not a newer answer. */
export function clearFiledAnswer(current: RetainedLibraryAnswer | null, filed: RetainedLibraryAnswer): RetainedLibraryAnswer | null {
  return current === filed ? null : current;
}

/** Undo puts the filed answer back only if no later turn started and nothing else is on offer. */
export function restoreFiledAnswer(current: RetainedLibraryAnswer | null, filed: RetainedLibraryAnswer, generation: number): RetainedLibraryAnswer | null {
  return generation === filed.generation && current === null ? filed : current;
}

/**
 * Whether a retried ask still belongs to this request: the same opening request and text in the
 * same folder, and a desk report that has neither been invalidated nor outlived its listing.
 */
export function retryAskApplies(
  retry: RetryAsk | null,
  ask: { nonce: number; text: string },
  scope: string,
  report: { epoch: number; listingVersion: string },
): retry is RetryAsk {
  if (!retry || retry.nonce !== ask.nonce || retry.text !== ask.text.trim() || retry.scope !== scope) return false;
  const kept = retry.context.report;
  return !kept || (kept.epoch === report.epoch && kept.vaultScope === scope && kept.listingVersion === report.listingVersion);
}
