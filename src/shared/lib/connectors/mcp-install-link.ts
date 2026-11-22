/**
 * An invitation, never an install: the parser yields a draft, writes nothing, and sets `enabled` to
 * `false`. Unknown keys are refused, `env` and `headers` give names only, and decoding is one level
 * with no recursion.
 */
import {
  looksLikeSecretKey,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from './connector-record';

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
  draft?: ConnectorRecord;
  /** Variable names the link tried to hand a value for. The values are gone; the names are shown. */
  droppedValues: string[];
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
 * Both base64 alphabets, padding optional, since address bars and chat clients rewrite `+` and
 * `/`. Anything else is tried as plain JSON, the shape of a hand-written or VS Code link.
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
 * Every value is discarded. Cursor writes a name → value object, the ACP handshake an array of
 * entries; a credential-shaped name is pointed at the keychain.
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
 * `secretRef` is injected so tests need no keychain and the minted reference uses the id the
 * connector is saved under.
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
 * The address the installed app is registered for. The parameter is the route's `install`; the
 * caller translates it to the `config` that `parseMcpInstallLink` reads.
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
  return `ontology-atlas://mcp?install=${encodeURIComponent(base64)}`;
}
