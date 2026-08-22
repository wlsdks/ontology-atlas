/**
 * **The path to attaching an agent from the web** — the person supplies the paths and the config is
 * built on the spot.
 *
 * **What was wrong.** The web's degraded card said "you **cannot connect** from this screen". That
 * is false. MCP does not attach to Atlas, it **attaches to the folder** — the agent spawns the
 * server in its own session, and that server reads and writes the vault on disk. Atlas is just
 * another reader of the same folder. So a web user can connect.
 *
 * The one thing a browser cannot do is **write the config for you**. The File System Access API
 * gives a handle, not a path. That is not "cannot connect" but **"cannot configure automatically"**,
 * and a degraded card must not understate what is possible (the "why plus where" contract in
 * `.claude/rules/surfaces.md`).
 *
 * **The browser does not know the path, but the person does** — so we ask. Two absolute paths from
 * the user (the vault folder and the Atlas source checkout) produce a runnable config. Those values
 * never leave the screen: nothing transmitted, nothing stored. Everything here is a **pure function**.
 *
 * **Validation checks shape only.** A browser cannot confirm the folder exists, so it never claims
 * to have. Caught: empty values, quotes, relative paths, a home tilde (`~`), multiple lines. Not
 * caught: a typo'd path that does not exist, permissions, a folder that is not a vault.
 */

import { sourceCheckoutLaunch, type McpServerLaunch } from '@/shared/config';

import { type AgentClientId, filesForClient } from './agent-clients';
import { buildCodexConfigTomlTemplate, buildMcpConfigJson } from './ontology-starter';

/** What the shape check catches. `null` means the shape passed. */
export type ManualPathIssue = 'empty' | 'relative' | 'tilde' | 'multiline';

export interface ManualPathResult {
  /** Whether the shape is an absolute path. **Not whether it exists.** */
  ok: boolean;
  /** The normalized value, after stripping quotes, escapes, and a trailing slash. */
  value: string;
  issue: ManualPathIssue | null;
}

/** Strips the shapes a paste actually arrives in. */
function unwrap(raw: string): string {
  let value = raw.trim();

  // One layer of quotes — terminals and Finder copies commonly add them.
  const quotes = ["'", '"', '`'];
  for (const quote of quotes) {
    if (value.length >= 2 && value.startsWith(quote) && value.endsWith(quote)) {
      value = value.slice(1, -1).trim();
      break;
    }
  }

  // Dragging from Finder or Chrome yields `file:///Users/...`.
  if (value.startsWith('file://')) {
    const stripped = value.slice('file://'.length);
    try {
      value = decodeURI(stripped);
    } catch {
      value = stripped;
    }
  }

  // Space escapes from a terminal drag (`/Users/me/my\ notes`).
  value = value.replace(/\\ /g, ' ');

  // Trailing slashes, stripped down to the root (`/`) — so a config value cannot take two shapes.
  while (value.length > 1 && (value.endsWith('/') || value.endsWith('\\'))) {
    value = value.slice(0, -1);
  }

  return value;
}

/**
 * Normalizes a pasted path and judges **its shape only**.
 *
 * A Windows drive path (`C:\Users\…`) is accepted as absolute — the web's second job is precisely
 * "an OS with no app" (Windows and Chromium on Linux).
 */
export function normalizeManualPath(raw: string): ManualPathResult {
  const value = unwrap(raw ?? '');
  if (value.length === 0) return { ok: false, value: '', issue: 'empty' };
  if (/[\r\n]/.test(value)) return { ok: false, value, issue: 'multiline' };
  // `~` is expanded by a shell and **is not expanded inside a config file**. Left as-is, a config
  // that will not connect ships silently — which is why this function exists.
  if (value.startsWith('~')) return { ok: false, value, issue: 'tilde' };
  if (value.startsWith('/')) return { ok: true, value, issue: null };
  if (/^[A-Za-z]:[\\/]/.test(value)) return { ok: true, value, issue: null };
  return { ok: false, value, issue: 'relative' };
}

export interface ManualConnectInput {
  /** Absolute path of the vault folder. */
  vaultAbsolute: string;
  /** Absolute path of the ontology-atlas source checkout — how to launch the server lives there. */
  checkoutAbsolute: string;
}

export interface ManualConnectConfig {
  client: AgentClientId;
  /** The file this tool reads, relative to the folder the agent is opened in. */
  file: string;
  /** The body that goes into that file verbatim. */
  body: string;
}

/** The source-checkout launch contract — the floor where there is no app bundle. */
export function manualLaunch({ checkoutAbsolute }: Pick<ManualConnectInput, 'checkoutAbsolute'>): McpServerLaunch {
  return sourceCheckoutLaunch(checkoutAbsolute);
}

/**
 * One set of config files attaching this tool to this vault.
 *
 * File names come from `AGENT_CLIENTS`, so there is one source of truth for each tool's config
 * location. The body goes through **the same builder** the installed app uses — a second,
 * web-only format would leave one of them quietly wrong.
 */
export function manualConnectConfig(
  client: AgentClientId,
  input: ManualConnectInput,
): ManualConnectConfig {
  const launch = manualLaunch(input);
  const file = filesForClient(client)[0] ?? '.mcp.json';
  const body =
    client === 'codex'
      ? buildCodexConfigTomlTemplate('vault', input.vaultAbsolute, launch)
      : buildMcpConfigJson('vault', input.vaultAbsolute, launch);
  return { client, file, body };
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * A one-line CLI that produces all four at once, for someone who does not want to create files by
 * hand.
 *
 * `agent-setup` creates **only missing files** and never overwrites an existing config. Pointing
 * `--root` at the vault narrows the targets to one set (for opening the vault folder as the
 * project); anyone opening from a different codebase root changes only `--root`.
 */
export function manualSetupCommand({ vaultAbsolute, checkoutAbsolute }: ManualConnectInput): string {
  return [
    'node',
    shellQuote(`${checkoutAbsolute}/cli/src/index.mjs`),
    'agent-setup',
    shellQuote(vaultAbsolute),
    '--root',
    shellQuote(vaultAbsolute),
    '--write',
  ].join(' ');
}

/** The one line by which a user confirms for themselves that the config really connects. */
export function manualVerifyCommand({ vaultAbsolute, checkoutAbsolute }: ManualConnectInput): string {
  return [
    'node',
    shellQuote(`${checkoutAbsolute}/cli/src/index.mjs`),
    'mcp-verify',
    shellQuote(vaultAbsolute),
    '--timeout-ms',
    '15000',
  ].join(' ');
}

/** The first line for someone with no checkout. The destination becomes the checkout path. */
export const ATLAS_CLONE_COMMAND =
  'git clone https://github.com/wlsdks/ontology-atlas.git';
