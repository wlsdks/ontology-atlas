export {
  addSources,
  copyNeedsConfirm,
  dismissSourceCopy,
  readSourceCopy,
  startSourceCopy,
  stopSourceCopy,
  subscribeSourceCopy,
  summarizeAddSources,
  type SkippedUnlisted,
  type SourceCopyJob,
  type SourceCopyPlan,
  type SourceCopySkipReason,
} from "./lib/sources/add-sources";
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
export { buildCompileBrief } from "./lib/wiki/compile/compile-brief";
export { COMPILE_BATCH_SIZE, selectCompileBatch, selectCompileTargets } from "./lib/wiki/compile/compile-batch";
export { buildLintBrief, isMapKind, parseLintCandidates, parseLintFindings, dropCandidatesWithNodes } from "./lib/wiki/lint-brief";
export type { LintFinding } from "./lib/wiki/lint-brief";
export { buildFixBrief } from "./lib/wiki/fix-brief";
export { buildWikiShapeFixBrief } from "./lib/wiki/wiki-fix-brief";
export type { LintNodeCandidate } from "./lib/wiki/lint-brief";
export { buildProposeNodeBrief } from "./lib/wiki/propose-node-brief";
export { judgePageWrite, wikiNodeIndexOfDocs, wikiPagePathOf } from "./lib/wiki/judge-page-write";
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
export { countDeskReadablePages, countDeskWikiPages, deskBriefEvidence, deskLeadTermRuns, deskSearchPrefixes, deskSentenceWindow, jevClaimEligibility, jevPayloadEligibility, newestDeskQuestions, questionDeskListingVersion, questionDeskReportFileCurrent, recentDeskPages } from './lib/questions/question-desk';
export { planDeskSourceReads, searchDesk } from './lib/questions/desk-search';
export type { DeskCitation, DeskClaim, DeskLead } from './lib/questions/desk-search';
export type { AskQuestionId } from "./lib/questions/ask-brief";
export { buildAnswerPage } from "./lib/questions/answer-page";
export { answerHistoryUnreadable, answerObservation, answerRefreshBrief, automaticWikiWriteAllowed, buildAnswerRevision, isRetainedAnswerPath, retainedAnswerHeads } from './lib/questions/answer-revision';
export type { AnswerObservation, RetainedAnswerHead } from './lib/questions/answer-revision';
export { answerRevisionStore, prepareAnswerRefresh, saveAnswerRevision } from './lib/questions/answer-revision-store';
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
export type { LibraryPageFacts } from "./model/library-page-facts";
export { sectionSlices } from "./lib/wiki/section-slices";
export {
  isWikiFolderCode,
  libraryDanglingLinkCount,
  libraryOffTemplateCount,
} from "./model/merge-wiki-verdict";
