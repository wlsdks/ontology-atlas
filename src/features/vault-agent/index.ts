/**
 * 볼트 에이전트 — 화면 문맥을 가진, 볼트 한정 도구 루프.
 *
 * 이 배럴이 내보내는 것에 **쓰기 함수는 없다.** 쓰기는 동의 카드 핸들러가
 * 부르는 `proposal-applier` 하나뿐이고, 그것도 위젯이 주입한 쓰기 포트를
 * 통해서만 디스크에 닿는다.
 */
export { runTurn, startTurn } from './model/agent-loop';
export type { AgentLoopDeps, StartTurnInput, TurnRunResult } from './model/agent-loop';
export { extractCitations } from './model/citation';
export type { CitationResult } from './model/citation';
export {
  EMPTY_SCREEN_CONTEXT,
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
