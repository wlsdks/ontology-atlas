/**
 * Turn one tool-call line into **words a person reads.**
 *
 * ## Why it is needed (2026-08-16)
 *
 * On the real thing, the transcript came out like this:
 *
 * ```
 * Run  mcp__atlas-vault__list_concepts
 * Run  mcp__atlas-vault__add_concept
 * Execute  Terminal
 * ```
 *
 * Those are function names, not what happened. This repository's design rule
 * already forbids it — *"Use plain words for jargon. `Affected N` → 「Places using this node
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

/**
 * Tool names on the vault server we wired in → what that tool does.
 *
 * ⚠️ **Every tool the server advertises has to be in here** — the table stopped at fifteen while
 * the server grew to forty, so the transcript printed `read_source`, `compile_ontology`,
 * `validate_wiki`, `delete_concept` and twenty-one other function names at people (measured
 * 2026-09-19). That is precisely the defect this file was written to end, and it returned quietly
 * because nothing tied the table to the inventory. `tests/contract/tool-label-inventory.contract.test.ts`
 * now reads `TOOLS_FOR_LIST` — the list the server actually answers `tools/list` with — so a new
 * tool cannot ship without a word.
 *
 * **Words, not names, and only where we know the meaning.** Several tools share one word where
 * they do one thing for a person: seven different reads of the graph are all 「read the map」.
 * What is *not* collapsed is the **object**: reading a source file, reading the folder's history
 * and reading the code are three different things to have done, and one word for all of them
 * would say less than the function name did.
 */
const VAULT_TOOL_KEYS: Readonly<Record<string, string>> = {
  connection_info: 'connect',
  startup: 'connect',

  // Reads of the graph itself.
  list_concepts: 'read',
  list_kinds: 'read',
  get_concept: 'read',
  get_concepts: 'read',
  query_concepts: 'read',
  query_ontology: 'read',
  find_backlinks: 'read',
  find_neighbors: 'read',
  find_path: 'read',
  find_evidence: 'findEvidence',
  find_orphans: 'findOrphans',
  get_constellation: 'readConstellation',
  list_constellations: 'readConstellation',

  // Reads of something that is not the graph. The object is the whole information here.
  read_source: 'readSource',
  git_status: 'readHistory',
  git_history: 'readHistory',
  git_snapshot: 'readHistory',
  index_project: 'readCode',
  infer_imports: 'readCode',
  analyze_repo_structure: 'readCode',
  inspect_architecture: 'readCode',

  // Checks.
  validate_vault: 'check',
  validate_wiki: 'checkPages',

  // Writes.
  add_concept: 'addNode',
  add_concepts: 'addNode',
  patch_concept: 'editNode',
  rename_concept: 'renameNode',
  reclassify_concept: 'reclassifyNode',
  merge_concepts: 'mergeNodes',
  delete_concept: 'deleteNode',
  add_relation: 'addRelation',
  add_relations: 'addRelation',
  remove_relation: 'removeRelation',
  replace_relation: 'replaceRelation',
  compile_ontology: 'compile',
  absorb_document: 'absorb',
  connect_project_source: 'connectSource',
  disconnect_project_source: 'disconnectSource',
  finalize_project_meaning: 'judgeMeaning',
};

/** The labels this table uses, for the contract that binds it to the server's own inventory. */
export const VAULT_TOOL_LABEL_KEYS: readonly string[] = [
  ...new Set(Object.values(VAULT_TOOL_KEYS)),
];

/** The tool names this table knows, for the same contract. */
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

/** The ACP `ToolKind`s that name an action a person can read, in `acpChat.toolKind`. */
const ACP_TOOL_KIND_WORDS = ['read', 'edit', 'delete', 'move', 'search', 'execute', 'fetch'] as const;

/**
 * **A call on our own server that this table does not know reads as its kind, not its name.**
 *
 * Measured 2026-09-25: a write on the vault server's prefix that the table did not list drew
 * `write_wiki_file · wiki/architecture.md · Waiting for you` — a function name as the one thing a
 * permission wait says it is waiting on, in both locales. The adapter does state the call's
 * `kind` (`edit` here), which is the protocol's own word, not one invented here, so the row says
 * that much and nothing more. Someone else's tools keep their own names, as before: their names
 * are all a person has to recognise them by.
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

/**
 * `mcp__atlas-vault__add_concept` → `{ kind: 'known', text: 'addNode' }`
 * `mcp__other__do_thing`          → `{ kind: 'raw',   text: 'do_thing' }`
 * `Terminal`                      → `{ kind: 'raw',   text: 'Terminal' }`
 */
/**
 * Did this call go to the vault server we wired in?
 *
 * It exists beside `toolLabel` because both answers turn on the same prefix, and a second
 * copy of that string is how they come to disagree. `tool-outcome.ts` needs it to decide
 * whether `total` in the answer is a result count or somebody else's field with the same
 * name.
 */
export function isVaultTool(title: string, vaultServerName: string): boolean {
  return title.trim().startsWith(`mcp__${vaultServerName}__`);
}

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

/**
 * **A raw label stops repeating the path the row is already naming.**
 *
 * ## Why (measured in the rendered dock, 2026-09-19)
 *
 * A coding agent's own file tools title themselves with the path: the built-in write arrives
 * as `Write /Users/me/Ontology Atlas/launch/wiki/architecture.md`. The row then drew that
 * title in the label slot — capped at 45% of the row and therefore cut to
 * `Write /Users/me/Ontology Atlas/laun…` — and drew the same file again, whole and readable,
 * in the target slot beside it: `· wiki/architecture.md`. Measured at the dock's default
 * width that is 204px of truncated absolute path standing next to 188px of the same fact.
 *
 * One of the two copies is unreadable and neither adds anything to the other, so the label
 * keeps **only what the target slot cannot say** — the verb.
 *
 * ## It cuts on an exact match or not at all
 *
 * The comparison is against the path argument the adapter actually sent, and the label must
 * *end* with it. A title that merely mentions a similar path, or that is the path alone with
 * no verb in front of it, is left exactly as it arrived — a label this function emptied would
 * be a row that lost its only verb.
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
