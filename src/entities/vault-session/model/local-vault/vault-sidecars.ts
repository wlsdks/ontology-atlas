import {
  buildCodexConfigToml,
  buildMcpConfigJson,
  buildVaultMcpConfigJson,
} from '../../lib/ontology-starter';
import { getTauriVaultRootPath, readTauriVaultTextTail } from '@/shared/lib/tauri-vault-fs';
import { parseAgentActivityLog, type AgentActivityEntry } from '@/shared/lib/agent-activity-log';
import {
  ACP_WORK_RECEIPT_FILE,
  parseAcpWorkReceipts,
  type AcpWorkReceipt,
} from '@/shared/lib/acp-work-receipt';
import { bundledServerLaunch, inspectMcpServerLaunch, type McpServerLaunch } from '@/shared/config';
import { readBundledMcpServer } from '@/shared/lib/tauri-agent-setup';
import {
  emptyAgentActivityStatus,
  parseAgentActivityStatus,
  type AgentActivityStatus,
} from '../agent-activity-status';

export interface AgentConfigStatus {
  mcpJson: boolean;
  codexConfig: boolean;
  mcpExample: boolean;
  mcpJsonValid?: boolean;
  codexConfigValid?: boolean;
  mcpExampleValid?: boolean;
  /**
   * The command string `.codex/config.toml` registered, **verbatim**. To avoid wiring the
   * same server twice in a session the app needs to know *what* was registered, not just
   * that something was — a stale path must not be skipped over
   * (see the measured comment in `vault-mcp-server.ts`).
   */
  codexRegisteredCommand?: string | null;
}

