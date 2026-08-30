/**
 * **How an agent launches the MCP server** — this repo's distribution contract.
 *
 * Before 2026-07-27 an npm-publishing gate stood here
 * (`agent-package-distribution.ts`). It locked every piece of guidance behind the
 * premise that "once this is on npm, `npx -y ontology-atlas-mcp` becomes true", and
 * the decision not to publish removed that premise. A gate that waits for something
 * that will never arrive is a permanently closed door, and the guidance behind it is
 * a false promise.
 *
 * There is one distribution channel today: **the app carries the server.** The macOS
 * app ships the compiled MCP binary inside its own bundle, and the connect-agent
 * button writes the client config with that absolute path. The contract survives
 * quitting the app — the binary is on disk and the agent client spawns it per
 * session.
 *
 * Environments with no app (web browser, Linux CI, a server) fall back to a **source
 * checkout**. Those two are all of it; there is no third.
 */

type McpServerLaunchKind = "app-bundled" | "source-checkout";

/**
 * The launch contract, written verbatim into the client config.
 * `command` + `args` is the standard shape for stdio MCP.
 */
export interface McpServerLaunch {
  kind: McpServerLaunchKind;
  /** The executable: the binary's absolute path when bundled, `node` from source. */
  command: string;
  args: readonly string[];
}

export interface McpServerLaunchInspection {
  valid: boolean;
  kind: McpServerLaunchKind | null;
  reason: 'ready' | 'unsupported-command' | 'invalid-args';
}

function isAbsoluteLaunchPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function normalizedLaunchPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

/**
 * Judges whether the config matches one of the two stdio launch shapes Atlas
 * actually distributes — not whether the product name appears somewhere in its
 * strings. File existence and a real startup belong to the stronger `mcp-verify`
 * step: a browser cannot stat an absolute path outside the vault.
 */
export function inspectMcpServerLaunch(
  command: unknown,
  args: unknown,
): McpServerLaunchInspection {
  if (typeof command !== 'string' || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    return { valid: false, kind: null, reason: 'invalid-args' };
  }

  const stringArgs = args as string[];
  if (
    command === 'node' &&
    stringArgs.length === 1 &&
    isAbsoluteLaunchPath(stringArgs[0]) &&
    normalizedLaunchPath(stringArgs[0]).endsWith('/mcp/src/index.js')
  ) {
    return { valid: true, kind: 'source-checkout', reason: 'ready' };
  }

  const normalizedCommand = normalizedLaunchPath(command);
  if (
    stringArgs.length === 0 &&
    isAbsoluteLaunchPath(command) &&
    /\/ontology-atlas-mcp(?:\.exe)?$/.test(normalizedCommand)
  ) {
    return { valid: true, kind: 'app-bundled', reason: 'ready' };
  }

  return {
    valid: false,
    kind: null,
    reason: stringArgs.length === 0 && command === 'node' ? 'invalid-args' : 'unsupported-command',
  };
}

/** The name this server carries in an MCP client's config. */
export const MCP_SERVER_NAME = "ontology-atlas";

/**
 * Launching from the binary inside the app bundle — the user installs nothing.
 * The native side (`mcp_bundled_server`) reports the path.
 */
export function bundledServerLaunch(binaryPath: string): McpServerLaunch {
  return { kind: "app-bundled", command: binaryPath, args: [] };
}

/**
 * Launching from a source checkout — the fallback where no app exists.
 * `repoRoot` is the absolute path of the ontology-atlas repository root.
 */
export function sourceCheckoutLaunch(repoRoot: string): McpServerLaunch {
  return { kind: "source-checkout", command: "node", args: [`${repoRoot}/mcp/src/index.js`] };
}

/**
 * Whether an agent can be connected from this surface — the whole UI branches on it.
 *
 * Replaces the old `AgentPackageDistribution`, which asked "is this on npm?" and
 * would have answered no forever. This model asks **"do we know how to launch the
 * server from here?"** — the installed app does (its bundled binary), a browser does
 * not (it has no absolute path).
 */
export interface AgentServerAvailability {
  kind: McpServerLaunchKind | "unavailable";
  /** How to launch. `null` means no runnable config can be produced, so degrade honestly. */
  launch: McpServerLaunch | null;
  /** Absolute path of the bundled binary when there is one; shown to the user verbatim. */
  binaryPath: string | null;
  /** Why not. This becomes a sentence the user reads, so it must carry a diagnosis. */
  reason: string | null;
}

/** No known way to launch — the default for a web session. */
export function agentServerUnavailable(reason: string | null = null): AgentServerAvailability {
  return { kind: "unavailable", launch: null, binaryPath: null, reason };
}

/** The bundled binary was found, so one-click connect holds. */
export function agentServerFromBundle(binaryPath: string): AgentServerAvailability {
  return {
    kind: "app-bundled",
    launch: bundledServerLaunch(binaryPath),
    binaryPath,
    reason: null,
  };
}
