/**
 * **One door** to the chat window — the arithmetic deciding which branch owns
 * it.
 *
 * ## Why this is a function (owner report, 2026-08-16)
 *
 * Two branches can hold a conversation: the coding agent installed on the
 * machine (ACP), and the stored API key. Each used to own **its own door and
 * its own open state**, unaware of the other, so **two similar chat windows
 * could appear** to the right of the map. What the owner saw: *"isn't this
 * a different agent? and this window? confusing — let's use just one chat
 * window."* (isn't this
 * a different agent? and this window? confusing — let's use just one chat
 * window.)
 *
 * Two branches is a fact, not the problem; two doors and two windows was. The
 * decision lives here so that **they cannot both be open** is guaranteed by
 * this file rather than by the screen — as a conditional inside a 5,600-line
 * screen, the next person fixes one side and nobody notices.
 *
 * ## Three rules
 *
 * 1. If the coding agent is available, **it** owns the window: it uses this
 *    folder's tools and rides the subscription and settings the user already
 *    has.
 * 2. Otherwise the key branch owns it — the path left for someone not running
 *    a coding agent.
 * 3. An "ask about this" carried by the URL follows the same rules. It used to
 *    open the key branch on its own, so the window opened from a chip and the
 *    window opened from a node were **different windows**.
 */

export interface AgentChatDoorInput {
  /** A gated coding agent was detected and there is a folder to give it. */
  hasRuntime: boolean;
  /** The coding-agent conversation is currently open. */
  runtimeOpen: boolean;
  /** The key-branch panel is currently open. */
  keyOpen: boolean;
  /** The URL carries an "ask about this concept" intent. */
  hasAskIntent: boolean;
}

export interface AgentChatDoor {
  /** The coding-agent conversation owns the window. */
  runtime: boolean;
  /** The key branch owns the window. */
  key: boolean;
  /** Whether a chat window is up — what the chip's pressed state reads. */
  open: boolean;
}

export function agentChatDoor({
  hasRuntime,
  runtimeOpen,
  keyOpen,
  hasAskIntent,
}: AgentChatDoorInput): AgentChatDoor {
  const runtime = hasRuntime && (runtimeOpen || hasAskIntent);
  // `!runtime` is the whole function — it makes both being true unrepresentable.
  const key = !runtime && (keyOpen || hasAskIntent);
  return { runtime, key, open: runtime || key };
}
