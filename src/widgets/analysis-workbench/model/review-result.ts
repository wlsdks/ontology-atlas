import type { AnalysisRun } from '@/entities/analysis-record';
import { requestsAnalysisFindings } from '@/features/acp-session';
import { parseInvestigationPacket } from '@/features/gray-area';

/** The two requests the app records: an AI review that asks for findings, and the map's code-check investigation. */
export function isRecordedReviewRequest(requestText: string): boolean {
  return requestsAnalysisFindings(requestText) || parseInvestigationPacket(requestText) !== null;
}

/** Earlier versions recorded every chat turn; such a run is a result only while it still carries a question. */
export function isReviewResult(run: AnalysisRun): boolean {
  return isRecordedReviewRequest(run.request.text) || run.findings.length > 0;
}
