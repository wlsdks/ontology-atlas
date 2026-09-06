/**
 * `ontology-atlas://mcp/install?name=…&config=<base64 json>` — **an invitation, never an install.**
 *
 * ## The shape, and why it is somebody else's
 *
 * Cursor and VS Code already put "Add to …" buttons on vendor pages, and their
 * link is one query parameter holding a base64 (Cursor) or url-encoded
 * (VS Code) JSON server config. Inventing a third shape would mean every vendor
 * has to learn ours; taking Cursor's means a page that already renders one
 * button can render this one from the same object.
 *
 * ## What the CVEs taught, encoded here
 *
 * This is the exact surface that produced CVE-2025-54133 and its "DeepJack"
 * follow-up: Cursor's confirmation dialog did not show the real arguments, so a
 * malicious command could hide behind a friendly name, and a nested
 * `mcp/install` URI slipped through because the decoder did not recurse
 * (`docs/benchmark/MCP-ONE-CLICK-2026-09-07.md` §3). CVE-2025-54136 was the same
 * lesson from the other side: Cursor trusted the config *key name* instead of the
 * command.
 *
 * So four rules hold here, and each one is a test:
 *
 * 1. **The parser produces a draft, not a connector.** Nothing is written, and
 *    `enabled` is `false`. The person still presses Add in a dialog that shows
 *    the decoded command and every argument, verbatim and untruncated.
 * 2. **Unknown keys are refused, not ignored.** A payload carrying a field this
 *    build does not understand is a payload doing something this build cannot
 *    show, and a confirmation that cannot show everything is the DeepJack shape.
 * 3. **No value crosses.** `env` and `headers` contribute **names only**. A link
 *    that carried a value has that value dropped before the record exists, and
 *    the names it tried to set are reported so the screen can say so out loud.
 * 4. **One level of decoding, no recursion.** The payload is parsed once as
 *    JSON. Nothing here re-parses a string field as a URL or a nested config.
 *
 * ## Where a link comes from today
 *
 * The custom scheme is not registered with macOS in this change — that needs a
 * Tauri deep-link plugin, which is a dependency this change may not add. What
 * ships is the parser and the pre-fill, reachable through `?install=` on the
 * `/mcp` address, so the shape is proven and testable before anything outside
 * the app can call it. Registration is the named follow-up.
 */
import {
  looksLikeSecretKey,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from './connector-record';

/** The keys a payload may carry. Anything else refuses the whole link — rule 2. */
const ALLOWED_KEYS = new Set([
  'name',
  'type',
  'transport',
  'command',
  'args',
  'url',
  'env',
  'headers',
]);

export type McpInstallLinkProblem =
  | 'not-an-install-link'
  | 'config-missing'
  | 'config-unreadable'
  | 'unknown-field'
  | 'name-missing'
  | 'command-missing'
  | 'url-missing'
  | 'url-not-http';

export interface McpInstallLinkResult {
  ok: boolean;
  /** The draft to pre-fill, present only when `ok`. Always `enabled: false`. */
  draft?: ConnectorRecord;
  /** Variable names the link tried to hand a value for. The values are gone; the names are shown. */
  droppedValues: string[];
  /** Why the link was refused, or the field that refused it. */
  problem?: McpInstallLinkProblem;
  /** The offending key, for `unknown-field`. Shown so a person can read what was refused. */
  offendingKey?: string;
}

const REFUSED = (problem: McpInstallLinkProblem, offendingKey?: string): McpInstallLinkResult => ({
  ok: false,
  droppedValues: [],
  problem,
  ...(offendingKey === undefined ? {} : { offendingKey }),
});

/**
 * The `config` parameter → its JSON object.
 *
 * Accepts standard base64 and the url-safe alphabet, because a link travels through address bars
 * and chat clients that rewrite `+` and `/`. Padding is optional for the same reason. A payload
 * that is not base64 at all is tried as plain JSON, which is what a hand-written test link and
 * VS Code's url-encoded shape both look like after the query parser has run.
 */
export function decodeInstallConfig(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const attempts: string[] = [];
  const normalised = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  try {
    attempts.push(
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(padded)
              .split('')
              .map((character) => `%${`00${character.charCodeAt(0).toString(16)}`.slice(-2)}`)
              .join(''),
          )
        : Buffer.from(padded, 'base64').toString('utf8'),
    );
  } catch {
    /* Not base64. The plain-JSON attempt below is the other legitimate shape. */
  }
  attempts.push(trimmed);
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Variable names out of an `env`/`headers` block, with every value discarded.
 *
 * Both shapes are accepted because both are in the wild: Cursor writes an object of
 * name → value, the ACP handshake and this repository's own record write an array of entries.
 * Either way only the name survives, and a name that reads like a credential is pointed at the
 * keychain rather than at a box in the folder's file.
 */
export function linkVariableNames(raw: unknown): { names: string[]; hadValues: string[] } {
  const names: string[] = [];
  const hadValues: string[] = [];
  const note = (name: string, value: unknown) => {
    const trimmed = name.trim();
    if (!trimmed || names.includes(trimmed)) return;
    names.push(trimmed);
    if (typeof value === 'string' && value.trim()) hadValues.push(trimmed);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
        note((item as { name: string }).name, (item as { value?: unknown }).value);
      }
    }
    return { names, hadValues };
  }
  if (raw && typeof raw === 'object') {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) note(name, value);
  }
  return { names, hadValues };
}

