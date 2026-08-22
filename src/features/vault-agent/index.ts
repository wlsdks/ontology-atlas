/**
 * The vault agent — a vault-scoped tool loop with screen context.
 *
 * **This barrel exports no write function.** The only write is `proposal-applier`,
 * called by the consent card's handler, and even that reaches the disk only through a
 * write port injected by the widget.
 */
export { runTurn, startTurn } from './model/agent-loop';
export type { AgentLoopDeps, StartTurnInput, TurnRunResult } from './model/agent-loop';
export { extractCitations } from './model/citation';
export type { CitationResult } from './model/citation';
export {
  FIRST_WORDS_MAX_CHIPS,
  buildFirstWords,
  nodeIntent,
  parseNodeIntentKind,
  screenIntentFor,
  sentenceForIntent,
} from './model/first-words';
export type {
  BuildFirstWordsInput,
  FirstWordsChip,
  FirstWordsIntent,
  FirstWordsLabels,
  FirstWordsNode,
  FirstWordsNodeIntentKind,
  FirstWordsSlot,
} from './model/first-words';
export {
  NEXT_STEP_MARKER,
  NEXT_STEP_MAX_CHARS,
  splitNextStep,
} from './model/next-step';
export type { NextStepSplit } from './model/next-step';
export {
  EMPTY_SCREEN_CONTEXT,
  RECENT_CHANGES_CHAR_CAP,
  RECENT_CHANGES_LINE_CAP,
  formatScreenContextBlock,
  screenContextEcho,
} from './model/screen-context';
export { AGENT_INSTRUCTIONS_FILE, buildSystemPrompt } from './model/system-prompt';
export {
  AGENT_READ_TOOLS,
  AGENT_TOOLS,
  AGENT_WRITE_TOOLS,
  findAgentTool,
  isProposalToolName,
} from './model/tool-catalog';
export type { AgentToolDefinition, AgentJsonSchema } from './model/tool-catalog';
export { createToolExecutor, GRAPH_FRONTMATTER_KEYS, wrapUntrusted } from './model/tool-executor';
export type { ToolExecution } from './model/tool-executor';
export type { VaultReadDoc, VaultReadPort } from './model/vault-read-port';
export {
  PROVIDER_ADAPTERS,
  resolveProviderAdapter,
} from './model/providers';
export { PROVIDER_DEFAULT_MODELS } from './model/provider-adapter';
export type {
  NormalizedResponse,
  NormalizedToolCall,
  ProviderAdapter,
} from './model/provider-adapter';
export {
  AGENT_ROUND_CAP,
  AGENT_TOOL_RESULT_CHAR_CAP,
  AGENT_TURN_VAULT_CHAR_CAP,
} from './model/types';
export type {
  AgentEvent,
  AgentProposal,
  AnswerGrounding,
  AgentTurn,
  AgentTurnStatus,
  CitedParagraph,
  NoticeCode,
  ProposalChange,
  ProposalStatus,
  ProposalToolName,
  ProposedFileChange,
  ScreenContextSnapshot,
  ToolCallRecord,
} from './model/types';
