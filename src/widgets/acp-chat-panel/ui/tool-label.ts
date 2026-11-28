/**
 * Turns a tool-call line into words a person reads. The wired-in server's tools are translated by
 * meaning; other servers' tools show as is with only the prefix stripped, since a guess would lie.
 */

import { atlasCallIntent } from '@/features/acp-session';

/**
 * Every advertised tool must be listed: the inventory contract test reads `TOOLS_FOR_LIST`.
 * Tools may share a word, but the object (source, history, code) stays distinct.
 */
const VAULT_TOOL_KEYS: Readonly<Record<string, string>> = {
  connection_info: 'connect',
  startup: 'connect',

  list_concepts: 'read',
  list_kinds: 'read',
  get_concept: 'read',
  get_concepts: 'read',
  query_ontology: 'read',
  find_backlinks: 'read',
  find_neighbors: 'read',
  find_path: 'read',
  get_constellation: 'readConstellation',

  // Reads of something that is not the graph. The object is the whole information here.
  read_source: 'readSource',
  index_project: 'readCode',
  infer_imports: 'readCode',
  analyze_repo_structure: 'readCode',
  inspect_architecture: 'readCode',

  validate_vault: 'check',
  validate_wiki: 'checkPages',

  add_concept: 'addNode',
  add_concepts: 'addNode',
  patch_concept: 'editNode',
  rename_concept: 'renameNode',
  merge_concepts: 'mergeNodes',
  delete_concept: 'deleteNode',
  add_relation: 'addRelation',
  add_relations: 'addRelation',
  remove_relation: 'removeRelation',
  compile_ontology: 'compile',
  absorb_document: 'absorb',
  connect_project_source: 'connectSource',
  disconnect_project_source: 'disconnectSource',
  finalize_project_meaning: 'judgeMeaning',
};

/** Two calls read as another when one argument says so (see `atlasCallIntent`). */
const INTENT_LABEL_KEYS: Readonly<Record<string, string>> = {
  replace_relation: 'replaceRelation',
  reclassify_concept: 'reclassifyNode',
};

/** The labels this table uses, for the contract that binds it to the server's own inventory. */
export const VAULT_TOOL_LABEL_KEYS: readonly string[] = [
  ...new Set([...Object.values(VAULT_TOOL_KEYS), ...Object.values(INTENT_LABEL_KEYS)]),
];

export const LABELLED_VAULT_TOOLS: readonly string[] = Object.keys(VAULT_TOOL_KEYS);

export interface ToolLabel {
  /**
   * Words a person reads. An i18n key under `acpChat.tool` (`known`), under
   * `acpChat.toolKind` (`kind`), or the raw name.
   */
  text: string;
  /**
   * `known` = a tool whose meaning we know · `kind` = only the protocol's kind of the call is
   * known · `raw` = only the name is shown.
   */
  kind: 'known' | 'kind' | 'raw';
}

const ACP_TOOL_KIND_WORDS = ['read', 'edit', 'delete', 'move', 'search', 'execute', 'fetch'] as const;

/**
 * A call on our own server that the table does not know reads as its protocol `kind`, not its
 * function name. Other servers' tools keep their own names.
 */
export function withKindFallback(
  label: ToolLabel,
  title: string,
  vaultServerName: string,
  toolKind: string | null | undefined,
): ToolLabel {
  if (label.kind !== 'raw' || !isVaultTool(title, vaultServerName)) return label;
  const kind = (ACP_TOOL_KIND_WORDS as readonly string[]).includes(toolKind ?? '') ? toolKind! : null;
  return kind ? { kind: 'kind', text: kind } : label;
}

const DOTTED_MCP_TITLE = /^mcp\.([^.]+)\.([^.]+)$/;

/**
 * Codex titles a call `mcp.<server>.<tool>` and titles ordinary commands as well, so the dotted
 * spelling becomes `mcp__<server>__<tool>` only when the call's own envelope names the same tool.
 */
export function canonicalToolTitle(title: string, rawInput: unknown): string {
  const dotted = DOTTED_MCP_TITLE.exec(title.trim());
  if (!dotted || !rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return title;
  const [, server, tool] = dotted;
  const envelope = rawInput as Record<string, unknown>;
  return envelope.server === server && envelope.tool === tool ? `mcp__${server}__${tool}` : title;
}

/**
 * `mcp__atlas-vault__add_concept` → `{ kind: 'known', text: 'addNode' }`
 * `mcp__other__do_thing`          → `{ kind: 'raw',   text: 'do_thing' }`
 * `Terminal`                      → `{ kind: 'raw',   text: 'Terminal' }`
 */
/**
 * Whether this call went to the vault server we wired in. It sits beside `toolLabel` because both
 * turn on the same prefix; `tool-outcome.ts` uses it to tell a result count `total` from another field.
 */
export function isVaultTool(title: string, vaultServerName: string): boolean {
  return title.trim().startsWith(`mcp__${vaultServerName}__`);
}

export function toolLabel(title: string, vaultServerName: string, rawInput?: unknown): ToolLabel {
  const trimmed = title.trim();
  if (!trimmed) return { kind: 'raw', text: '' };

  const ourPrefix = `mcp__${vaultServerName}__`;
  if (trimmed.startsWith(ourPrefix)) {
    const bare = trimmed.slice(ourPrefix.length);
    const known = VAULT_TOOL_KEYS[bare];
    if (known) {
      const intent = atlasCallIntent(bare, rawInput);
      return { kind: 'known', text: INTENT_LABEL_KEYS[intent] ?? known };
    }
    // Our server but not in this table — meaning the tool set grew. Nothing is
    // invented; only the name is shown (and we chose that name, so it still reads).
    return { kind: 'raw', text: bare };
  }

  // Someone else's MCP tool: strip only the server prefix from `mcp__<server>__<tool>`.
  const foreign = /^mcp__[^_]+(?:_[^_]+)*?__(.+)$/.exec(trimmed);
  if (foreign) return { kind: 'raw', text: foreign[1] };

  return { kind: 'raw', text: trimmed };
}

/**
 * A raw label drops the path the row already names in its target slot, keeping the verb. It cuts only
 * when the label ends with the adapter's path argument; otherwise it is left as it arrived.
 */
export function labelWithoutRepeatedPath(label: ToolLabel, path: string | null): ToolLabel {
  if (label.kind !== 'raw' || !path) return label;
  const text = label.text.trim();
  const target = path.trim();
  if (!target || !text.endsWith(target)) return label;
  // A separator between the verb and the path is part of the repetition, not of the verb.
  const head = text.slice(0, text.length - target.length).replace(/[\s:·\-–—]+$/u, '').trim();
  return head ? { kind: 'raw', text: head } : label;
}

/**
 * A command call is titled with the command itself, which its `command` argument repeats, often
 * inside a shell wrapper. The row then names the act and keeps the title as the one command shown.
 */
export function commandRowWords(label: ToolLabel, command: string | null): { label: ToolLabel; target: string } | null {
  if (label.kind !== 'raw' || !command) return null;
  const title = label.text.replace(/\s+/g, ' ').trim();
  if (!title || !command.replace(/\s+/g, ' ').includes(title)) return null;
  return { label: { kind: 'kind', text: 'execute' }, target: title };
}
