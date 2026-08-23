/**
 * Stops the screen stating one failure **twice**.
 *
 * ## What was seen on the real thing (2026-08-17, installed app)
 *
 * Sending one message with an expired claude login made the conversation pane look like this:
 *
 * ```
 * [me]  My project node and example area node …
 *       Failed to authenticate: OAuth session expired and could not be refreshed
 *       ┌─────────────────────────────────────────┐
 *       │ Login has expired                        │
 *       │ Run that tool once in the terminal …      │
 *       │ Details ▸ {"code":-32603,"message":"Inter…│
 *       └─────────────────────────────────────────┘
 * ```
 *
 * The same failure twice, and **the English original reads first.** The card below translates it
 * into human words and even supplies the next step, but the line above it plants "this is not for me
 * to read" first. It is the same failure this repository has already met and fixed
 * (`AcpChatPanel.tsx`: *"it pasted what the adapter gave, verbatim … owner: how is a user supposed
 * to understand this?"*) — the card was fixed then, and it was missed that the adapter sends the
 * same thing **as a message too**.
 *
 * ## Why not "hide what the agent said"
 *
 * Erasing something the agent said is dangerous, so the erase condition is kept as narrow as
 * possible: **only the last single line that is wholly contained in the error text already on
 * screen.** The two measured strings stand in exactly that relation —
 *
 * - message: `Failed to authenticate: OAuth session expired and could not be refreshed`
 * - error:   `{"code":-32603,"message":"Internal error: Failed to authenticate: OAuth
 *              session expired and could not be refreshed","data":{…}}`
 *
 * An agent's **real answer** never becomes a substring of an RPC error string. A short coincidence
 * (the agent saying just `Error`) still has to be prevented, hence a length floor.
 */

/**
 * Anything shorter than this is not erased. The shortest measured failure sentence is
 * `Failed to authenticate` (22 characters), and below half of that is the territory of ordinary
 * one-word replies that could be contained by coincidence (`Error`, `Done`, `ok`).
 */
const MIN_ECHO_LENGTH = 16;

const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();

/** Is this message a repeat of the error currently on screen? */
export function isErrorEcho(text: unknown, error: unknown): boolean {
  if (typeof text !== 'string' || typeof error !== 'string') return false;
  const message = normalize(text);
  if (message.length < MIN_ECHO_LENGTH) return false;
  return normalize(error).includes(message);
}

/**
 * The event list the screen will draw. It looks at **the last line only** — if the agent later
 * repeats something an old error said mid-conversation, that is its own statement, not an echo.
 */
export function withoutErrorEcho<T extends { kind: string; text?: string }>(
  events: readonly T[],
  error: unknown,
): readonly T[] {
  const last = events.at(-1);
  if (!last || last.kind !== 'agent') return events;
  return isErrorEcho(last.text, error) ? events.slice(0, -1) : events;
}
