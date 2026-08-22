'use client';

/**
 * "Open a conversation with this tool" — one one-way signal from the settings
 * sheet to the map's conversation panel.
 *
 * **Why it is needed** (review, 2026-08-16). The first step of the getting-started
 * card is named 「AI 에이전트 연결」 (connect an AI agent) and its button opens
 * the Agents section of settings — but that section held **only a list and
 * outbound links**. It showed what had been detected and offered **no door
 * through to actually connecting**. Which tool to use was picked by the code
 * (the first one), and the only place to open a conversation was the header of
 * the conversation panel, i.e. visible only to someone who had already opened one.
 *
 * So each row gets a door: open a conversation with this tool. The settings
 * sheet is owned by the app shell and the conversation panel by the map, so they
 * are joined by the same window-event convention the neighbouring file
 * (`settings-view-intent`) already uses — the same road in the other direction.
 */

const AGENT_CHAT_INTENT_EVENT = 'ontology-atlas:agent-chat-intent';

interface AgentChatIntentDetail {
  /** Which runtime to open with; unset means whichever is currently selected. */
  runtimeId: string | null;
}

export function requestAgentChat(runtimeId: string | null = null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AgentChatIntentDetail>(AGENT_CHAT_INTENT_EVENT, {
      detail: { runtimeId },
    }),
  );
}

/** Subscribes to the request. Returns the unsubscribe function, for use as effect cleanup. */
export function subscribeAgentChatIntent(
  handler: (runtimeId: string | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AgentChatIntentDetail>).detail;
    handler(detail?.runtimeId ?? null);
  };
  window.addEventListener(AGENT_CHAT_INTENT_EVENT, listener);
  return () => window.removeEventListener(AGENT_CHAT_INTENT_EVENT, listener);
}
