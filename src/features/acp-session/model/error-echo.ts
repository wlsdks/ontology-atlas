/**
 * Stops the screen stating one failure twice: the adapter sends the error as a message and
 * rejects the RPC. The erase condition is narrow: only the last single line wholly contained
 * in the error text on screen.
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
