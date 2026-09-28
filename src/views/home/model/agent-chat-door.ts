/**
 * One door to the chat window, so the coding agent (ACP) and the API-key branch can never both be
 * open. The coding agent owns it when available (folder tools, the user's subscription); otherwise
 * the key branch. A URL "ask about this" follows the same rules, or a chip and a node open
 * different windows.
 */

export interface VaultAgentPrefill {
  text: string;
  nonce: number;
  context?: { label: string; vaultPath: string | null };
}

export interface AgentChatDoorInput {
  /** A gated coding agent was detected and there is a folder to give it. */
  hasRuntime: boolean;
  runtimeOpen: boolean;
  keyOpen: boolean;
  /** The URL carries an "ask about this concept" intent. */
  hasAskIntent: boolean;
}

export interface AgentChatDoor {
  runtime: boolean;
  key: boolean;
  /** The chip's pressed state reads this. */
  open: boolean;
}

export function agentChatDoor({
  hasRuntime,
  runtimeOpen,
  keyOpen,
  hasAskIntent,
}: AgentChatDoorInput): AgentChatDoor {
  const runtime = hasRuntime && (runtimeOpen || hasAskIntent);
  // `!runtime` makes both being true unrepresentable.
  const key = !runtime && (keyOpen || hasAskIntent);
  return { runtime, key, open: runtime || key };
}
