/**
 * **The next single step** — the one line that keeps the conversation from stopping
 * after one fix.
 *
 * **Why there is no extra call.** Today, applying one proposal is the end — that is
 * precisely where the sense of "building something" disappears. So the next
 * candidate is taken **from within the same turn's response, where the model is
 * already saying it**: the system prompt requires that after proposing a write, the
 * last line names one next gap with `NEXT:`, and this only splits that line off.
 * Calling the model again to obtain a next step would be a transmission the user did
 * not press, and one more use of someone else's money (BYOK billing).
 *
 * **The next step is a sentence, not a pending card.** All that derives from this
 * line is one chip, and a chip is a prefill. The moment there are two live
 * proposals, "what did I approve" becomes blurred, so an implementation where the
 * next step creates a card is a contract violation.
 */

/** The marker the model uses for the next step. It is never shown on screen. */
export const NEXT_STEP_MARKER = 'NEXT:';

/** How much fits on one chip line. Anything longer is trimmed — a chip is not a paragraph. */
export const NEXT_STEP_MAX_CHARS = 140;

export interface NextStepSplit {
  /** The body to be rendered. The `NEXT:` line is removed. */
  body: string;
  /** The one sentence that becomes a chip. Null when absent. */
  nextStep: string | null;
}

/**
 * Splits the last `NEXT:` line off the response body.
 *
 * Why only the last line: a `NEXT:` in the middle of the body may be the model
 * quoting or explaining, and turning that into a chip makes a control out of
 * something the user never asked for. The marker is a marker only at the start of a line.
 */
export function splitNextStep(text: string): NextStepSplit {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (!line.startsWith(NEXT_STEP_MARKER)) break;
    const sentence = normalizeNextStep(line.slice(NEXT_STEP_MARKER.length));
    const body = lines.slice(0, index).join('\n').trim();
    return { body, nextStep: sentence || null };
  }
  return { body: text, nextStep: null };
}

/**
 * Trims it into a sentence fit for a chip. `[[slug]]` notation is not text a person
 * reads and edits in an input box, so only the name survives — the citation chip is
 * the grammar of the conversation body, not of the input box.
 */
function normalizeNextStep(raw: string): string {
  const plain = raw
    .replace(/\[\[([^[\]]+)\]\]/g, (_match, slug: string) => tailOf(slug.trim()))
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > NEXT_STEP_MAX_CHARS
    ? `${plain.slice(0, NEXT_STEP_MAX_CHARS - 1).trimEnd()}…`
    : plain;
}

function tailOf(slug: string): string {
  const index = slug.lastIndexOf('/');
  return index >= 0 ? slug.slice(index + 1) : slug;
}
