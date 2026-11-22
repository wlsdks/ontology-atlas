/** Turns enabled connectors into `session/new` `mcpServers` entries; Atlas runs none, the agent does. Only runtimes known to ask (`runtimeCarriesConnectors`) carry them; `atlas-vault` is a refused name. */
import {
  connectorProblems,
  ownsSecretRef,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from '@/shared/lib/connectors/connector-record';
import { ACP_SECRET_REF_KEY } from '@/shared/lib/connectors/tauri-connector-secrets';

import { runtimeCarriesConnectors } from './runtime-gate';
import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';

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
    // A `secretLiteral` entry carries no value by design (the plaintext token was dropped on read). Sent as "" it would be a
    // different failure from an absent variable, and the absent one is honest.
    if (typeof entry.value === 'string') out.push({ name: entry.name, value: entry.value });
  }
  return out;
}

/** In stored order. A record with a problem is left out: a bare command or empty URL makes a session whose tools are silently missing, which reads like Atlas failing. */
export function connectorAcpServers(
  connectors: readonly ConnectorRecord[],
  /** Omitted or unmeasured attaches nothing rather than attaching blind (`runtimeCarriesConnectors`). */
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

function attachable(
  connectors: readonly ConnectorRecord[],
  allowedHere: ConnectorAllowedHere,
): ConnectorRecord[] {
  const seen = new Set<string>([VAULT_MCP_SERVER_NAME]);
  const out: ConnectorRecord[] = [];
  for (const connector of connectors) {
    if (!connector.enabled || !allowedHere(connector)) continue;
    const name = connector.name.trim();
    // The vault server's name is taken; a connector under it would replace the person's own map. Two connectors sharing a
    // name are both refused by `connectorProblems`: picking one would be picking for the person.
    if (seen.has(name)) continue;
    if (connectorProblems(connector, connectors).length > 0) continue;
    seen.add(name);
    out.push(connector);
  }
  return out;
}

/** A switched-on connector that is absent is the failure to avoid: the person believes the agent can reach Notion and nothing says why. */
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

/** Checked before a session opens: a refusal at the moment somebody asks a question is worse. The presence check lives in the bridge. */
export function connectorSecretRefs(
  connectors: readonly ConnectorRecord[],
  allowedHere: ConnectorAllowedHere,
): string[] {
  return attachable(connectors, allowedHere)
    .flatMap((connector) => [...connector.env, ...connector.headers])
    .map((entry) => entry.secretRef)
    .filter((reference): reference is string => typeof reference === 'string');
}