/**
 * One install link → a draft, or a reason it was refused.
 *
 * `secretRef` is passed in rather than imported so this stays testable without a keychain and so
 * the id it mints is the caller's — the record's id has to be the one the connector is saved
 * under, or the keychain reference points at nothing.
 */
export function parseMcpInstallLink(
  input: string,
  options: { id: string; secretRef: (id: string, name: string) => string },
): McpInstallLinkResult {
  let params: URLSearchParams;
  if (input.includes('?')) {
    const query = input.slice(input.indexOf('?') + 1);
    // The scheme and path are checked only when they are present. A bare `?name=…&config=…`
    // is what reaches this from `/mcp?install=`, and refusing it would refuse the only caller
    // that exists before the scheme is registered.
    const looksLikeScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
    if (looksLikeScheme && !/^ontology-atlas:(\/\/)?mcp\/install\b/i.test(input)) {
      return REFUSED('not-an-install-link');
    }
    params = new URLSearchParams(query);
  } else {
    params = new URLSearchParams(input);
  }

  const configRaw = params.get('config');
  if (!configRaw) return REFUSED('config-missing');
  const config = decodeInstallConfig(configRaw);
  if (!config) return REFUSED('config-unreadable');

  const node = config as Record<string, unknown>;
  for (const key of Object.keys(node)) {
    if (!ALLOWED_KEYS.has(key)) return REFUSED('unknown-field', key);
  }

  const name = (
    typeof node.name === 'string' && node.name.trim() ? node.name : (params.get('name') ?? '')
  ).trim();
  if (!name) return REFUSED('name-missing');

  const declared = typeof node.type === 'string' ? node.type : (node.transport as string | undefined);
  const url = typeof node.url === 'string' ? node.url.trim() : '';
  const isRemote = url.length > 0 || declared === 'http' || declared === 'streamable-http' || declared === 'sse';

  const droppedValues: string[] = [];
  const toEntries = (raw: unknown): ConnectorValueEntry[] => {
    const { names, hadValues } = linkVariableNames(raw);
    droppedValues.push(...hadValues);
    return names.map((variable) =>
      looksLikeSecretKey(variable)
        ? { name: variable, secretRef: options.secretRef(options.id, variable) }
        : { name: variable },
    );
  };

  if (isRemote) {
    if (!url) return REFUSED('url-missing');
    if (!/^https?:\/\//i.test(url)) return REFUSED('url-not-http');
    const headers = toEntries(node.headers);
    return {
      ok: true,
      droppedValues,
      draft: {
        id: options.id,
        name,
        transport: 'http',
        args: [],
        url,
        env: [],
        headers,
        enabled: false,
        origin: 'install-link',
      },
    };
  }

  const command = typeof node.command === 'string' ? node.command.trim() : '';
  if (!command) return REFUSED('command-missing');
  const args = Array.isArray(node.args)
    ? node.args.filter((argument): argument is string => typeof argument === 'string')
    : [];
  const env = toEntries(node.env);
  return {
    ok: true,
    droppedValues,
    draft: {
      id: options.id,
      name,
      transport: 'stdio',
      command,
      args,
      env,
      headers: [],
      enabled: false,
      origin: 'install-link',
    },
  };
}

/**
 * The link a page would publish for a connector. Used by the tests to prove the round trip, and
 * available for a "copy an Add-to-Atlas link" affordance if one is ever asked for.
 */
export function buildMcpInstallLink(connector: ConnectorRecord): string {
  const config =
    connector.transport === 'http'
      ? { name: connector.name, type: 'http', url: connector.url ?? '' }
      : {
          name: connector.name,
          type: 'stdio',
          command: connector.command ?? '',
          args: connector.args,
        };
  const json = JSON.stringify(config);
  const base64 =
    typeof btoa === 'function'
      ? btoa(String.fromCharCode(...new TextEncoder().encode(json)))
      : Buffer.from(json, 'utf8').toString('base64');
  return `ontology-atlas://mcp/install?name=${encodeURIComponent(connector.name)}&config=${encodeURIComponent(base64)}`;
}
