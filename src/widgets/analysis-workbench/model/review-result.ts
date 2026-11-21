import type { AnalysisRun } from '@/entities/analysis-record';
import { requestsAnalysisFindings } from '@/features/acp-session';
import { parseInvestigationPacket } from '@/features/gray-area';

export function isRecordedReviewRequest(requestText: string): boolean {
  return requestsAnalysisFindings(requestText) || parseInvestigationPacket(requestText) !== null;
}

/** Folders written earlier hold every chat turn; such a run is a result only while it still carries a question. */
export function isReviewResult(run: AnalysisRun): boolean {
  return isRecordedReviewRequest(run.request.text) || run.findings.length > 0;
}
