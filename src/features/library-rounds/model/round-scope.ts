import type { RoundKind } from '@/entities/library-round';

/**
 * **The standing scope of a round** — what one pass may do with nobody at the screen.
 *
 * Decision: `docs/records/decisions/2026-09-17-library-rounds-standing-scope-*.md`. A person
 * approves a round once, in the sheet whose primary press reads "Allow and save" above these
 * exact sentences. During a pass every permission request the adapter raises comes here, and the
 * answer is allow or reject — never "ask", because there is nobody to ask.
 *
 * The table in the spec (§6) is the contract; this file is that table as code. Fail closed: a
 * request this judge does not recognise is refused, and the refusal is named in the pass ledger so
 * the person reads "refused: <tool>" in the morning rather than nothing.
 *
 * ## Connector tools and `toolKind`
 *
 * ACP adapters classify their own file tools (`read`, `edit`, …) but rarely classify an MCP
 * server's tools, which arrive as `other` or with no kind. A round's own connector is a source
 * the person approved for exactly this round, so its tools are allowed unless the adapter says
 * the call edits, deletes, moves or executes. Every connector tool the pass calls is listed in
 * the ledger, so a tool that should not have been called is visible the next morning.
 */

export interface ScopeRequest {
  filePath: string | null;
  toolName: string | null;
  toolKind: string | null;
  rawInput: Record<string, unknown>;
  reviewKind: 'permission' | 'ontology-write';
}

interface ScopeRound {
  kind: RoundKind;
  onStale?: 'mark' | 'redraft';
  /** The name the connector is attached under — the `mcp__<name>__` prefix of its tools. */
  connectorName?: string;
  /**
   * Every connector the round's places name (2026-09-21). A round may watch a Slack room and a
   * Confluence space in one pass, so the allow-list is the union; `connectorName` stays because
   * a record written before places holds only that one.
   */
  connectorNames?: readonly string[];
}

export interface ScopeInput {
  request: ScopeRequest;
  round: ScopeRound;
  /** The open folder, absolute, no trailing slash. */
  vaultRoot: string;
  /** The name the vault's own MCP server is attached under. */
  vaultServerName: string;
  /** `'read' | 'write' | null` for the vault server's own tools; `null` when it is not one. */
  atlasToolMode: (toolName: string | null, serverName: string) => 'read' | 'write' | null;
  /** The Library's page judge: a verdict for a `wiki/` page write, `null` for anything else. */
  judgeWrite: (request: ScopeRequest) => { path: string; ok: boolean } | null;
}

/**
 * `note` is what the transcript and the ledger record: `read <path>`, `write <path>` or
 * `call <tool>`. The first word is what lets the ledger list writes apart from reads.
 */
export type ScopeVerdict =
  | { decision: 'allow'; note: string }
  | { decision: 'reject'; reason: string };

export function scopeNoteEffect(note: string): { effect: 'read' | 'write' | 'call'; target: string } | null {
  const cut = note.indexOf(' ');
  if (cut < 0) return null;
  const effect = note.slice(0, cut);
  if (effect !== 'read' && effect !== 'write' && effect !== 'call') return null;
  return { effect, target: note.slice(cut + 1) };
}

const MUTATING_KINDS = new Set(['edit', 'delete', 'move', 'execute']);
const READING_KINDS = new Set(['read', 'search', 'fetch']);

function vaultRelative(filePath: string | null, vaultRoot: string): string | null {
  if (!filePath || !vaultRoot) return null;
  const root = vaultRoot.replace(/\/+$/, '');
  if (filePath === root) return '';
  if (!filePath.startsWith(`${root}/`)) return null;
  const relative = filePath.slice(root.length + 1);
  if (/[\\\0]/.test(relative)) return null;
  const parts = relative.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return relative;
}

/**
 * Is this one of `server`'s tools?
 *
 * Matched as the whole prefix `mcp__<server>__`, never by splitting at the first `__`: a
 * connector the person attached as `notion__staging` owns `mcp__notion__staging__search`, and
 * reading the name up to the first separator called that server `notion` — a name that matches
 * neither the vault server nor the round's own connector, so every tool of that connector was
 * refused as "other connector".
 */
function isToolOf(toolName: string | null, server: string): boolean {
  return Boolean(toolName && server && toolName.startsWith(`mcp__${server}__`));
}

/** The connectors this round was approved for, from its places and its legacy field alike. */
function roundConnectors(round: ScopeRound): string[] {
  const names = new Set<string>();
  for (const name of round.connectorNames ?? []) if (name) names.add(name);
  if (round.connectorName) names.add(round.connectorName);
  return [...names];
}

export function judgeRoundScope({
  request,
  round,
  vaultRoot,
  vaultServerName,
  atlasToolMode,
  judgeWrite,
}: ScopeInput): ScopeVerdict {
  if (request.reviewKind === 'ontology-write') {
    return { decision: 'reject', reason: 'ontology-write' };
  }

  if (request.toolName?.startsWith('mcp__')) {
    if (isToolOf(request.toolName, vaultServerName)) {
      const mode = atlasToolMode(request.toolName, vaultServerName);
      return mode === 'read'
        ? { decision: 'allow', note: `call ${request.toolName}` }
        : { decision: 'reject', reason: request.toolName ?? 'atlas write' };
    }
    const approved = roundConnectors(round);
    if (round.kind === 'service' && approved.some((name) => isToolOf(request.toolName, name))) {
      const kind = (request.toolKind ?? '').trim().toLowerCase();
      if (MUTATING_KINDS.has(kind)) return { decision: 'reject', reason: request.toolName ?? 'connector mutation' };
      return { decision: 'allow', note: `call ${request.toolName}` };
    }
    return { decision: 'reject', reason: request.toolName ?? 'other connector' };
  }

  const relative = vaultRelative(request.filePath, vaultRoot);
  if (relative === null) {
    return { decision: 'reject', reason: request.filePath ?? request.toolName ?? 'outside folder' };
  }

  const kind = (request.toolKind ?? '').trim().toLowerCase();
  if (READING_KINDS.has(kind)) return { decision: 'allow', note: `read ${relative || '.'}` };

  if (MUTATING_KINDS.has(kind) && kind !== 'edit') {
    return { decision: 'reject', reason: relative };
  }

  if (relative.startsWith('wiki/') && relative.endsWith('.md')) {
    if (relative.startsWith('wiki/answers/') || relative.startsWith('wiki/_')) {
      return { decision: 'reject', reason: relative };
    }
    const verdict = judgeWrite(request);
    return verdict?.ok
      ? { decision: 'allow', note: `write ${relative}` }
      : { decision: 'reject', reason: relative };
  }

  if (relative.startsWith('sources/') && relative !== 'sources/') {
    return round.kind === 'service'
      ? { decision: 'allow', note: `write ${relative}` }
      : { decision: 'reject', reason: relative };
  }

  return { decision: 'reject', reason: relative || '.' };
}
