/**
 * How an agent launches the MCP server. There are two channels and no third: the macOS app
 * ships the compiled binary in its bundle and the connect button writes its absolute path into
 * the client config (it survives quitting the app), and environments without the app use a
 * source checkout. There is no npm package.
 */

type McpServerLaunchKind = "app-bundled" | "source-checkout";

/** The launch contract, written verbatim into the client config as stdio `command` + `args`. */
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
 * Judges whether the config matches one of the two stdio launch shapes Atlas distributes, not
 * whether the product name appears in it. File existence and a real startup belong to
 * the `mcp-verify` step: a browser cannot stat a path outside the vault.
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

/** Launching from the binary inside the app bundle; `mcp_bundled_server` reports the path. */
export function bundledServerLaunch(binaryPath: string): McpServerLaunch {
  return { kind: "app-bundled", command: binaryPath, args: [] };
}

/** Launching from a source checkout where no app exists; `repoRoot` is absolute. */
export function sourceCheckoutLaunch(repoRoot: string): McpServerLaunch {
  return { kind: "source-checkout", command: "node", args: [`${repoRoot}/mcp/src/index.js`] };
}

/**
 * Whether this surface knows how to launch the server; the whole UI branches on it. The
 * installed app does (its bundled binary); a browser does not (it has no absolute path).
 */
export interface AgentServerAvailability {
  kind: McpServerLaunchKind | "unavailable";
  /** How to launch. `null` means no runnable config can be produced, so degrade honestly. */
  launch: McpServerLaunch | null;
  /** Absolute path of the bundled binary when there is one; shown to the user verbatim. */
  binaryPath: string | null;
  /** Why not. This becomes a sentence the user reads, so it must carry a diagnosis. */
  reason: string | null;
  /**
   * The probe has not answered yet, as distinct from answering "no". Without it the installed
   * app shows the browser's degradation card until the lookup returns; while it is set, callers draw nothing.
   */
  pending?: boolean;
}

/** No known way to launch — the answered state for a web session. */
export function agentServerUnavailable(reason: string | null = null): AgentServerAvailability {
  return { kind: "unavailable", launch: null, binaryPath: null, reason };
}

/** Nothing is known yet: the lookup is in flight. Callers draw neither claim. */
export function agentServerPending(): AgentServerAvailability {
  return { kind: "unavailable", launch: null, binaryPath: null, reason: null, pending: true };
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
