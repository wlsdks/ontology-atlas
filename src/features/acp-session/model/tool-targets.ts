/**
 * **Which node a tool touched.**
 *
 * ## Why (2026-08-17)
 *
 * The tool line only said "read the concept" and **did not specify which concept**.
 * So even when reading the conversation history later, one cannot know what happened, nor
 * can it be linked to the map. The value was arriving. The initial `tool_call` or the completed
 * `tool_call_update` carrying `rawInput`, and the session hook merges both into a single tool row.
 *
 * ## The argument names were chosen by counting
 *
 * Measured frequency of the argument names carrying a slug in our MCP source:
 * `slug` 74 · `from` 40 · `to` 40 · `newSlug` 6 · `oldSlug` 5 · `targetSlug` 2 · `intoSlug` 2 ·
 * `fromSlug` 2. The list was not assembled by guessing.
 *
 * ## And only known names survive
 *
 * The same rule as `link-slugs.ts`. `newSlug` is a name not yet in the vault and is naturally filtered
 * out — which is correct. A marker pointing at something that does not exist goes nowhere when
 * pressed, and someone who meets one stops pressing the rest.
 */

/**
 * The argument names that carry a slug. **The written order is the order on screen** — `from`/`to`
 * are a relation's direction and must not be reversed.
 */
const SLUG_ARG_KEYS = [
  'slug',
  'from',
  'to',
  'oldSlug',
  'newSlug',
  'fromSlug',
  'intoSlug',
  'targetSlug',
] as const;

/**
 * The per-row ceiling. A tool row is the conversation's background, not its subject — grown long, it
 * gets noisier than the answer that actually needs reading.
 */
const TOOL_TARGET_LIMIT = 3;

export function readToolTargets(
  rawInput: unknown,
  known: ReadonlySet<string>,
): string[] {
  if (known.size === 0) return [];
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return [];
  const input = rawInput as Record<string, unknown>;
  const out: string[] = [];
  for (const key of SLUG_ARG_KEYS) {
    const value = input[key];
    if (typeof value !== 'string') continue;
    if (!known.has(value)) continue;
    if (out.includes(value)) continue;
    out.push(value);
    if (out.length >= TOOL_TARGET_LIMIT) break;
  }
  return out;
}

/**
 * **When no vault node is named, the row still says what the call was aimed at.**
 *
 * ## Why (2026-09-05)
 *
 * `readToolTargets` deliberately keeps only slugs the vault already holds, so pressing a
 * marker always lands somewhere. That rule is right for a marker and wrong for a trace:
 * it leaves `Read · /src/shared/lib/cn.ts`, `Grep · readToolOutcome`, and
 * `add_concept({slug:'capabilities/not-yet-written'})` — the row that most needs a name,
 * because the concept is being created and therefore cannot be in the vault yet — with
 * nothing after the verb.
 *
 * So this is the second lane, used only when the first found nothing. Its result is
 * **plain text, never a marker**: it names something this vault may not contain, and a
 * dotted underline would promise a destination that does not exist.
 *
 * ## The names are measured, not guessed
 *
 * - Paths: the exact list `acp-client.ts` already uses for the permission gate, measured
 *   there against both claude's built-ins (`file_path`) and our own server (`filePath`,
 *   and `rootPath` for the tools that sweep a folder).
 * - Names: the same `SLUG_ARG_KEYS` above, in the same order, so `from`/`to` keep a
 *   relation's direction.
 * - Queries: `pattern` (Grep, Glob), `query` (search tools), `operation` (our
 *   `query_ontology`, whose only required argument it is), `command` (a shell run), `url`,
 *   and the two filters `list_concepts` narrows a listing by — `kind` and `domain`.
 *   Without those last two the most common read in the app, 「list every capability」,
 *   arrives with an empty target.
 */
export type ToolFallbackTarget = { kind: 'path' | 'name' | 'query'; value: string };

/** Path argument names, kept identical to the permission gate's measured list. */
const PATH_ARG_KEYS = ['file_path', 'filePath', 'rootPath', 'root_path', 'path', 'targetPath'] as const;

/** Argument names that carry what was searched for rather than what was touched. */
const QUERY_ARG_KEYS = [
  'pattern',
  'query',
  'operation',
  'command',
  'url',
  'kind',
  'domain',
] as const;

/** A single line has to stay a single line; past this the value is cut with an ellipsis. */
const FALLBACK_TARGET_LIMIT = 60;

function firstString(
  input: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** `/Users/me/work/atlas/src/shared/lib/cn.ts` → `lib/cn.ts`. Enough to recognise, short enough to sit inline. */
function pathTail(value: string): string {
  const parts = value.split(/[/\\]+/).filter(Boolean);
  return parts.slice(-2).join('/') || value;
}

function clamp(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= FALLBACK_TARGET_LIMIT) return compact;
  return `${compact.slice(0, FALLBACK_TARGET_LIMIT - 1).trimEnd()}…`;
}

export function readToolFallbackTarget(rawInput: unknown): ToolFallbackTarget | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const input = rawInput as Record<string, unknown>;

  const path = firstString(input, PATH_ARG_KEYS);
  if (path) return { kind: 'path', value: clamp(pathTail(path)) };

  const name = firstString(input, SLUG_ARG_KEYS);
  if (name) return { kind: 'name', value: clamp(name) };

  const query = firstString(input, QUERY_ARG_KEYS);
  if (query) return { kind: 'query', value: clamp(query) };

  return null;
}
