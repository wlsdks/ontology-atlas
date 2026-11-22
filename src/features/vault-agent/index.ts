/** The vault agent. This barrel exports no write function; writes go only through `proposal-applier`. */
export { runTurn, startTurn } from './model/agent-loop';
export {
  buildFirstWords,
  nodeIntent,
  parseNodeIntentKind,
  screenIntentFor,
  sentenceForIntent,
} from './model/first-words';
export type {
  FirstWordsChip,
  FirstWordsLabels,
  FirstWordsNodeIntentKind,
} from './model/first-words';
export { buildSystemPrompt } from './model/system-prompt';
export { AGENT_TOOLS } from './model/agent-tools/tool-catalog';
/* Compile's public surface is deliberately small. */
export { opensLocally, selectLocalCompileTargets, useLocalCompile } from './model/compile/use-local-compile';
export type { LocalCompileSession } from './model/compile/use-local-compile';
export type { CompileCardRow } from './model/compile/compile-consent-card';
export { PARSER_SOURCE_FORMATS } from './model/compile/source-text';
export { createToolExecutor } from './model/agent-tools/tool-executor';
export type { VaultReadDoc, VaultReadPort } from './model/agent-tools/vault-read-port';
export { resolveProviderAdapter } from './model/providers';
export { AGENT_ROUND_CAP } from './model/agent-turn';
export type {
  AgentEvent,
  AgentProposal,
  AgentTurn,
  CitedParagraph,
  ProposalChange,
  ScreenContextSnapshot,
  ToolCallRecord,
} from './model/agent-turn';
export { buildBusinessFlowRequest } from "./model/business-flow-request";
export { applyProposal, planProposalFiles, proposalLineDiff, proposalToClipboardPacket, summarizeChangeVolume } from './model/proposals/proposal-applier';
export { buildProposal } from './model/proposals/proposal-builder';

export { CONSTRUCTION_TOOLS, CONSTRUCTION_SYSTEM, constructionAdapter, createConstructionExecutor } from './model/agent-tools/construction-executor';
