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
export { AGENT_TOOLS } from './model/tool-catalog';
/* Compile's public surface is deliberately small. */
export { selectLocalCompileTargets, useLocalCompile } from './model/use-local-compile';
export type { LocalCompileSession } from './model/use-local-compile';
export type { CompileCardRow } from './model/compile-consent-card';
export { PARSER_SOURCE_FORMATS } from './model/source-text';
export { createToolExecutor } from './model/tool-executor';
export type { VaultReadDoc, VaultReadPort } from './model/vault-read-port';
export { resolveProviderAdapter } from './model/providers';
export { AGENT_ROUND_CAP } from './model/types';
export type {
  AgentEvent,
  AgentProposal,
  AgentTurn,
  CitedParagraph,
  ProposalChange,
  ScreenContextSnapshot,
  ToolCallRecord,
} from './model/types';
export { buildBusinessFlowRequest } from "./model/business-flow-request";
export { applyProposal, proposalToClipboardPacket, summarizeChangeVolume } from './model/proposal-applier';
export { buildProposal } from './model/proposal-builder';
