/**
 * Turning the connectors a person switched on into `session/new`'s `mcpServers` entries.
 *
 * **Atlas does not run any of them.** The descriptor goes into the ACP handshake and the coding
 * agent — claude-agent-acp, codex-acp — spawns the process or opens the connection on its own side.
 * That is the whole reason this is allowed to exist under
 * `.claude/rules/forbidden.md`'s "Atlas will never execute third-party plugin code": the extension
 * mechanism is MCP running inside a program the person already chose to trust, and Atlas only says
 * which ones.
 *
 * ## Only a runtime whose permission path was measured
 *
 * A connector's tools have to reach a person as a `session/request_permission` before they run,
 * and only Claude's isolated configuration has been measured to do that for an MCP child. Codex
 * was measured not to for our own server (installed app, 2026-08-24: a self-registered
 * `add_relation` changed the vault with no request and no card), and nobody has measured what it
 * does with somebody else's. `runtimeCarriesConnectors` holds that line, reusing the table
 * `runtime-gate.ts` already keeps rather than starting a second one.
 *
 * ## The vault server goes first, and cannot be shadowed
 *
 * claude-agent-acp lets an ACP-supplied server override a same-named one from the caller, so a
 * connector called `atlas-vault` would quietly replace the person's own map with somebody else's
 * server. That name is refused here rather than sorted around.
 *
 * ## A token is a reference until it is out of this process
 *
 * `env` and `headers` carry `__atlasSecretRef` where a value belongs. Rust swaps each one for the
 * real value inside `acp_send` (`src-tauri/src/connector_secrets.rs`), so the token never exists in
 * the WebView. `connectorSecretRefs` names the references a session is about to need, so the screen
 * can check they exist **before** it opens rather than meeting a refusal at the moment somebody was
 * about to ask a question.
 */
import type { ConnectorRecord, ConnectorValueEntry } from '@/shared/lib/connector-record';
import { connectorProblems } from '@/shared/lib/connector-record';
import { ACP_SECRET_REF_KEY } from '@/shared/lib/tauri-connector-secrets';

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

function toAcpEntries(entries: readonly ConnectorValueEntry[]): AcpValueEntry[] {
  const out: AcpValueEntry[] = [];
  for (const entry of entries) {
    if (entry.secretRef) {
      out.push({ name: entry.name, [ACP_SECRET_REF_KEY]: entry.secretRef });
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
  runtimeId?: string | null,
): AcpConnectorServer[] {
  if (!runtimeCarriesConnectors(runtimeId)) return [];
  return attachable(connectors).map((connector) =>
    connector.transport === 'http'
      ? {
          type: 'http' as const,
          name: connector.name.trim(),
          url: (connector.url ?? '').trim(),
          headers: toAcpEntries(connector.headers),
        }
      : {
          name: connector.name.trim(),
          command: (connector.command ?? '').trim(),
          args: [...connector.args],
          env: toAcpEntries(connector.env),
        },
  );
}

/** The enabled connectors that are actually sendable. */
function attachable(connectors: readonly ConnectorRecord[]): ConnectorRecord[] {
  const seen = new Set<string>([VAULT_MCP_SERVER_NAME]);
  const out: ConnectorRecord[] = [];
  for (const connector of connectors) {
    if (!connector.enabled) continue;
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
): Array<{ connector: ConnectorRecord; reason: 'name-taken' | 'invalid' }> {
  const attached = new Set(attachable(connectors).map((connector) => connector.id));
  return connectors
    .filter((connector) => connector.enabled && !attached.has(connector.id))
    .map((connector) => ({
      connector,
      reason:
        connectorProblems(connector, connectors).length > 0
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
export function connectorSecretRefs(connectors: readonly ConnectorRecord[]): string[] {
  return attachable(connectors)
    .flatMap((connector) => [...connector.env, ...connector.headers])
    .map((entry) => entry.secretRef)
    .filter((reference): reference is string => typeof reference === 'string');
}
