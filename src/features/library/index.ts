export { addSources, addSourcesInBrowser, summarizeAddSources } from "./lib/sources/add-sources";
export { useSourceImportFeedback } from './model/use-source-import-feedback';
export {
  discoverSources,
  withoutImportedNames,
  type DiscoveryOutcome,
} from "./lib/sources/discover-sources";
export {
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
} from "./lib/sources/declined-candidates";
export { buildCompileBrief, selectCompileTargets } from "./lib/wiki/compile-brief";
export { buildLintBrief, isMapKind, parseLintCandidates, parseLintFindings, dropCandidatesWithNodes } from "./lib/wiki/lint-brief";
export type { LintFinding } from "./lib/wiki/lint-brief";
export { buildFixBrief } from "./lib/wiki/fix-brief";
export { buildWikiShapeFixBrief } from "./lib/wiki/wiki-fix-brief";
export type { LintNodeCandidate } from "./lib/wiki/lint-brief";
export { buildProposeNodeBrief } from "./lib/wiki/propose-node-brief";
export { judgePageWrite, wikiPagePathOf } from "./lib/wiki/judge-page-write";
export { appendWikiLog, describeCompileTurn, describeLintTurn } from "./lib/wiki/wiki-log";
export type { PageWriteRequest, PageWriteVerdict } from "./lib/wiki/judge-page-write";
export { describeWikiProblem, groupWikiProblems, wikiProblemMachineLine } from "./lib/wiki/describe-wiki-problem";
export { passageLabelText, sourceCitationWords } from "./lib/sources/passage-label";
export type {
  WikiProblemContext,
  WikiProblemTarget,
  WikiProblemWhere,
  WikiProblemWords,
  WikiTemplateProblem,
} from "./lib/wiki/describe-wiki-problem";
export { FindDocumentsDialog } from "./ui/FindDocumentsDialog";
export { buildAskBrief } from "./lib/questions/ask-brief";
export { buildQuestionDeskReportBrief, planQuestionDeskReportFile, questionDeskReportFilename, serializeQuestionDeskReport, splitQuestionDeskReportSections } from './lib/questions/question-desk-brief';
export { countDeskReadablePages, countDeskWikiPages, findDeskClaims, findDeskSourceHits, jevClaimEligibility, jevPayloadEligibility, planDeskSourceReads, questionDeskListingVersion, questionDeskReportFileCurrent, questionTerms } from './lib/questions/question-desk';
export type { DeskCitation, DeskClaim, DeskSourceHit } from './lib/questions/question-desk';
export type { AskQuestionId } from "./lib/questions/ask-brief";
export { buildAnswerPage } from "./lib/questions/answer-page";
export { answerHistoryUnreadable, answerObservation, answerRefreshBrief, automaticWikiWriteAllowed, buildAnswerRevision, isRetainedAnswerPath, retainedAnswerHeads } from './lib/questions/answer-revision';
export type { AnswerObservation, RetainedAnswerHead } from './lib/questions/answer-revision';
export { answerRevisionStore, answerTextHash, prepareAnswerRefresh, saveAnswerRevision } from './lib/questions/answer-revision-store';
export type { AnswerRefreshSnapshot } from './lib/questions/answer-revision-store';
export { createWikiFile, deleteWikiFile, writeWikiFile } from "./lib/wiki/write-wiki-file";
export { buildHumanPage, humanPageSlug } from "./lib/wiki/human-page";
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
  showLibraryWorkStrip,
  libraryWorkSince,
} from "./model/library-work-activity";
export type {
  LibraryWorkActivity,
  LibraryWorkEvent,
  LibraryWorkTarget,
} from "./model/library-work-activity";
export { useLibraryModel } from "./model/use-library-model";
export type { LibraryUiModel } from "./model/use-library-model";
export {
  isAdvisoryWikiCode,
  isWikiFolderCode,
  libraryDanglingLinkCount,
  libraryOffTemplateCount,
} from "./model/merge-wiki-verdict";
