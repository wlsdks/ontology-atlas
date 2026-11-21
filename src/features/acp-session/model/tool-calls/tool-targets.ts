/** Which node a tool touched. Only names already in the vault survive, as in `link-slugs.ts`: a marker to a missing node goes nowhere when pressed. */

/** The argument names that carry a slug, in on-screen order: `from`/`to` are a relation's direction and must not be reversed. */
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

/** A tool row is background, not the subject; grown long it gets noisier than the answer. */
const TOOL_TARGET_LIMIT = 3;

/** Opens the MCP envelope `{ server, tool, arguments }` once; requires all three, as `readCorrelatedMcpToolContext` does, so a tool that merely takes an `arguments` parameter is left alone. */
function toolArguments(input: Record<string, unknown>): Record<string, unknown> {
  const inner = input.arguments;
  if (
    typeof input.server === 'string'
    && typeof input.tool === 'string'
    && !!inner
    && typeof inner === 'object'
    && !Array.isArray(inner)
  ) {
    return inner as Record<string, unknown>;
  }
  return input;
}

export function readToolTargets(
  rawInput: unknown,
  known: ReadonlySet<string>,
): string[] {
  if (known.size === 0) return [];
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return [];
  const input = toolArguments(rawInput as Record<string, unknown>);
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

/** Plain text, never a marker, when no vault node is named: paths use the permission list in `acp-client.ts`, names reuse `SLUG_ARG_KEYS` order. */
export type ToolFallbackTarget = {
  kind: 'path' | 'name' | 'query';
  value: string;
  /** Set when the value alone would not say what it is: `kind: capability` reads as the filter it was, not a target. */
  frame?: string;
};

/** Identical to the permission gate's measured list. */
const PATH_ARG_KEYS = ['file_path', 'filePath', 'rootPath', 'root_path', 'path', 'targetPath'] as const;

const QUERY_ARG_KEYS = [
  'pattern',
  'query',
  'operation',
  'command',
  'url',
  'kind',
  'domain',
] as const;

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

/** The exact argument untouched, not the row's shortened tail: a tail comparison would match `wiki/architecture.md` inside an unrelated absolute path and cut a label that said something else. */
export function readToolPathArgument(rawInput: unknown): string | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  return firstString(rawInput as Record<string, unknown>, PATH_ARG_KEYS);
}

export function readToolCommandArgument(rawInput: unknown): string | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  return firstString(toolArguments(rawInput as Record<string, unknown>), ['command']);
}

export function readToolFallbackTarget(rawInput: unknown): ToolFallbackTarget | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const input = toolArguments(rawInput as Record<string, unknown>);

  const path = firstString(input, PATH_ARG_KEYS);
  if (path) return { kind: 'path', value: clamp(pathTail(path)) };

  const name = firstString(input, SLUG_ARG_KEYS);
  if (name) return { kind: 'name', value: clamp(name) };

  for (const key of QUERY_ARG_KEYS) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    // `Read the map · capability` would read as a concept called capability; kind and domain are framed by their
    // argument, while a path, a slug and a search term say what they are on sight.
    const framed = key === 'kind' || key === 'domain';
    return { kind: 'query', value: clamp(value.trim()), ...(framed ? { frame: key } : {}) };
  }

  return null;
}
