/**
 * The next step comes from the same turn's last `NEXT:` line, never an extra call the user did not
 * press. It becomes one prefill chip, never a pending card.
 */

/** The marker the model uses for the next step. It is never shown on screen. */
const NEXT_STEP_MARKER = 'NEXT:';

/** How much fits on one chip line. Anything longer is trimmed — a chip is not a paragraph. */
export const NEXT_STEP_MAX_CHARS = 140;

export interface NextStepSplit {
  /** The body to be rendered. The `NEXT:` line is removed. */
  body: string;
  /** The one sentence that becomes a chip. Null when absent. */
  nextStep: string | null;
}

/** Splits off only a `NEXT:` at the start of the last line; one mid-body may be a quote. */
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

/** Trims for a chip; `[[slug]]` becomes the bare name, since the input box does not use citation chips. */
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
