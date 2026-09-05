/**
 * The shape of `.ontology-atlas/connectors.json` — the external MCP servers a person has chosen to
 * attach to their in-app agent sessions, kept beside the vault they belong to.
 *
 * ## Why this file exists, and what it must never hold
 *
 * A connector is a command plus an environment, and the environment is where the API token goes.
 * This file is ordinary text in the person's folder, so **it never carries a secret value**. A
 * variable whose name reads like a credential (`…TOKEN`, `…KEY`, `…SECRET`, `…PASSWORD`,
 * `Authorization`) may only carry a `secretRef` — a pointer at the OS keychain — and
 * `serializeConnectorState` throws rather than write a literal for one. The refusal is in the
 * serializer, not in the caller, because the caller is the thing that changes.
 *
 * A variable that is plainly not a credential (`NOTION_VERSION`, `Content-Type`) still carries its
 * value here. Forcing every value into the keychain would make somebody re-enter a version string
 * every time they moved machines, and a rule people route around stops protecting anything.
 *
 * ## A literal somebody wrote by hand
 *
 * If the file already holds a plaintext token — hand-edited, or copied from a config that had one —
 * `deserializeConnectorState` **does not carry the value into memory**. It marks the entry
 * `secretLiteral` and names it in `secretLiteralKeys`, so the screen can say which variable is
 * sitting in plain text and offer to move it into the keychain. The next save then writes the entry
 * without the literal, which is the direction this file should always move in.
 */

export const CONNECTOR_STORE_VERSION = 1;

/**
 * The transports an ACP `session/new` can actually carry (claude-agent-acp 0.74.0, codex-acp
 * 1.6.2). SSE is deprecated and neither adapter accepts it, so nothing here can be stored as SSE —
 * a stored connector is one Atlas is prepared to pass along.
 */
export const CONNECTOR_TRANSPORTS = ['stdio', 'http'] as const;
export type ConnectorTransport = (typeof CONNECTOR_TRANSPORTS)[number];

/**
 * One environment variable or HTTP header.
 *
 * **`secretRef` is the person's decision, not a guess about the name.** Whether a value lives in
 * this machine's keychain or in this file is a per-variable choice they make, and its presence
 * here *is* that choice: a reference means the keychain holds it, its absence means the value (if
 * any) is written beside the connector.
 *
 * ⚠️ **The name still decides one thing**, and only one: a credential-shaped name may never carry
 * a literal in the file, so `serializeConnectorState` refuses one whether or not somebody turned
 * the keychain off for it. The name is a **default suggestion** for the choice and a **hard floor**
 * on what may be written; it is not the whole answer, which is what it used to be
 * (measured 2026-09-05: `OPENAPI_MCP_HEADERS` - the variable Notion's own server documents, and
 * which carries `Bearer ntn_...` - matched nothing, so the screen offered no field at all and the
 * connector attached with its credential absent while looking perfectly healthy. `GH_PAT`,
 * `JIRA_PAT`, `CONFLUENCE_PAT`, `LINEAR_PAT` and `COOKIE` all missed the same way.)
 */
export interface ConnectorValueEntry {
  name: string;
  /** A literal. Refused at write time for a credential-shaped name. */
  value?: string;
  /** The keychain account holding the value. Present exactly when the keychain holds this one. */
  secretRef?: string;
  /**
   * Set on read when the file held a plaintext value for a credential-shaped name. The value is
   * **not** carried; this flag exists so the screen can say what happened.
   */
  secretLiteral?: boolean;
}

export interface ConnectorRecord {
  /** Stable across renames, so a keychain reference survives the person retitling the server. */
  id: string;
  /**
   * The name the agent will see. **Collisions are silent**: codex-acp drops an ACP-supplied server
   * whose name any config layer already holds, so the screen warns before this is saved.
   */
  name: string;
  transport: ConnectorTransport;
  /** stdio only. */
  command?: string;
  args: string[];
  /** http only. */
  url?: string;
  env: ConnectorValueEntry[];
  headers: ConnectorValueEntry[];
  /** Off until the person turns it on. Nothing is attached to a session by being written here. */
  enabled: boolean;
  /** Where it came from — a `DiscoverySource` id, or `custom`. Informational only. */
  origin?: string;
}

