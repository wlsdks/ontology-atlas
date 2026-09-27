/**
 * Builds agent config on the web from two absolute paths the person supplies (vault folder and
 * Atlas checkout). MCP attaches to the folder, so a web user can connect; the browser only cannot
 * know the path (File System Access gives a handle), so it cannot configure automatically
 * (`.claude/rules/surfaces.md`). The paths never leave the screen: nothing sent or stored.
 * Validation checks shape only and never claims the folder exists.
 */

import { sourceCheckoutLaunch, type McpServerLaunch } from '@/shared/config';

import { type AgentClientId, filesForClient } from '@/entities/vault-session';
import { buildCodexConfigTomlTemplate, buildMcpConfigJson } from '@/entities/vault-session';

/** `null` means the shape passed. */
export type ManualPathIssue = 'empty' | 'relative' | 'tilde' | 'multiline';

export interface ManualPathResult {
  /** Absolute shape only, not existence. */
  ok: boolean;
  /** After stripping quotes, escapes and a trailing slash. */
  value: string;
  issue: ManualPathIssue | null;
}

/** Strips the wrappers a pasted path actually arrives in. */
function unwrap(raw: string): string {
  let value = raw.trim();

  // One layer of quotes, as terminal and Finder copies add.
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

  // Trailing slashes down to the root (`/`), so one folder has one config value.
  while (value.length > 1 && (value.endsWith('/') || value.endsWith('\\'))) {
    value = value.slice(0, -1);
  }

  return value;
}

/**
 * Normalizes a pasted path and judges its shape only. A Windows drive path counts as absolute,
 * because the web serves operating systems without the app.
 */
export function normalizeManualPath(raw: string): ManualPathResult {
  const value = unwrap(raw ?? '');
  if (value.length === 0) return { ok: false, value: '', issue: 'empty' };
  if (/[\r\n]/.test(value)) return { ok: false, value, issue: 'multiline' };
  // A config file does not expand `~`, so a tilde path would ship a config that silently never
  // connects.
  if (value.startsWith('~')) return { ok: false, value, issue: 'tilde' };
  if (value.startsWith('/')) return { ok: true, value, issue: null };
  if (/^[A-Za-z]:[\\/]/.test(value)) return { ok: true, value, issue: null };
  return { ok: false, value, issue: 'relative' };
}

export interface ManualConnectInput {
  vaultAbsolute: string;
  /** The server launch command lives in this checkout. */
  checkoutAbsolute: string;
}

export interface ManualConnectConfig {
  client: AgentClientId;
  /** Relative to the folder the agent is opened in. */
  file: string;
  body: string;
}

/** The source-checkout launch contract, used where there is no app bundle. */
function manualLaunch({ checkoutAbsolute }: Pick<ManualConnectInput, 'checkoutAbsolute'>): McpServerLaunch {
  return sourceCheckoutLaunch(checkoutAbsolute);
}

/**
 * File names come from `AGENT_CLIENTS` and the body from the builder the installed app uses, so
 * a web-only format cannot drift.
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
 * One CLI line that writes all four configs. `agent-setup` creates only missing files and never
 * overwrites one; `--root` at the vault narrows it to one set.
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

/** Lets the user confirm the config really connects. */
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

/** For someone with no checkout; the destination becomes the checkout path. */
export const ATLAS_CLONE_COMMAND =
  'git clone https://github.com/wlsdks/ontology-atlas.git';
