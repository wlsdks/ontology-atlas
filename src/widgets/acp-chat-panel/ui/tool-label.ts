/**
 * Turn one tool-call line into **words a person reads.**
 *
 * ## Why it is needed (2026-08-16)
 *
 * On the real thing, the transcript came out like this:
 *
 * ```
 * 작업  mcp__atlas-vault__list_concepts
 * 작업  mcp__atlas-vault__add_concept
 * 실행  Terminal
 * ```
 *
 * Those are function names, not what happened. This repository's design rule
 * already forbids it — *"전문용어는 쉬운 말로. `영향받음 N` → 「이 노드를 쓰는 곳
 * N」"* (jargon in plain words). For the screen to make waiting bearable through
 * "you can see what is happening", that line has to read.
 *
 * ## It says only what it knows
 *
 * **We know the tools of the server we wired in** — we named them. Those are
 * translated by meaning. Someone else's tools we **do not know**: only the server
 * prefix is stripped from the name and the rest is shown as is. Inventing something
 * plausible like "reads a file" makes the screen lie on the day it diverges from
 * what the tool actually did.
 */

/** Tool names on the vault server we wired in → what that tool does. */
const VAULT_TOOL_KEYS: Readonly<Record<string, string>> = {
  connection_info: 'connect',
  list_concepts: 'read',
  list_kinds: 'read',
  get_concept: 'read',
  find_backlinks: 'read',
  find_neighbors: 'read',
  find_path: 'read',
  query_ontology: 'read',
  validate_vault: 'check',
  add_concept: 'addNode',
  patch_concept: 'editNode',
  rename_concept: 'renameNode',
  merge_concepts: 'mergeNodes',
  add_relation: 'addRelation',
  add_relations: 'addRelation',
  startup: 'connect',
};

export interface ToolLabel {
  /** Words a person reads. An i18n key (when `kind` is `known`) or the raw name. */
  text: string;
  /** `known` = a tool whose meaning we know · `raw` = only the name is shown. */
  kind: 'known' | 'raw';
}

/**
 * `mcp__atlas-vault__add_concept` → `{ kind: 'known', text: 'addNode' }`
 * `mcp__other__do_thing`          → `{ kind: 'raw',   text: 'do_thing' }`
 * `Terminal`                      → `{ kind: 'raw',   text: 'Terminal' }`
 */
export function toolLabel(title: string, vaultServerName: string): ToolLabel {
  const trimmed = title.trim();
  if (!trimmed) return { kind: 'raw', text: '' };

  const ourPrefix = `mcp__${vaultServerName}__`;
  if (trimmed.startsWith(ourPrefix)) {
    const bare = trimmed.slice(ourPrefix.length);
    const known = VAULT_TOOL_KEYS[bare];
    if (known) return { kind: 'known', text: known };
    // Our server but not in this table — meaning the tool set grew. Nothing is
    // invented; only the name is shown (and we chose that name, so it still reads).
    return { kind: 'raw', text: bare };
  }

  // Someone else's MCP tool: strip only the server prefix from `mcp__<server>__<tool>`.
  const foreign = /^mcp__[^_]+(?:_[^_]+)*?__(.+)$/.exec(trimmed);
  if (foreign) return { kind: 'raw', text: foreign[1] };

  return { kind: 'raw', text: trimmed };
}
