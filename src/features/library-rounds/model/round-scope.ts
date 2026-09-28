import type { RoundKind } from '@/entities/library-round';
import { isWikiFurnitureSlug } from '@/shared/lib/wiki-page-schema';

import { pageIdentity, roundDraftProblem } from './pass-pages';

/**
 * What one unattended pass may do: allow or reject, never ask, and fail closed on anything
 * unrecognised. Decision: docs/records/decisions/2026-09-17-library-rounds-standing-scope-*.md.
 * The round's connector tools pass unless the adapter says they edit, delete, move or execute.
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
  /** Every connector the round's places name; `connectorName` stays for older records. */
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
  judgeWrite: (request: ScopeRequest) => { path: string; ok: boolean; text: string } | null;
  node?: (relative: string) => boolean;
  unsafe?: (relative: string) => boolean;
}

/** The note the ledger records: `read <path>`, `write <path>` or `call <tool>`. */
export type ScopeVerdict =
  | { decision: 'allow'; note: string; wrote?: { path: string; text: string | null } }
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

/** Matches the whole `mcp__<server>__` prefix, since a server name may itself contain `__`. */
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
  node,
  unsafe,
}: ScopeInput): ScopeVerdict {
  if (request.reviewKind === 'ontology-write') {
    return { decision: 'reject', reason: request.toolName ?? 'ontology-write' };
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

  // Ontology rounds are read-only reviews: they may inspect source evidence but never edit the vault.
  if (round.kind === 'ontology' || node?.(relative) || unsafe?.(relative)) {
    return { decision: 'reject', reason: relative || request.toolName || 'ontology review is read-only' };
  }

  const folded = pageIdentity(relative);
  if (folded.startsWith('wiki/') && folded.endsWith('.md')) {
    if (!relative.startsWith('wiki/') || folded.startsWith('wiki/answers/') || folded.startsWith('wiki/_') || isWikiFurnitureSlug(folded)) {
      return { decision: 'reject', reason: relative };
    }
    const verdict = judgeWrite(request);
    return verdict?.ok && roundDraftProblem(verdict.text) === null
      ? { decision: 'allow', note: `write ${relative}`, wrote: { path: relative, text: verdict.text } }
      : { decision: 'reject', reason: relative };
  }

  if (relative.startsWith('sources/') && relative !== 'sources/') {
    return round.kind === 'service'
      ? { decision: 'allow', note: `write ${relative}`, wrote: { path: relative, text: null } }
      : { decision: 'reject', reason: relative };
  }

  return { decision: 'reject', reason: relative || '.' };
}