async function hasRootFile(
  handle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<boolean> {
  try {
    await handle.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

async function readTextFileIfPresent(
  handle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<string | null> {
  try {
    const fileHandle = await handle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export function looksLikeOmotMcpJson(
  raw: string | null,
  options: { expectedVault?: string } = {},
): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, { command?: unknown; args?: unknown; env?: unknown }>;
    };
    const server = parsed.mcpServers?.['ontology-atlas'];
    if (!server || typeof server.command !== 'string') return false;
    const env =
      server.env && typeof server.env === 'object'
        ? (server.env as Record<string, unknown>)
        : {};
    return (
      inspectMcpServerLaunch(server.command, server.args).valid &&
      typeof env.OATLAS_VAULT === 'string' &&
      env.OATLAS_VAULT.trim().length > 0 &&
      (options.expectedVault === undefined ||
        env.OATLAS_VAULT.trim() === options.expectedVault)
    );
  } catch {
    return false;
  }
}

function configTomlSection(raw: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`^\\[${escaped}\\]\\s*$`, 'm'));
  if (!match || match.index === undefined) return null;
  const rest = raw.slice(match.index + match[0].length);
  const next = rest.search(/^\[[^\]]+\]\s*$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function configTomlString(section: string | null, key: string): string | null {
  if (!section) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = section.match(new RegExp(`^\\s*${escaped}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*$`, 'm'));
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as unknown;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function configTomlStringArray(section: string | null, key: string): string[] | null {
  if (!section) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = section.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(\\[[^\\n]*\\])\\s*$`, 'm'));
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as unknown;
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
      ? value
      : null;
  } catch {
    return null;
  }
}

/** The command string registered by `.codex/config.toml`, or `null`. */
export function readOmotCodexCommand(raw: string | null): string | null {
  if (!raw) return null;
  return configTomlString(configTomlSection(raw, 'mcp_servers.ontology-atlas'), 'command');
}

export function looksLikeOmotCodexToml(
  raw: string | null,
  options: { expectedVault?: string } = {},
): boolean {
  if (!raw) return false;
  const serverSection = configTomlSection(raw, 'mcp_servers.ontology-atlas');
  const envSection = configTomlSection(raw, 'mcp_servers.ontology-atlas.env');
  const command = configTomlString(serverSection, 'command');
  const args = configTomlStringArray(serverSection, 'args');
  const vault = configTomlString(envSection, 'OATLAS_VAULT');
  return (
    inspectMcpServerLaunch(command, args).valid &&
    typeof vault === 'string' &&
    vault.trim().length > 0 &&
    (options.expectedVault === undefined ||
      vault.trim() === options.expectedVault)
  );
}

async function readAgentConfigStatus(
  handle: FileSystemDirectoryHandle,
): Promise<AgentConfigStatus> {
  const mcpJsonText = await readTextFileIfPresent(handle, '.mcp.json');
  const mcpExampleText = await readTextFileIfPresent(handle, '.mcp.json.example');
  let codexConfigText: string | null = null;
  try {
    const codexDir = await handle.getDirectoryHandle('.codex');
    codexConfigText = await readTextFileIfPresent(codexDir, 'config.toml');
  } catch {
    codexConfigText = null;
  }
  return {
    mcpJson: mcpJsonText !== null,
    codexConfig: codexConfigText !== null,
    mcpExample: mcpExampleText !== null,
    mcpJsonValid: looksLikeOmotMcpJson(mcpJsonText, { expectedVault: '.' }),
    codexConfigValid: looksLikeOmotCodexToml(codexConfigText, { expectedVault: '.' }),
    codexRegisteredCommand: readOmotCodexCommand(codexConfigText),
    mcpExampleValid: looksLikeOmotMcpJson(mcpExampleText),
  };
}

async function readAgentActivityStatus(
  handle: FileSystemDirectoryHandle,
): Promise<AgentActivityStatus> {
  let activityDir: FileSystemDirectoryHandle;
  try {
    activityDir = await handle.getDirectoryHandle('.ontology-atlas');
  } catch {
    return emptyAgentActivityStatus();
  }
  const raw = await readTextFileIfPresent(activityDir, 'agent-activity.json');
  return parseAgentActivityStatus(raw);
}

/**
 * Are two sidecar states **effectively the same** — the check that stops every polling
 * tick from re-rendering the whole app just because it built a new object.
 *
 * Structural, not reference, equality (2026-09-01 review). The one-level `===` version was a
 * dead guard: `reviewTarget`, `proof`, and `refreshRequest` are non-null nested objects rebuilt
 * fresh on every parse, so the compare was permanently false and `setState` fired on every
 * 1.5–5 s tick — reinstating exactly the five-second full-app re-render this comparison exists
 * to prevent. The inputs are small parsed sidecar summaries with no cycles, so a recursive
 * compare costs far less than one wasted render. Exported for its regression test only.
 */
/**
 * Blanks the volatile age fields before a no-change compare. `ageMs` and
 * `refreshRequest.previousAgeMs` embed `Date.now()` at parse time, so with a
 * heartbeat file present two consecutive poll ticks were never structurally
 * equal and the "nothing changed means state is not touched" guard was defeated
 * — the whole app re-rendered every 1.5–5s during any agent session (bug sweep
 * 2026-09-01). `stale` still participates, so the one meaningful age transition
 * still reaches state. Nothing on screen reads `ageMs` directly.
 */
export function comparableAgentActivityStatus(status: AgentActivityStatus): AgentActivityStatus {
  if (status.ageMs === null && status.refreshRequest.previousAgeMs === null) return status;
  return {
    ...status,
    ageMs: null,
    refreshRequest: { ...status.refreshRequest, previousAgeMs: null },
  };
}

export function structurallyEqualStatus(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => structurallyEqualStatus(left[key], right[key]));
}

export async function readVaultSidecarStatuses(handle: FileSystemDirectoryHandle): Promise<{
  agentConfigStatus: AgentConfigStatus;
  agentActivityStatus: AgentActivityStatus;
  agentActivityLog: AgentActivityEntry[];
  acpWorkReceipts: AcpWorkReceipt[];
}> {
  const [agentConfigStatus, agentActivityStatus, agentActivityLog, acpWorkReceipts] = await Promise.all([
    readAgentConfigStatus(handle),
    readAgentActivityStatus(handle),
    readAgentActivityLog(handle),
    readAcpWorkReceipts(handle),
  ]);
  return { agentConfigStatus, agentActivityStatus, agentActivityLog, acpWorkReceipts };
}

const ACTIVITY_LOG_SHOWN_ENTRIES = 50;

/** Tail of the local audit log (read-only; empty array when absent). */
async function readAgentActivityLog(handle: FileSystemDirectoryHandle): Promise<AgentActivityEntry[]> {
  try {
    const rootPath = getTauriVaultRootPath(handle);
    const raw = rootPath
      ? await readTauriVaultTextTail(rootPath, '.ontology-atlas/activity.jsonl', ACTIVITY_LOG_SHOWN_ENTRIES)
      : await readTextFileIfPresent(await handle.getDirectoryHandle('.ontology-atlas'), 'activity.jsonl');
    return raw ? parseAgentActivityLog(raw, { limit: ACTIVITY_LOG_SHOWN_ENTRIES }) : [];
  } catch {
    return [];
  }
}

async function readAcpWorkReceipts(handle: FileSystemDirectoryHandle): Promise<AcpWorkReceipt[]> {
  try {
    const dir = await handle.getDirectoryHandle('.ontology-atlas');
    const raw = await readTextFileIfPresent(dir, ACP_WORK_RECEIPT_FILE);
    return raw ? parseAcpWorkReceipts(raw) : [];
  } catch {
    return [];
  }
}

async function writeRootFileIfMissing(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<'created' | 'skipped'> {
  if (await hasRootFile(handle, fileName)) return 'skipped';
  const fh = await handle.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
  return 'created';
}

/**
 * Locates the bundled MCP server and builds its launch contract. Null when it cannot be
 * found — and then no config is written. Planting a config that will not connect is not
 * help, it is a lie someone has to debug later.
 */
export async function resolveBundledLaunch(): Promise<McpServerLaunch | null> {
  try {
    const bundled = await readBundledMcpServer();
    return bundled.available && bundled.path ? bundledServerLaunch(bundled.path) : null;
  } catch {
    return null;
  }
}

/**
 * Config writing on the web (FSA) path — **only the file that was asked for.**
 *
 * This used to write `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml`
 * unconditionally, so "connect to Claude Code" also wrote the Codex config — a defect
 * that existed here as well as on the Tauri path. With no `wanted` (the starter-vault
 * scaffold, where the label is not "connect") it still writes all of them; that behaviour
 * is not a defect because the label promises it.
 */
export async function writeAgentConfigFiles(
  handle: FileSystemDirectoryHandle,
  launch: McpServerLaunch,
  wanted?: readonly string[],
): Promise<{ created: number; skipped: number }> {
  const want = (fileName: string) => !wanted || wanted.includes(fileName);
  let created = 0;
  let skipped = 0;
  const count = (result: 'created' | 'skipped') => {
    if (result === 'created') created += 1;
    else skipped += 1;
  };
  if (want('.mcp.json')) {
    count(await writeRootFileIfMissing(handle, '.mcp.json', buildVaultMcpConfigJson(launch)));
  }
  if (want('.mcp.json.example')) {
    count(
      await writeRootFileIfMissing(
        handle,
        '.mcp.json.example',
        buildMcpConfigJson(handle.name, null, launch),
      ),
    );
  }
  try {
    if (!want('.codex/config.toml')) return { created, skipped };
    const codexDir = await handle.getDirectoryHandle('.codex', {
      create: true,
    });
    count(
      await writeRootFileIfMissing(
        codexDir,
        'config.toml',
        buildCodexConfigToml('.', launch),
      ),
    );
  } catch {
    skipped += 1;
  }
  return { created, skipped };
}
