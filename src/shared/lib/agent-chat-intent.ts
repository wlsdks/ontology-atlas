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
  /**
   * A first turn to open with, or `null` for a conversation that starts empty.
   *
   * ⚠️ **Why a door may carry a sentence** (decision, 2026-08-24). The first-run card had no route
   * from an existing codebase to a map of it: opening a folder with no Markdown gives an empty map,
   * and the only real path was a folded terminal row whose own copy told app users it excluded
   * them. The app cannot run the analysis itself — it never calls MCP, that being the agents'
   * surface — so the door hands the work to the agent, which is the shape this product argues for
   * anyway: the agent works through MCP and the person approves each write.
   *
   * The sentence arrives as **the person's own turn**, visible in the transcript, and every write
   * it leads to still stops at the permission card. Nothing here bypasses a checkpoint; it saves a
   * person from typing an instruction they already pressed a button to give.
   */
  prompt?: string | null;
}

export function requestAgentChat(
  runtimeId: string | null = null,
  prompt: string | null = null,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AgentChatIntentDetail>(AGENT_CHAT_INTENT_EVENT, {
      detail: { runtimeId, prompt },
    }),
  );
}

/**
 * Queue a destination-to-map request before navigation. A window event alone is
 * lost while `/agents` is mounted because the map subscriber does not exist on
 * that route. Session storage carries exactly one one-shot runtime id across the
 * route change; the map consumes and removes it before opening the dock.
 */
export function queueAgentChatIntent(runtimeId: string, prompt: string | null = null): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      AGENT_CHAT_INTENT_QUEUE_KEY,
      JSON.stringify({ runtimeId, prompt } satisfies AgentChatIntentDetail),
    );
  } catch {
    // Navigation still proceeds. The map will simply have no queued request.
  }
}

export interface QueuedAgentChatIntent {
  runtimeId: string;
  /** The first turn to open with, or `null` for an empty conversation. */
  prompt: string | null;
}

/** Returns `undefined` when no valid queued request exists. Always clears the slot. */
export function consumeQueuedAgentChatIntent(): QueuedAgentChatIntent | undefined {
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
    if (typeof parsed.runtimeId !== 'string' || parsed.runtimeId.length === 0) return undefined;
    return {
      runtimeId: parsed.runtimeId,
      // A malformed or absent prompt degrades to an ordinary open rather than failing the whole
      // request — the door's first promise is the conversation, the sentence is the convenience.
      prompt: typeof parsed.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt : null,
    };
  } catch {
    return undefined;
  }
}

/** Subscribes to the request. Returns the unsubscribe function, for use as effect cleanup. */
export function subscribeAgentChatIntent(
  handler: (runtimeId: string | null, prompt: string | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AgentChatIntentDetail>).detail;
    handler(
      detail?.runtimeId ?? null,
      typeof detail?.prompt === 'string' && detail.prompt.trim() ? detail.prompt : null,
    );
  };
  window.addEventListener(AGENT_CHAT_INTENT_EVENT, listener);
  return () => window.removeEventListener(AGENT_CHAT_INTENT_EVENT, listener);
}