export interface ConnectorState {
  connectors: ConnectorRecord[];
}

/**
 * Names that must not carry a literal.
 *
 * Deliberately broad. Over-refusing costs somebody one extra step (store it in the keychain, which
 * is never the wrong place for it); under-refusing puts a live token in a file that syncs, backs
 * up, and gets pasted into an issue.
 */
const SECRET_KEY_PATTERN = /(token|secret|password|passwd|credential|api[-_]?key|authorization|bearer|\bkey\b|_key|key_|key$)/i;

export function looksLikeSecretKey(name: string): boolean {
  return SECRET_KEY_PATTERN.test(name.trim());
}

/** Problem codes a record can carry. The sentence for each lives in `messages/<locale>.json`. */
export type ConnectorProblem =
  | 'name-empty'
  | 'name-not-unique'
  | 'command-missing'
  | 'command-not-absolute'
  | 'url-missing'
  | 'url-not-http'
  | 'secret-literal'
  | 'value-missing';

/**
 * What is wrong with this record, in codes rather than sentences.
 *
 * `command-not-absolute` is the one that surprises people. The agent process Atlas launches runs
 * with a **sanitized environment that has no `PATH`** (`SHARED_RUNTIME_ENV` in
 * `src-tauri/src/acp.rs`), and a connector the agent spawns inherits that environment. So a bare
 * `npx` resolves to nothing and the session comes up with the connector's tools silently absent —
 * the worst failure this feature has, because it looks like success.
 */
export function connectorProblems(
  record: ConnectorRecord,
  siblings: readonly ConnectorRecord[] = [],
  /**
   * The keychain references this machine actually holds a value for.
   *
   * **Omitted means "not asked", not "none"** - and the difference matters, because reporting
   * every keychain-backed variable as missing on a surface that cannot see a keychain would call
   * a healthy connector broken. Pass the set only where it was really read.
   */
  storedRefs?: ReadonlySet<string>,
): ConnectorProblem[] {
  const problems: ConnectorProblem[] = [];
  const name = record.name.trim();
  if (!name) problems.push('name-empty');
  else if (
    siblings.some((other) => other.id !== record.id && other.name.trim() === name)
  ) {
    problems.push('name-not-unique');
  }
  if (record.transport === 'stdio') {
    const command = record.command?.trim() ?? '';
    if (!command) problems.push('command-missing');
    else if (!command.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(command)) {
      problems.push('command-not-absolute');
    }
  } else {
    const url = record.url?.trim() ?? '';
    if (!url) problems.push('url-missing');
    else if (!/^https?:\/\//i.test(url)) problems.push('url-not-http');
  }
  if ([...record.env, ...record.headers].some(entryHoldsSecretLiteral)) {
    problems.push('secret-literal');
  }
  /*
   * A variable the person put in the keychain, with nothing behind it. Left unsaid, the connector
   * attaches with its credential absent and every call it makes is refused by a service that has
   * no idea why - the failure this whole per-variable choice exists to prevent.
   */
  if (
    storedRefs
    && [...record.env, ...record.headers].some(
      (entry) => typeof entry.secretRef === 'string' && !storedRefs.has(entry.secretRef),
    )
  ) {
    problems.push('value-missing');
  }
  return problems;
}

function entryHoldsSecretLiteral(entry: ConnectorValueEntry): boolean {
  if (entry.secretLiteral) return true;
  return typeof entry.value === 'string' && looksLikeSecretKey(entry.name);
}

/** Thrown instead of writing a credential into the vault folder. */
export class ConnectorSecretLiteralError extends Error {
  constructor(readonly keys: string[]) {
    super(`connector-secret-literal:${keys.join(',')}`);
    this.name = 'ConnectorSecretLiteralError';
  }
}

/**
 * Write the file. **Throws** rather than put a credential-shaped literal on disk.
 *
 * The throw is not defensive programming: this is the only function that turns records into bytes,
 * so it is the last place a token can be stopped, and every caller reaches it.
 */
export function serializeConnectorState(state: ConnectorState): string {
  const offenders = state.connectors.flatMap((connector) =>
    [...connector.env, ...connector.headers]
      .filter((entry) => typeof entry.value === 'string' && looksLikeSecretKey(entry.name))
      .map((entry) => `${connector.name}.${entry.name}`),
  );
  if (offenders.length > 0) throw new ConnectorSecretLiteralError(offenders);
  return `${JSON.stringify(
    {
      version: CONNECTOR_STORE_VERSION,
      connectors: state.connectors.map((connector) => ({
        id: connector.id,
        name: connector.name,
        transport: connector.transport,
        ...(connector.command === undefined ? {} : { command: connector.command }),
        args: connector.args,
        ...(connector.url === undefined ? {} : { url: connector.url }),
        env: connector.env.map(serializeEntry),
        headers: connector.headers.map(serializeEntry),
        enabled: connector.enabled,
        ...(connector.origin === undefined ? {} : { origin: connector.origin }),
      })),
    },
    null,
    2,
  )}\n`;
}

/** A `secretLiteral` entry is written **without** the literal — a save cleans the file. */
function serializeEntry(entry: ConnectorValueEntry) {
  return {
    name: entry.name,
    ...(entry.secretRef === undefined ? {} : { secretRef: entry.secretRef }),
    ...(entry.value === undefined || entry.secretLiteral ? {} : { value: entry.value }),
  };
}

export interface ConnectorParseResult {
  connectors: ConnectorRecord[];
  /** True when the text is not this file at all — the caller must not overwrite it blindly. */
  malformed: boolean;
  /** `<connector>.<variable>` for every plaintext credential found. The value is not carried. */
  secretLiteralKeys: string[];
}

export function deserializeConnectorState(text: string): ConnectorParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { connectors: [], malformed: true, secretLiteralKeys: [] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { connectors: [], malformed: true, secretLiteralKeys: [] };
  }
  const root = parsed as Record<string, unknown>;
  if (root.version !== CONNECTOR_STORE_VERSION || !Array.isArray(root.connectors)) {
    return { connectors: [], malformed: true, secretLiteralKeys: [] };
  }
  const secretLiteralKeys: string[] = [];
  const connectors: ConnectorRecord[] = [];
  for (const raw of root.connectors) {
    const record = readRecord(raw, secretLiteralKeys);
    if (record) connectors.push(record);
  }
  return { connectors, malformed: false, secretLiteralKeys };
}

