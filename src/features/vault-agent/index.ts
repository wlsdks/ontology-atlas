/**
 * The vault agent — a vault-scoped tool loop with screen context.
 *
 * **This barrel exports no write function.** The only write is `proposal-applier`,
 * called by the consent card's handler, and even that reaches the disk only through a
 * write port injected by the widget.
 */
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
/*
 * The Compile catalogue's public surface is deliberately small. The tools, the executor,
 * the proposal builder and the adapter are the feature's own internals — the screen needs
 * the hook, the rows it draws, and the two questions it asks about a folder's formats.
 */
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
