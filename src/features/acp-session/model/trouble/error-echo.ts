/** Stops the screen stating one failure twice (the adapter sends the error as a message and rejects the RPC); only the last single line wholly contained in the error text on screen is erased. */

/** The shortest measured failure sentence is `Failed to authenticate` (22 characters); below half of that, one-word replies (`Error`, `Done`) could be contained by coincidence. */
const MIN_ECHO_LENGTH = 16;

const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();

export function isErrorEcho(text: unknown, error: unknown): boolean {
  if (typeof text !== 'string' || typeof error !== 'string') return false;
  const message = normalize(text);
  if (message.length < MIN_ECHO_LENGTH) return false;
  return normalize(error).includes(message);
}

/** Only the last line: if the agent later repeats an old error mid-conversation, that is its own statement. */
export function withoutErrorEcho<T extends { kind: string; text?: string }>(
  events: readonly T[],
  error: unknown,
): readonly T[] {
  const last = events.at(-1);
  if (!last || last.kind !== 'agent') return events;
  return isErrorEcho(last.text, error) ? events.slice(0, -1) : events;
}
