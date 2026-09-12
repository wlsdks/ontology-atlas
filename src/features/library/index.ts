export { addSources, addSourcesInBrowser, summarizeAddSources } from "./lib/add-sources";
export {
  discoverSources,
  withoutImportedNames,
  type DiscoveryOutcome,
} from "./lib/discover-sources";
export {
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
} from "./lib/declined-candidates";
export { buildCompileBrief, selectCompileTargets } from "./lib/compile-brief";
export { buildLintBrief, isMapKind, parseLintCandidates, parseLintFindings, dropCandidatesWithNodes } from "./lib/lint-brief";
export type { LintFinding } from "./lib/lint-brief";
export { buildFixBrief } from "./lib/fix-brief";
export { buildWikiShapeFixBrief } from "./lib/wiki-fix-brief";
export type { LintNodeCandidate } from "./lib/lint-brief";
export { buildProposeNodeBrief } from "./lib/propose-node-brief";
export { judgePageWrite, wikiPagePathOf } from "./lib/judge-page-write";
export { appendWikiLog, describeCompileTurn, describeLintTurn, parseWikiLog } from "./lib/wiki-log";
export type { WikiLogEntry } from "./lib/wiki-log";
export type { PageWriteRequest, PageWriteVerdict } from "./lib/judge-page-write";
export { FindDocumentsDialog } from "./ui/FindDocumentsDialog";
export { buildAskBrief } from "./lib/ask-brief";
export type { AskQuestionId } from "./lib/ask-brief";
export { buildAnswerPage } from "./lib/answer-page";
export { answerObservation, answerRefreshBrief, automaticWikiWriteAllowed, buildAnswerRevision, isRetainedAnswerPath, retainedAnswerHeads } from './lib/answer-revision';
export type { AnswerObservation, RetainedAnswerHead } from './lib/answer-revision';
export { answerRevisionStore, answerTextHash, prepareAnswerRefresh, saveAnswerRevision } from './lib/answer-revision-store';
export type { AnswerRefreshSnapshot } from './lib/answer-revision-store';
export { createWikiFile, deleteWikiFile, writeWikiFile } from "./lib/write-wiki-file";
export { buildHumanPage } from "./lib/human-page";
export {
  EMPTY_LIBRARY_WORK_ACTIVITY,
  appendLibraryWorkReceipt,
  beginLibraryWork,
  clearLibraryWork,
  completeLibraryWork,
  completedAcpReadEvent,
  libraryWorkErrorEvent,
  libraryWorkEventFromAcpSnapshot,
  libraryWorkEventFromLocalSnapshot,
  localCompileWaitingEvent,
  observedWikiWriteEvents,
  successfulLocalWriteEvents,
} from "./model/library-work-activity";
export type {
  LibraryWorkActivity,
  LibraryWorkEvent,
  LibraryWorkTarget,
} from "./model/library-work-activity";
