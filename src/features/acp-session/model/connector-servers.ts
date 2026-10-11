/**
 * Turns enabled connectors into `session/new` `mcpServers` entries; Atlas runs none, the
 * agent does. Only runtimes known to ask (`runtimeCarriesConnectors`) carry them;
 * `atlas-vault` is a refused name.
 */
import {
  connectorProblems,
  ownsSecretRef,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from '@/shared/lib/connectors/connector-record';
import { ACP_SECRET_REF_KEY } from '@/shared/lib/connectors/tauri-connector-secrets';

import { runtimeCarriesConnectors } from './runtime-gate';
import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';

/** A value the agent is given directly, or the reference Rust resolves on the way out. */
type AcpValueEntry =
  | { name: string; value: string }
  | { name: string; [ACP_SECRET_REF_KEY]: string };

interface AcpConnectorStdioServer {
  name: string;
  command: string;
  args: string[];
  env: AcpValueEntry[];
}

interface AcpConnectorHttpServer {
  /** codex-acp 1.6.2 and claude-agent-acp 0.74.0 both key the HTTP variant off this field. */
  type: 'http';
  name: string;
  url: string;
  headers: AcpValueEntry[];
}

type AcpConnectorServer = AcpConnectorStdioServer | AcpConnectorHttpServer;

type ConnectorAllowedHere = (connector: ConnectorRecord) => boolean;

function toAcpEntries(connectorId: string, entries: readonly ConnectorValueEntry[]): AcpValueEntry[] {
  const out: AcpValueEntry[] = [];
  for (const entry of entries) {
    if (entry.secretRef) {
      if (ownsSecretRef(connectorId, entry)) {
        out.push({ name: entry.name, [ACP_SECRET_REF_KEY]: entry.secretRef });
      }
      continue;
    }
    // A `secretLiteral` entry carries no value by design — the file held a plaintext token and
    // the value was dropped on read. It is not sent as an empty string, because a variable set
    // to "" and a variable that is absent are different failures, and the absent one is honest.
    if (typeof entry.value === 'string') out.push({ name: entry.name, value: entry.value });
  }
  return out;
}

/**
 * The connectors that are ready to be attached, in the order the person stored them.
 *
 * A record with a problem is left out rather than sent: a connector with a bare command or an
 * empty URL produces a session whose tools are silently missing, which reads exactly like Atlas
 * failing. `connectorsWithProblems` returns the same records the other way round so the screen can
 * say which ones did not go and why.
 */
export function connectorAcpServers(
  connectors: readonly ConnectorRecord[],
  /**
   * The runtime this session will run on. **Anything unmeasured gets none of them** - see
   * `runtimeCarriesConnectors`. Omitting it is the same as naming an unmeasured runtime, so a
   * call site that forgets to pass one attaches nothing rather than attaching blind.
   */
  runtimeId: string | null | undefined,
  allowedHere: ConnectorAllowedHere,
): AcpConnectorServer[] {
  if (!runtimeCarriesConnectors(runtimeId)) return [];
  return attachable(connectors, allowedHere).map((connector) =>
    connector.transport === 'http'
      ? {
          type: 'http' as const,
          name: connector.name.trim(),
          url: (connector.url ?? '').trim(),
          headers: toAcpEntries(connector.id, connector.headers),
        }
      : {
          name: connector.name.trim(),
          command: (connector.command ?? '').trim(),
          args: [...connector.args],
          env: toAcpEntries(connector.id, connector.env),
        },
  );
}

/** The enabled connectors that are actually sendable. */
function attachable(
  connectors: readonly ConnectorRecord[],
  allowedHere: ConnectorAllowedHere,
): ConnectorRecord[] {
  const seen = new Set<string>([VAULT_MCP_SERVER_NAME]);
  const out: ConnectorRecord[] = [];
  for (const connector of connectors) {
    if (!connector.enabled || !allowedHere(connector)) continue;
    const name = connector.name.trim();
    // The vault server's name is already taken; a connector under it would replace the person's
    // own map. Two connectors sharing a name are both refused instead, by `connectorProblems`'
    // uniqueness check — picking one would be picking for the person, and the agent's tool list
    // would hold the name once with nothing saying the other exists.
    if (seen.has(name)) continue;
    if (connectorProblems(connector, connectors).length > 0) continue;
    seen.add(name);
    out.push(connector);
  }
  return out;
}

/**
 * The enabled connectors that were **not** attached, with the reason.
 *
 * A connector that is switched on and absent is the failure this feature has to avoid stating
 * badly: the person believes the agent can reach Notion, the agent has no such tool, and nothing
 * anywhere says why.
 */
export function connectorsWithProblems(
  connectors: readonly ConnectorRecord[],
  allowedHere: ConnectorAllowedHere,
): Array<{ connector: ConnectorRecord; reason: 'not-allowed-here' | 'name-taken' | 'invalid' }> {
  const attached = new Set(attachable(connectors, allowedHere).map((connector) => connector.id));
  return connectors
    .filter((connector) => connector.enabled && !attached.has(connector.id))
    .map((connector) => ({
      connector,
      reason: !allowedHere(connector)
        ? ('not-allowed-here' as const)
        : connectorProblems(connector, connectors).length > 0
          ? ('invalid' as const)
          : ('name-taken' as const),
    }));
}

/**
 * Enabled connectors whose token is not in this machine's keychain yet.
 *
 * Checked before a session opens, because the alternative is a refusal at the moment somebody was
 * about to ask a question. The presence check itself lives in the bridge; this only says which
 * references to ask about.
 */
export function connectorSecretRefs(
  connectors: readonly ConnectorRecord[],
  allowedHere: ConnectorAllowedHere,
): string[] {
  return attachable(connectors, allowedHere)
    .flatMap((connector) => [...connector.env, ...connector.headers])
    .map((entry) => entry.secretRef)
    .filter((reference): reference is string => typeof reference === 'string');
}
