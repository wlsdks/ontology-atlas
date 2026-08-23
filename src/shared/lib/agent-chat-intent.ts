'use client';

/**
 * "Open a conversation with this tool" — one one-way signal from the settings
 * sheet to the map's conversation panel.
 *
 * **Why it is needed** (review, 2026-08-16). The first step of the getting-started
 * card is named 「Connect an AI agent」 (connect an AI agent) and its button opens
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
const AGENT_CHAT_INTENT_QUEUE_KEY = 'ontology-atlas:agent-chat-intent:pending';

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

/**
 * Queue a destination-to-map request before navigation. A window event alone is
 * lost while `/agents` is mounted because the map subscriber does not exist on
 * that route. Session storage carries exactly one one-shot runtime id across the
 * route change; the map consumes and removes it before opening the dock.
 */
export function queueAgentChatIntent(runtimeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      AGENT_CHAT_INTENT_QUEUE_KEY,
      JSON.stringify({ runtimeId } satisfies AgentChatIntentDetail),
    );
  } catch {
    // Navigation still proceeds. The map will simply have no queued request.
  }
}

/** Returns `undefined` when no valid queued request exists. Always clears the slot. */
export function consumeQueuedAgentChatIntent(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(AGENT_CHAT_INTENT_QUEUE_KEY);
    window.sessionStorage.removeItem(AGENT_CHAT_INTENT_QUEUE_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<AgentChatIntentDetail>;
    return typeof parsed.runtimeId === 'string' && parsed.runtimeId.length > 0
      ? parsed.runtimeId
      : undefined;
  } catch {
    return undefined;
  }
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
