'use client';

/**
 * One-way signal from the settings sheet to the map's conversation panel, joined by a window event
 * because the shell owns one and the map the other.
 */

const AGENT_CHAT_INTENT_EVENT = 'ontology-atlas:agent-chat-intent';
const AGENT_CHAT_INTENT_QUEUE_KEY = 'ontology-atlas:agent-chat-intent:pending';

interface AgentChatIntentDetail {
  /** Which runtime to open with; unset means whichever is currently selected. */
  runtimeId: string | null;
  /**
   * A first turn to open with, or `null` for an empty conversation. It arrives as the person's own
   * turn and every write still stops at the permission card.
   */
  prompt?: string | null;
}

/** True only when the currently mounted workbench explicitly accepts this request. */
export function requestAgentChat(runtimeId:string|null=null,prompt:string|null=null):boolean {
  if(typeof window==='undefined')return false;
  return !window.dispatchEvent(new CustomEvent<AgentChatIntentDetail>(AGENT_CHAT_INTENT_EVENT,{
    cancelable:true,detail:{runtimeId,prompt},
  }));
}

/**
 * Queue a destination-to-map request before navigation. A window event alone is
 * lost while `/agents` is mounted because the map subscriber does not exist on
 * that route. Session storage carries exactly one one-shot runtime id across the
 * route change; the map consumes and removes it before opening the dock.
 */
export function queueAgentChatIntent(
  /*
   * Null runtime means whichever runner is already connected; a caller that knows the task but not the
   * runner must not be dropped.
   */
  runtimeId: string | null,
  prompt: string | null = null,
): void {
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
  /** `null` when the caller named a task but not a runner; the map falls back to the connected one. */
  runtimeId: string | null;
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
    const runtimeId =
      typeof parsed.runtimeId === 'string' && parsed.runtimeId.length > 0 ? parsed.runtimeId : null;
    const prompt =
      typeof parsed.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt : null;
    /*
     * An entry that names neither a runner nor a task is malformed — there is nothing to act on.
     * One of the two is enough: a runner alone opens the dock, a task alone opens it on whatever is
     * connected.
     */
    if (!runtimeId && !prompt) return undefined;
    return {
      runtimeId,
      // A malformed or absent prompt degrades to an ordinary open rather than failing the whole
      // request — the door's first promise is the conversation, the sentence is the convenience.
      prompt,
    };
  } catch {
    return undefined;
  }
}

/** Subscribes to the request. Returns the unsubscribe function, for use as effect cleanup. */
export function subscribeAgentChatIntent(
  handler: (runtimeId: string | null, prompt: string | null) => void | boolean,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AgentChatIntentDetail>).detail;
    const accepted=handler(
      detail?.runtimeId ?? null,
      typeof detail?.prompt === 'string' && detail.prompt.trim() ? detail.prompt : null,
    );
    if(accepted===true)event.preventDefault();
  };
  window.addEventListener(AGENT_CHAT_INTENT_EVENT, listener);
  return () => window.removeEventListener(AGENT_CHAT_INTENT_EVENT, listener);
}