function readRecord(raw: unknown, secretLiteralKeys: string[]): ConnectorRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const node = raw as Record<string, unknown>;
  const id = typeof node.id === 'string' ? node.id : '';
  const name = typeof node.name === 'string' ? node.name : '';
  const transport = node.transport;
  if (!id || !name) return null;
  if (transport !== 'stdio' && transport !== 'http') return null;
  const env = readEntries(node.env, name, secretLiteralKeys);
  const headers = readEntries(node.headers, name, secretLiteralKeys);
  return {
    id,
    name,
    transport,
    ...(typeof node.command === 'string' ? { command: node.command } : {}),
    args: Array.isArray(node.args) ? node.args.filter((a): a is string => typeof a === 'string') : [],
    ...(typeof node.url === 'string' ? { url: node.url } : {}),
    env,
    headers,
    // Absent means off. A connector that turns itself on because a field went missing is the
    // one behaviour a default-off promise cannot survive.
    enabled: node.enabled === true,
    ...(typeof node.origin === 'string' ? { origin: node.origin } : {}),
  };
}

function readEntries(
  raw: unknown,
  connectorName: string,
  secretLiteralKeys: string[],
): ConnectorValueEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: ConnectorValueEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const node = item as Record<string, unknown>;
    const name = typeof node.name === 'string' ? node.name.trim() : '';
    if (!name) continue;
    const secretRef = typeof node.secretRef === 'string' ? node.secretRef : undefined;
    const value = typeof node.value === 'string' ? node.value : undefined;
    if (value !== undefined && looksLikeSecretKey(name)) {
      // The value stops here. It is not carried into memory, not returned, not logged — the
      // screen is told which variable it was, and that is all it needs to offer the keychain.
      secretLiteralKeys.push(`${connectorName}.${name}`);
      entries.push({ name, secretLiteral: true, ...(secretRef ? { secretRef } : {}) });
      continue;
    }
    entries.push({
      name,
      ...(secretRef === undefined ? {} : { secretRef }),
      ...(value === undefined ? {} : { value }),
    });
  }
  return entries;
}
