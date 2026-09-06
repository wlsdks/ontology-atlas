'use client';

import { type AgentClientId, filesForClient } from '../lib/agent-clients';
import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/wiki-page-schema';
import type { VaultShape } from '@/shared/lib/vault-shape';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseAgentActivityLog, type AgentActivityEntry } from '@/shared/lib/agent-activity-log';
import {
  ACP_WORK_RECEIPT_FILE,
  parseAcpWorkReceipts,
  type AcpWorkReceipt,
} from '@/shared/lib/acp-work-receipt';
import {
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
  computeLocalVaultFingerprintWithStamps,
  type VaultStampIndex,
  computeLocalVaultFingerprint,
  type BuiltVaultEntry,
  type LocalVaultBuild,
  type VaultManifest,
  applyFrontmatterUpdates,
  type FrontmatterUpdateValue,
  computeRenameRefContext,
  rewriteRenamedDocRefs,
} from '@/entities/docs-vault';
import {
  CURRENT_LOCAL_FS_HANDLE_ID,
  deleteLocalFsHandle,
  forgetRecentLocalFsHandle,
  getLocalFsHandle,
  listRecentLocalFsHandles,
  putLocalFsHandle,
  touchLocalFsHandle,
  verifyHandlePermission,
} from '@/entities/local-fs-handle';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import {
  materializeStarterFiles,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
  vaultSkillFilesForLocale,
  buildCodexConfigToml,
  buildMcpConfigJson,
  buildVaultMcpConfigJson,
} from '../lib/ontology-starter';
import {
  createTauriVaultHandle,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  listTauriDirectoryNames,
  pickTauriVaultDirectory,
  vaultRootRejectionReason,
  tauriVaultPathExists,
} from '@/shared/lib/tauri-vault-fs';
import { resolvePickedVaultFolder } from './resolve-picked-vault-folder';
import { classifyVaultAccessError, isMissingFolderError } from './classify-vault-access-error';
import { toErrorMessage } from '@/shared/lib/error-message';
import { isPickerAbort } from '@/shared/lib/picker-abort';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import {
  bundledServerLaunch,
  inspectMcpServerLaunch,
  type McpServerLaunch,
} from '@/shared/config';
import { readBundledMcpServer } from '@/shared/lib/tauri-agent-setup';
import {
  emptyAgentActivityStatus,
  parseAgentActivityStatus,
  type AgentActivityStatus,
} from './agent-activity-status';
import { createAdaptivePoller } from './poll-cadence';
/** Minimum interval (ms) between auto-refreshes when the tab regains focus.
 *  Without the throttle every quick trip to an IDE and back makes the UI flash. */
const AUTO_REFRESH_DEBOUNCE_MS = 2000;

/**
 * Background filesystem polling. While the tab is visible, fingerprints are compared
 * and a change triggers a reload, so edits made through an IDE or an AI agent show up
 * **without focusing the web tab**. The cadence is adaptive (`poll-cadence.ts`): right
 * after a change it bursts (~1.5 s) because an agent is probably mid-session, and it
 * decays to idle (5 s) when things go quiet. With no change only the fingerprint is
 * compared, which is nearly free. The FS Access API has no native directory-change
 * event (the Tauri shell watches the OS), so on the web adaptive polling is the
 * ceiling without a backend.
 */

/**
 * Thrown when the vault's `.md` changed outside the app (another editor, an AI over
 * MCP) and the user then saves from the GUI — the guard against a silent overwrite.
 * Same meaning as the MCP-side `VaultConflictError`.
 */
export class VaultConflictError extends Error {
  readonly slug: string;
  readonly expectedMtime: number;
  readonly currentMtime: number;
  constructor(slug: string, expectedMtime: number, currentMtime: number) {
    super(
      `Vault conflict — "${slug}" was modified externally between read and write.`,
    );
    this.name = 'VaultConflictError';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

export function assertExpectedMtime(
  slug: string,
  expectedMtime: number | undefined,
  currentMtime: number,
): void {
  if (typeof expectedMtime === 'number' && currentMtime !== expectedMtime) {
    throw new VaultConflictError(slug, expectedMtime, currentMtime);
  }
}

const NODE_UID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function identityClaims(frontmatter: Record<string, unknown>): string[] {
  return [
    ...(typeof frontmatter.uid === 'string' ? [frontmatter.uid] : []),
    ...(Array.isArray(frontmatter.merged_uids)
      ? frontmatter.merged_uids.filter((value): value is string => typeof value === 'string')
      : []),
  ];
}

function assertNodeIdentityContent(
  slug: string,
  raw: string,
  docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>,
): void {
  const frontmatter = parseFrontmatter(raw).frontmatter;
  if (typeof frontmatter.kind !== 'string' || !frontmatter.kind.trim()) return;
  if (typeof frontmatter.uid !== 'string' || !NODE_UID_RE.test(frontmatter.uid)) {
    throw new Error('Every kind node must have a lowercase UUIDv4 `uid:`.');
  }
  const merged = frontmatter.merged_uids;
  if (merged !== undefined) {
    if (
      !Array.isArray(merged) ||
      merged.some(
        (value) =>
          typeof value !== 'string' ||
          !NODE_UID_RE.test(value) ||
          value === frontmatter.uid,
      )
    ) {
      throw new Error('`merged_uids:` must contain only absorbed lowercase UUIDv4 identities.');
    }
    const canonical = [...new Set(merged)].sort((a, b) => a.localeCompare(b, 'en'));
    if (canonical.length !== merged.length || canonical.some((value, index) => value !== merged[index])) {
      throw new Error('`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.');
    }
  }
  const claims = new Set(identityClaims(frontmatter));
  for (const doc of docs) {
    if (doc.slug === slug) continue;
    const collision = identityClaims(doc.frontmatter).find((uid) => claims.has(uid));
    if (collision) {
      throw new Error(`UID collision: ${collision} already belongs to "${doc.slug}".`);
    }
  }
}

/**
 * Identity-guard errors carry their variant in `name`; the editor turns that name into
 * a sentence in the user's language (same grammar as `VaultConflictError`). The English
 * message stays as the fallback for the console, logs, and surfaces that do not localize.
 */
function identityError(name: 'VaultIdentityUidError' | 'VaultIdentityHistoryError', message: string): Error {
  return Object.assign(new Error(message), { name });
}

function assertIdentityPatch(
  raw: string,
  updates: Record<string, FrontmatterUpdateValue>,
): void {
  const previous = parseFrontmatter(raw).frontmatter;
  if ('merged_uids' in updates) {
    throw identityError(
      'VaultIdentityHistoryError',
      '`merged_uids:` is merge-owned identity history and cannot be edited by a generic browser patch.',
    );
  }
  if (!('uid' in updates)) return;
  const nextUid = updates.uid;
  const previousUid = previous.uid;
  const hasPreviousUid = previousUid !== undefined && previousUid !== null && previousUid !== '';
  if (hasPreviousUid && nextUid !== previousUid) {
    throw identityError('VaultIdentityUidError', '`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if (typeof nextUid !== 'string' || !NODE_UID_RE.test(nextUid)) {
    throw identityError('VaultIdentityUidError', '`uid:` must be a lowercase UUIDv4.');
  }
}

function assertIdentityTransition(previousRaw: string, nextRaw: string): void {
  const previous = parseFrontmatter(previousRaw).frontmatter;
  const next = parseFrontmatter(nextRaw).frontmatter;
  const previousUid = previous.uid;
  if (
    previousUid !== undefined &&
    previousUid !== null &&
    previousUid !== '' &&
    next.uid !== previousUid
  ) {
    throw identityError('VaultIdentityUidError', '`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if (JSON.stringify(next.merged_uids) !== JSON.stringify(previous.merged_uids)) {
    throw identityError(
      'VaultIdentityHistoryError',
      '`merged_uids:` is merge-owned identity history and cannot be edited by a generic browser save.',
    );
  }
}

type Status =
  | 'idle'
  | 'opening'
  | 'loading'
  | 'loaded'
  | 'permission-needed'
  | 'unsupported'
  | 'error';

/**
 * A human-readable classification of the error status. The picker chooses its localized
 * guidance from this code, which keeps the hook itself i18n-free.
 *
 * - `path-missing` — (desktop) the vault folder opened previously has moved or been
 *   deleted and is no longer reachable by absolute path. "Choose the folder again" is
 *   the next action.
 * - `permission-denied` — the operating system is protecting this folder and has not been told to
 *   allow it. Its own code because the remedy is a checkbox in System Settings, not a retry, and
 *   because the raw `Operation not permitted (os error 1)` names an errno rather than a folder.
 *   Classified from the OS message, never guessed from the path — see
 *   `classify-vault-access-error.ts`.
 * - `access-failed` — any other read or build failure. `errorMessage` carries the cause
 *   string, including a Tauri command's `Err(String)`, so it is no longer silent.
 * - `root-rejected` — the chosen location cannot be a vault root (a filesystem root, the
 *   home directory itself, an OS or app directory). This is a **rejection, not a
 *   failure**, and gets its own code because retrying gives the same result — "please try
 *   again" would be wrong guidance. `errorMessage` is null and the screen picks the
 *   reason in its own language (`vaultRootRejectionReason`).
 */
type VaultErrorCode =
  | 'path-missing'
  | 'permission-denied'
  | 'access-failed'
  | 'root-rejected';

interface State {
  status: Status;
  handle: FileSystemDirectoryHandle | null;
  manifest: VaultManifest | null;
  agentConfigStatus: AgentConfigStatus | null;
  agentActivityStatus: AgentActivityStatus;
  /** Tail of the local audit log; empty array when absent. */
  agentActivityLog: AgentActivityEntry[];
  /** App-local human decision receipts from `.ontology-atlas/acp-work.jsonl`. */
  acpWorkReceipts: AcpWorkReceipt[];
  fileHandles: Map<string, FileSystemFileHandle>;
  imageHandles: Map<string, FileSystemFileHandle>;
  /**
   * Raw sources under `sources/`, keyed by vault-relative path. Nothing here is opened
   * by the build; a handle is reached through only when a person asks to open or hash
   * one file.
   */
  sourceHandles: Map<string, FileSystemFileHandle>;
  errorMessage: string | null;
  /** Meaningful only in the error status — the key the picker uses to pick localized guidance. */
  errorCode: VaultErrorCode | null;
  /** Epoch ms of the last successful scan, shown by the picker as "scanned N seconds ago". */
  lastLoadedAt: number | null;
  /**
   * **Which handle** `manifest` was built from. Kept separate from `handle` because a
   * rescan (`load`) sets `handle` to the new value and status to 'loading' the moment it
   * starts, while `manifest` is still the previous one. Comparing the two distinguishes
   * "re-reading the same folder" (content still valid) from "switching folders" (content
   * invalid) — without that distinction, the second it takes to switch draws the other
   * folder's graph.
   */
  manifestHandle: FileSystemDirectoryHandle | null;
}

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

function emptyState(status: Status = 'idle'): State {
  return {
    status,
    handle: null,
    manifest: null,
    agentConfigStatus: null,
    agentActivityStatus: emptyAgentActivityStatus(),
    agentActivityLog: [],
    acpWorkReceipts: [],
    fileHandles: new Map(),
    imageHandles: new Map(),
    sourceHandles: new Map(),
    errorMessage: null,
    errorCode: null,
    lastLoadedAt: null,
    manifestHandle: null,
  };
}

/**
 * (Desktop) Preflight for reopening a recent Tauri vault: does the stored absolute path
 * still resolve to a directory? False when the folder chosen in an earlier session has
 * since moved or been deleted. This desktop-only path reopens by absolute path with no
 * FSA picker, and this classifies the common "folder vanished" failure as a readable
 * 'path-missing'. Non-Tauri runtimes and records without a path are not preflight
 * candidates and short-circuit to true — their handles carry their own permission.
 */
async function tauriVaultRecordResolves(
  record: LocalFsHandleRecord,
): Promise<boolean> {
  if (!isTauriVaultRuntime()) return true;
  const rootPath = record.desktopRootPath ?? getTauriVaultRootPath(record.handle);
  if (!rootPath) return true;
  try {
    return await tauriVaultPathExists(rootPath, 'directory');
  } catch {
    // A failed path lookup (a canonicalize error, say) also counts as inaccessible.
    return false;
  }
}

interface ResolvedVaultHandle {
  handle: FileSystemDirectoryHandle;
  /** The project root the person chose or previously stored, when its `atlas/` child won. */
  redirectedFrom: string | null;
}

/**
 * Applies the project → `atlas/` rule to every desktop ingress, not only the picker.
 *
 * The picker adopted this rule first, but recent-vault reopening and cold restore kept loading
 * their stored project-root handles directly. A project containing `atlas/*.md` could therefore
 * be read as the project plus every frontmatter-bearing Markdown file around it, while a manual
 * picker open read only `atlas/`. One stored project must not mean two vaults depending on ingress.
 */
async function resolveVaultHandle(handle: FileSystemDirectoryHandle): Promise<ResolvedVaultHandle> {
  const pickedPath = getTauriVaultRootPath(handle);
  if (!pickedPath) return { handle, redirectedFrom: null };

  const resolved = await resolvePickedVaultFolder(pickedPath, async (candidate) => {
    try {
      return await listTauriDirectoryNames(candidate);
    } catch {
      return null;
    }
  });
  if (!resolved.redirected) return { handle, redirectedFrom: null };
  return {
    handle: createTauriVaultHandle(resolved.rootPath),
    redirectedFrom: pickedPath,
  };
}

// The frontmatter serialization rules moved down to the entity layer — the path that
// applies an agent's proposal must write by the same rules, or the git diff carries two
// formats. Re-exported here so existing import paths keep working.
export {
  applyFrontmatterUpdates,
  type FrontmatterUpdateValue,
} from '@/entities/docs-vault';

/**
 * Capability is decided by **whether it can be called**, not by `in`. `'showDirectoryPicker'
 * in window` is true whenever the key exists, so in an environment where the value is
 * `undefined` (an extension, a polyfill, a browser stub) `isSupported()` returned true and
 * the picker call then threw a raw JavaScript `is not a function` error — which was
 * rendered in red in the product's single indigo primary CTA slot (entry review E-1).
 * If it cannot be called it is unsupported, and the existing path degrades honestly instead.
 */
function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const picker = (window as unknown as { showDirectoryPicker?: unknown })
    .showDirectoryPicker;
  return typeof picker === 'function' || isTauriVaultRuntime();
}

function verifyRead(
  handle: FileSystemDirectoryHandle,
  ask = false,
): Promise<'granted' | 'prompt' | 'denied'> {
  return verifyHandlePermission(handle, 'read', { ask });
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

async function readVaultSidecarStatuses(handle: FileSystemDirectoryHandle): Promise<{
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

/** Tail of the local audit log (read-only; empty array when absent). */
async function readAgentActivityLog(handle: FileSystemDirectoryHandle): Promise<AgentActivityEntry[]> {
  try {
    const dir = await handle.getDirectoryHandle('.ontology-atlas');
    const raw = await readTextFileIfPresent(dir, 'activity.jsonl');
    return raw ? parseAgentActivityLog(raw, { limit: 50 }) : [];
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
async function resolveBundledLaunch(): Promise<McpServerLaunch | null> {
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
async function writeAgentConfigFiles(
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

/**
 * @internal — do not call directly. Access it through `useLocalVault()`, a consumer of
 * `LocalVaultProvider`. This hook exists so `LocalVaultProvider` can mount it once and
 * keep a single instance of the state, IDB rehydration, fingerprint rescan, and FS reads.
 *
 * Before the provider pattern, eight places called `useLocalVault()` directly, giving two
 * or three instances per page mount — the same IDB key rehydrated N times and N full
 * `buildLocalManifest` walks of the filesystem.
 *
 * Uses a local folder as the vault. Works only in browsers with the File System Access
 * API (Chrome/Edge/Safari 18.2+/Opera).
 * The surface:
 * - `open()` — pick a folder with showDirectoryPicker and store the handle in IDB
 * - `close()` — drop the handle and return to idle
 * - `refresh()` — rescan the current handle to pick up file changes
 * - `requestPermission()` — re-approve when a restored session is permission-needed
 *
 * On first mount it tries to restore the handle stored in IDB: a 'granted' query builds
 * the manifest automatically, while 'prompt' waits in permission-needed.
 */
export function useLocalVaultInternal() {
  // SSR consistency: calling `isSupported()` from the lazy initializer mismatches between
  // SSR (no window → 'unsupported') and the client's first hydration (window → 'idle').
  // Always start 'idle' and let a mount effect switch to 'unsupported' when FSA is
  // missing — one frame looks supported, but the hydration error is gone.
  const [state, setState] = useState<State>(() => emptyState('idle'));
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  /**
   * Set when "open a folder" opened the map **inside** the folder that was picked.
   *
   * ⚠️ Exists so the screen can say so. Quietly opening a different folder from the one a person
   * chose teaches them the product does not do what they asked, even when the substitution is the
   * helpful one. Holds the path they actually picked; `null` means nothing was substituted.
   */
  const [openedInsidePickedFolder, setOpenedInsidePickedFolder] = useState<string | null>(null);
  const [recentVaults, setRecentVaults] = useState<LocalFsHandleRecord[]>([]);

  /** Fingerprint of the last successful build — the comparison that lets auto-refresh skip. */
  const lastFingerprintRef = useRef<string | null>(null);
  /** One slot for `refresh()` to hand the native stamps it just fetched to `load()`. */
  const pendingStampsRef = useRef<VaultStampIndex | null>(null);

  /**
   * The reusable entries of the last successful build and the handle they came from. The
   * next `load` of the same vault uses them for an incremental rebuild (re-reading only
   * changed files). Reset to null on a different vault or a failed build, falling back to
   * a full build. A ref, not state, so it triggers no re-render.
   */
  const lastBuildRef = useRef<{
    handle: FileSystemDirectoryHandle;
    entries: BuiltVaultEntry[];
  } | null>(null);

  /**
   * Secures readwrite permission before any write. On refusal the state moves to
   * 'permission-needed' so the picker's reauth UI appears immediately; previously
   * `saveDoc` only threw while the state stayed 'loaded', leaving a user who went to the
   * picker unaware it was a permission problem. It still throws afterwards, so the caller's
   * try/catch keeps showing the inline error.
   */
  const requireWritePermission = useCallback(
    async (handle: FileSystemDirectoryHandle | FileSystemFileHandle) => {
      const result = await verifyHandlePermission(handle, 'readwrite', { ask: true });
      if (result !== 'granted') {
        setState((s) => ({ ...s, status: 'permission-needed' }));
        throw new Error('Write permission denied');
      }
    },
    [],
  );

  const load = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setState((s) => ({
      ...s,
      status: 'loading',
      handle,
      errorMessage: null,
      errorCode: null,
    }));
    try {
      // With a previous build of the same vault (identical handle), rebuild incrementally —
      // re-reading only changed files, which is what removes the live-update lag on a large
      // vault. First load, a different vault, or a failed incremental falls back to a full
      // build; the results are byte-equivalent (proven by incremental.test).
      const reuse =
        lastBuildRef.current && lastBuildRef.current.handle === handle
          ? lastBuildRef.current.entries
          : null;
      let result: { build: LocalVaultBuild; entries: BuiltVaultEntry[] };
      if (reuse) {
        try {
          // Use the stamps `refresh()` just walked for, when it has them; otherwise the
          // incremental path fetches them itself (first load, other entry points).
          result = await rebuildLocalManifestIncremental(handle, reuse, pendingStampsRef.current);
        } catch {
          result = await buildLocalManifestWithEntries(handle);
        }
      } else {
        result = await buildLocalManifestWithEntries(handle);
      }
      const { build, entries } = result;
      const { manifest, fileHandles, imageHandles, sourceHandles, fingerprint } = build;
      const { agentConfigStatus, agentActivityStatus, agentActivityLog, acpWorkReceipts } =
        await readVaultSidecarStatuses(handle);
      lastFingerprintRef.current = fingerprint;
      lastBuildRef.current = { handle, entries };
      setState({
        status: 'loaded',
        handle,
        manifest,
        agentConfigStatus,
        agentActivityStatus,
        agentActivityLog,
        acpWorkReceipts,
        fileHandles,
        imageHandles,
        sourceHandles,
        errorMessage: null,
        errorCode: null,
        lastLoadedAt: Date.now(),
        manifestHandle: handle,
      });
    } catch (err) {
      lastBuildRef.current = null;
      // `toErrorMessage` preserves the cause string. Tauri commands return `Err(String)`, so
      // `invoke` rejects with a *string* rather than an Error; the previous
      // `err instanceof Error ? err.message : null` discarded it wholesale and silenced every
      // desktop vault access failure behind a generic banner. An empty message stays null so
      // the picker's locale-aware `errorFallback` fills it.
      setState({
        status: 'error',
        handle,
        manifest: null,
        agentConfigStatus: null,
        agentActivityStatus: emptyAgentActivityStatus(),
        agentActivityLog: [],
        acpWorkReceipts: [],
        fileHandles: new Map(),
        imageHandles: new Map(),
    sourceHandles: new Map(),
        errorMessage: toErrorMessage(err),
        // A refusal by the operating system is not the same event as a broken folder, and sending
        // somebody to System Settings to fix a folder that is simply gone would be worse than vague.
        errorCode:
          classifyVaultAccessError(err) === 'permission-denied' ? 'permission-denied' : 'access-failed',
        lastLoadedAt: null,
        manifestHandle: null,
      });
    }
  }, []);

  const refreshRecentVaults = useCallback(async () => {
    setRecentVaults(await listRecentLocalFsHandles());
  }, []);

  const open = useCallback(async () => {
    if (!isSupported()) {
      setState(emptyState('unsupported'));
      return;
    }
    // Cancelling the native or browser picker is not a state change: the exact contract from
    // just before the picker opened — permission-needed, error, idle, loaded — must be
    // restored whole. Inferring 'loaded' from the mere presence of a `handle` makes a cancel
    // during permission-needed wake a spurious auto-refresh that surfaces a raw OS error
    // from a stale path.
    const previousState = state;
    setState((s) => ({
      ...s,
      status: 'opening',
      errorMessage: null,
      errorCode: null,
    }));
    try {
      const handle = isTauriVaultRuntime()
        ? await pickTauriVaultDirectory()
        : await (
            window as unknown as {
              showDirectoryPicker: (opts?: {
                mode?: 'read' | 'readwrite';
              }) => Promise<FileSystemDirectoryHandle>;
            }
          ).showDirectoryPicker({ mode: 'read' });
      if (!handle) {
        setState(previousState);
        return;
      }
      /*
       * ⚠️ **A person who picks their project means their map** (owner, 2026-08-24). Since the map
       * moved to `<project>/atlas`, two folders became plausible to pick, and this path took
       * whatever it was handed — so picking the project root read the entire source tree as a vault
       * and buried the map that was right there. See `resolve-picked-vault-folder.ts` for why the
       * rule is narrow and why it is never silent.
       */
      const resolvedHandle = await resolveVaultHandle(handle);
      const openHandle = resolvedHandle.handle;
      setOpenedInsidePickedFolder(resolvedHandle.redirectedFrom);
      const now = Date.now();
      await putLocalFsHandle({
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle: openHandle,
        name: openHandle.name,
        createdAt: now,
        lastAccessedAt: now,
      });
      /*
       * ⚠️ **The order is the contract** (caught in review, 2026-08-16).
       *
       * The recent list used to be updated **first**. At that moment "this computer has
       * never opened a vault" becomes false, and that single value **simultaneously removes**
       * the first-run card, the "switch to my data" tile, and the first-run readout from
       * the screen.
       *
       * So when the read on the very next line failed, the surface that would have said so
       * was already gone — the user saw a silent sample map. Add to the list only after
       * success.
       */
      await load(openHandle);
      await refreshRecentVaults();
    } catch (err) {
      // A cancel is not a failure — restore the state from just before the picker (see `isPickerAbort`).
      if (isPickerAbort(err)) {
        setState(previousState);
        return;
      }
      // A "cannot be a vault root" rejection is handled differently from a failure. Leaking
      // the cause string to the screen would show the user `vault-root-rejected:filesystem-root`,
      // and "please try again" is false guidance when every retry gives the same result.
      const rejection = vaultRootRejectionReason(err);
      if (rejection) {
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: null,
          errorCode: 'root-rejected',
        }));
        return;
      }
      // Same reason the hardcoded Korean "Failed to open folder" was removed — null lets
      // LocalVaultPicker fall back to `t('errorFallback')`.
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: toErrorMessage(err),
        errorCode:
          classifyVaultAccessError(err) === 'permission-denied'
            ? 'permission-denied'
            : 'access-failed',
      }));
    }
  }, [load, refreshRecentVaults, state]);

  const openRecent = useCallback(
    async (record: LocalFsHandleRecord) => {
      if (!isSupported()) {
        setState(emptyState('unsupported'));
        return;
      }
      setState((s) => ({
        ...s,
        status: 'opening',
        errorMessage: null,
        errorCode: null,
      }));
      try {
        // Desktop-only path: the stored absolute path *is* the handle, so it reopens with no
        // FSA picker. But if the folder moved or was deleted since the last session, building
        // the manifest throws a raw io error — preflight first so it classifies as a readable
        // 'path-missing' and prompts "choose the folder again".
        if (!(await tauriVaultRecordResolves(record))) {
          setState((s) => ({
            ...s,
            status: 'error',
            errorMessage: null,
            errorCode: 'path-missing',
          }));
          return;
        }
        const resolvedHandle = await resolveVaultHandle(record.handle);
        setOpenedInsidePickedFolder(resolvedHandle.redirectedFrom);
        const resolvedRootPath = getTauriVaultRootPath(resolvedHandle.handle);
        const now = Date.now();
        const nextRecord: LocalFsHandleRecord = {
          ...record,
          id: CURRENT_LOCAL_FS_HANDLE_ID,
          handle: resolvedHandle.handle,
          name: resolvedHandle.handle.name,
          desktopRootPath: resolvedRootPath ?? record.desktopRootPath,
          lastAccessedAt: now,
        };
        await putLocalFsHandle(nextRecord);
        await refreshRecentVaults();
        await load(resolvedHandle.handle);
      } catch (err) {
        // `toErrorMessage` — a Tauri `invoke` rejects with `Err(String)` as a plain string.
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: toErrorMessage(err),
          errorCode:
            classifyVaultAccessError(err) === 'permission-denied'
              ? 'permission-denied'
              : 'access-failed',
        }));
      }
    },
    [load, refreshRecentVaults],
  );

  const forgetRecent = useCallback(
    async (record: LocalFsHandleRecord) => {
      await forgetRecentLocalFsHandle(record);
      await refreshRecentVaults();
    },
    [refreshRecentVaults],
  );

  const close = useCallback(async () => {
    await deleteLocalFsHandle();
    await refreshRecentVaults();
    setState(emptyState(isSupported() ? 'idle' : 'unsupported'));
  }, [refreshRecentVaults]);

  /**
   * User-initiated refresh. An unchanged fingerprint (nothing changed outside) skips the full
   * rebuild but still updates `lastLoadedAt` so the picker's "just scanned" label stays
   * accurate. A failure to compute the fingerprint falls back safely to a full rebuild.
   */
  const refresh = useCallback(async () => {
    if (!state.handle) return;
    const handle = state.handle;
    try {
      /*
       * Take the fingerprint **and the stamps behind it**. Previously only the fingerprint was
       * taken and the stamps discarded, so the incremental rebuild that followed walked the same
       * vault a second time — two native walks per change. Now one.
       */
      const { fingerprint: fp, nativeStamps } =
        await computeLocalVaultFingerprintWithStamps(handle);
      if (fp === lastFingerprintRef.current) {
        const sidecars = await readVaultSidecarStatuses(handle);
        setState((s) => ({ ...s, ...sidecars, lastLoadedAt: Date.now() }));
        return;
      }
      pendingStampsRef.current = nativeStamps;
    } catch {
      /* Fingerprint failed — fall back safely to a full rebuild. */
      pendingStampsRef.current = null;
    }
    try {
      await load(handle);
    } finally {
      // A leftover stamp map reused by the next call would judge against a stale mtime.
      pendingStampsRef.current = null;
    }
  }, [state.handle, load]);

  // Auto-refresh when the tab regains focus, so editing in an IDE and coming back rescans
  // by itself. Debounced by 2 s against duplicate calls. The fingerprint is compared first
  // and an unchanged one skips the full rebuild, which removes the brief freeze on focus
  // with a large vault.
  const autoRefreshRef = useRef<{
    lastAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastAt: 0, timer: null });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    if (state.status !== 'loaded' || !state.handle) return;
    const handle = state.handle;
    const tracker = autoRefreshRef.current;
    // Returns true when a change was detected (a reload was triggered) — drives
    // the adaptive poll cadence (burst after a change, idle when quiet).
    const tryReload = async (): Promise<boolean> => {
      try {
        const fp = await computeLocalVaultFingerprint(handle);
        if (fp === lastFingerprintRef.current) {
          const sidecars = await readVaultSidecarStatuses(handle);
          /*
           * ⚠️ **Nothing changed means state is not touched** (review, 2026-08-16).
           *
           * This used to `setState` a fresh object even on a tick where nothing changed, and
           * the context provider passed that straight through — so **the entire app re-rendered
           * every five seconds**, forever, with nothing happening.
           *
           * `lastLoadedAt` is not read anywhere on screen (a new object was built every tick
           * for it), while the three sidecar states genuinely can change. So update **only when
           * something actually did.**
           */
          setState((s) => {
            const same =
              structurallyEqualStatus(s.agentConfigStatus, sidecars.agentConfigStatus) &&
              // Volatile age fields are excluded — they advance on every parse
              // and defeated this guard whenever a heartbeat file existed.
              structurallyEqualStatus(
                comparableAgentActivityStatus(s.agentActivityStatus),
                comparableAgentActivityStatus(sidecars.agentActivityStatus),
              ) &&
              // Length alone misses an append once the log reaches its 50-entry
              // read cap (tail replaced at identical length) — compare the last
              // entry too.
              s.agentActivityLog.length === sidecars.agentActivityLog.length &&
              structurallyEqualStatus(s.agentActivityLog.at(-1), sidecars.agentActivityLog.at(-1)) &&
              s.acpWorkReceipts.length === sidecars.acpWorkReceipts.length &&
              s.acpWorkReceipts.at(-1)?.updatedAt === sidecars.acpWorkReceipts.at(-1)?.updatedAt;
            return same ? s : { ...s, ...sidecars, lastLoadedAt: Date.now() };
          });
          return false;
        }
      } catch {
        /* Ignore a fingerprint failure — fall back safely to a full rebuild. */
      }
      loadRef.current(handle);
      return true;
    };
    const fire = () => {
      const now = Date.now();
      const last = tracker.lastAt;
      if (now - last < AUTO_REFRESH_DEBOUNCE_MS) {
        if (tracker.timer) clearTimeout(tracker.timer);
        tracker.timer = setTimeout(() => {
          tracker.lastAt = Date.now();
          void tryReload();
        }, AUTO_REFRESH_DEBOUNCE_MS - (now - last));
        return;
      }
      tracker.lastAt = now;
      void tryReload();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fire();
    };
    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisibility);

    // Adaptive self-rescheduling polling while the tab is visible. Focus and visibility alone
    // never refresh while the user is looking at another tab or their IDE. Right after a
    // detected change it bursts (~1.5 s) and decays to idle (5 s) when quiet
    // (`nextPollDelay`); with no change only the fingerprint is compared, so even a burst is
    // nearly free. The generation-token loop (`poll-cadence.createAdaptivePoller`) means an
    // in-flight `tryReload` resolving after a stop/restart — hide→show during a burst — can
    // never re-arm an orphaned second loop. Unit-tested in poll-cadence.test.ts.
    const poller = createAdaptivePoller({ poll: tryReload });
    const startPolling = () => poller.start();
    const stopPolling = () => poller.stop();
    if (document.visibilityState === 'visible') startPolling();
    const onVisibilityForPoll = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    document.addEventListener('visibilitychange', onVisibilityForPoll);

    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('visibilitychange', onVisibilityForPoll);
      stopPolling();
      if (tracker.timer) {
        clearTimeout(tracker.timer);
        tracker.timer = null;
      }
    };
  }, [state.status, state.handle]);

  const requestPermission = useCallback(async () => {
    if (!state.handle) return;
    const result = await verifyRead(state.handle, true);
    if (result === 'granted') {
      await load(state.handle);
    } else {
      setState((s) => ({ ...s, status: 'permission-needed' }));
    }
  }, [state.handle, load]);

  /**
   * Walks a slash path from the root handle (creating as requested) and returns the parent
   * directory handle plus the file name: `foo/bar/baz` → dir = root/foo/bar, name = baz.md.
   */
  const getParentAndName = useCallback(
    async (
      slug: string,
      createIntermediate: boolean,
    ): Promise<{
      parent: FileSystemDirectoryHandle;
      fileName: string;
    } | null> => {
      if (!state.handle) return null;
      // Readwrite permission, secured here because this runs only on write paths.
      await requireWritePermission(state.handle);
      const parts = slug.split('/').filter(Boolean);
      if (parts.length === 0) throw new Error('Empty slug');
      const fileName = `${parts[parts.length - 1]}.md`;
      let parent: FileSystemDirectoryHandle = state.handle;
      for (let i = 0; i < parts.length - 1; i += 1) {
        parent = await parent.getDirectoryHandle(parts[i], {
          create: createIntermediate,
        });
      }
      return { parent, fileName };
    },
    [state.handle, requireWritePermission],
  );

  /**
   * Rewrites one slug's markdown file, requesting readwrite permission first when needed, and
   * rescans the manifest on success.
   *
   * `options.expectedMtime` (the manifest's `doc.mtime`) is compared against the filesystem's
   * `file.lastModified` immediately before the write and throws `VaultConflictError` on an
   * outside change. Omitted, the check is skipped, keeping existing callers working.
   */
  // Slugs the app itself just wrote, so the polling diff toaster does not report its own
  // writes as "added/edited" (the four-toast burst during bootstrap). A one-shot ledger
  // cleared on consumption: only outside changes (an agent, an IDE) become toasts.
  const selfWrittenSlugsRef = useRef<Set<string>>(new Set());
  // The only real data source behind the "last edited · me" fact. Unlike
  // `selfWrittenSlugsRef` this is not cleared on consumption (slug → last self-write time in
  // ms). An mtime alone cannot say *who* changed a file — a git checkout, another editor, or
  // an agent session without a heartbeat all change it — so this records only that this
  // session actually wrote the slug through the local vault write API, and marks "me" for
  // that trustworthy subset only. No guessing.
  const [selfEditTimestamps, setSelfEditTimestamps] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const markSelfWrite = useCallback((slug: string) => {
    selfWrittenSlugsRef.current.add(slug);
    setSelfEditTimestamps((prev) => {
      const next = new Map(prev);
      next.set(slug, Date.now());
      return next;
    });
  }, []);
  const consumeSelfWrittenSlugs = useCallback((): ReadonlySet<string> => {
    const consumed = selfWrittenSlugsRef.current;
    selfWrittenSlugsRef.current = new Set();
    return consumed;
  }, []);

  const saveDoc = useCallback(
    async (
      slug: string,
      content: string,
      options: { expectedMtime?: number } = {},
    ) => {
      const fh = state.fileHandles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      await requireWritePermission(fh);
      const file = await fh.getFile();
      assertExpectedMtime(slug, options.expectedMtime, file.lastModified);
      assertIdentityTransition(await file.text(), content);
      assertNodeIdentityContent(slug, content, state.manifest?.docs ?? []);
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      markSelfWrite(slug);
      // Rescan the whole manifest after a successful save so backlinks and headings follow.
      if (state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, state.manifest, load, requireWritePermission, markSelfWrite],
  );

  /**
   * Creates a new `.md` at the slug path, erroring when one already exists. Intermediate
   * directories are created, and the template content seeds the body.
   */
  const createDoc = useCallback(
    async (slug: string, content: string, opts: { skipRefresh?: boolean } = {}) => {
      if (state.fileHandles.has(slug)) {
        throw new Error(`Document already exists: "${slug}"`);
      }
      assertNodeIdentityContent(slug, content, state.manifest?.docs ?? []);
      const resolved = await getParentAndName(slug, true);
      if (!resolved) throw new Error('Vault is not open');
      try {
        await resolved.parent.getFileHandle(resolved.fileName);
        throw new Error(`Document already exists: "${slug}"`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Document already exists:')) {
          throw error;
        }
        if (!(error instanceof Error) || error.name !== 'NotFoundError') {
          throw error;
        }
      }
      const fh = await resolved.parent.getFileHandle(resolved.fileName, {
        create: true,
      });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      markSelfWrite(slug);
      // `opts.skipRefresh` lets a caller that creates several documents in a row (bootstrap)
      // reload only on the last write — same contract as `updateFrontmatter`.
      if (!opts.skipRefresh && state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, state.manifest, getParentAndName, load, markSelfWrite],
  );

  /**
   * Deletes the file for a slug from local disk. Intermediate directories are deliberately
   * left in place even when empty, since other files may land there.
   */
  const deleteDoc = useCallback(
    async (slug: string) => {
      const resolved = await getParentAndName(slug, false);
      if (!resolved) throw new Error('Vault is not open');
      await resolved.parent.removeEntry(resolved.fileName);
      if (state.handle) await load(state.handle);
    },
    [state.handle, getParentAndName, load],
  );

  /**
   * Updates only some frontmatter keys of a slug's markdown file, preserving the body. Works
   * on our simple frontmatter rules (one `key: value` line, plus inline arrays like
   * `tags`/`projects`); nested objects beyond one level are unsupported.
   *
   * An existing key is replaced, a new one is appended to the end of the frontmatter, and a
   * null value deletes the key.
   *
   * Atomicity is the same path as `saveDoc` (`createWritable` → write). `opts.skipRefresh`
   * skips the refresh so a run of calls does not cause scroll jumps and flicker, and
   * `opts.expectedMtime` is the same conflict guard as `saveDoc`.
   */
  const updateFrontmatter = useCallback(
    async (
      slug: string,
      updates: Record<string, FrontmatterUpdateValue>,
      opts: { skipRefresh?: boolean; expectedMtime?: number } = {},
    ) => {
      const fh = state.fileHandles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      await requireWritePermission(fh);
      const file = await fh.getFile();
      assertExpectedMtime(slug, opts.expectedMtime, file.lastModified);
      const raw = await file.text();
      assertIdentityPatch(raw, updates);
      const next = applyFrontmatterUpdates(raw, updates);
      assertNodeIdentityContent(slug, next, state.manifest?.docs ?? []);
      if (next === raw) return; // nothing changed
      const writable = await fh.createWritable();
      await writable.write(next);
      await writable.close();
      markSelfWrite(slug);
      if (!opts.skipRefresh && state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, state.manifest, load, requireWritePermission, markSelfWrite],
  );

  /**
   * Changes a slug path inside the local vault (rename or move): read the existing content,
   * create at the new location, and remove the original on success. Identical slugs are a no-op.
   *
   * With `rewriteBacklinks=true`, references to `oldSlug` in other markdown bodies
   * (`[[oldSlug]]`, `[text](...oldSlug.md)`) are rewritten to `newSlug`. Best effort — a
   * failure there does not undo the rename.
   */
  const renameDoc = useCallback(
    async (
      oldSlug: string,
      newSlug: string,
      opts: { rewriteBacklinks?: boolean } = {},
    ) => {
      if (oldSlug === newSlug) return;
      /*
       * ⚠️ **Names that differ only in case are the same file** (review 2026-08-16 — reproduced
       * on the MCP side as documents disappearing; this path has the same shape).
       *
       * The collision check below compares Map keys, so it sees `Payments` and `payments` as
       * different. macOS and Windows filesystems see one file, so writing the new name and then
       * deleting the old one **deletes what was just written**.
       *
       * And since this app's `slugify` lowercases, renaming `Payments` to `payments` is ordinary
       * tidying a user does — not a rare case.
       */
      if (oldSlug.toLowerCase() === newSlug.toLowerCase()) {
        throw new Error(`Case-only rename is not supported: "${oldSlug}" → "${newSlug}"`);
      }
      if (state.fileHandles.has(newSlug)) {
        throw new Error(`Document already exists: "${newSlug}"`);
      }
      const oldFh = state.fileHandles.get(oldSlug);
      if (!oldFh) throw new Error(`Local vault: no file handle for "${oldSlug}"`);
      const file = await oldFh.getFile();
      const content = await file.text();
      const newResolved = await getParentAndName(newSlug, true);
      if (!newResolved) throw new Error('Vault is not open');
      const newFh = await newResolved.parent.getFileHandle(
        newResolved.fileName,
        { create: true },
      );
      const writable = await newFh.createWritable();
      await writable.write(content);
      await writable.close();
      const oldResolved = await getParentAndName(oldSlug, false);
      if (oldResolved) {
        await oldResolved.parent.removeEntry(oldResolved.fileName);
      }

      // --- optional cascading backlink rewrite
      if (opts.rewriteBacklinks && state.manifest) {
        /*
         * ⚠️ **Frontmatter relations are the primary graph** (bug sweep
         * 2026-09-01). This block used to rewrite only body `[[wikilink]]` /
         * `](x.md)` forms and select referrers from body-only `linksOut`, so a
         * rename orphaned every frontmatter relation (`dependencies:`,
         * `capabilities:`, …) to the renamed node — backlinks vanished and the
         * graph minted a phantom stub under the old name, unlike MCP
         * `rename_concept`. `rewriteRenamedDocRefs` now applies the same key
         * family and tail rules as the MCP rewrite, and every doc is scanned
         * (reads are free; only actual changes ask for write permission), which
         * also catches referrers `linksOut` missed — a same-directory relative
         * link was previously detected but left dangling by the full-slug regex.
         */
        const { canRewriteTail } = computeRenameRefContext(
          state.manifest.docs.map((d) => d.slug),
          oldSlug,
        );
        for (const doc of state.manifest.docs) {
          if (doc.slug === oldSlug) continue;
          const fh = state.fileHandles.get(doc.slug);
          if (!fh) continue;
          try {
            const srcFile = await fh.getFile();
            const srcText = await srcFile.text();
            const nextText = rewriteRenamedDocRefs(srcText, {
              oldSlug,
              newSlug,
              referrerSlug: doc.slug,
              canRewriteTail,
            });
            if (nextText !== srcText) {
              const perm = await verifyHandlePermission(fh, 'readwrite', {
                ask: true,
              });
              if (perm !== 'granted') continue;
              const w = await fh.createWritable();
              await w.write(nextText);
              await w.close();
              markSelfWrite(doc.slug);
            }
          } catch {
            /* Best effort — skip a file that fails. */
          }
        }
      }

      markSelfWrite(newSlug);
      if (state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, state.manifest, getParentAndName, load, markSelfWrite],
  );

  // Once on mount: try to restore the handle from IDB, and switch to 'unsupported' when the
  // browser lacks FSA (starting from 'idle' keeps SSR consistent).
  useEffect(() => {
    if (!isSupported()) {
      setState((s) => ({ ...s, status: 'unsupported' }));
      setRestoreAttempted(true);
      return;
    }
    let cancelled = false;
    (async () => {
      /*
       * ⚠️ **Whatever happens, this must end** (installed app, 2026-08-24).
       *
       * `RootEntryPage` holds a neutral boot frame until `restoreAttempted` turns true. This body
       * had no `catch` and no `finally`, so any rejection along the way left that flag false and
       * the app sat on 「moving to the local docs picker」 **forever** — no error, no way out, and
       * the person had touched nothing.
       *
       * It is not hypothetical. A vault under a macOS-protected folder (Downloads, Documents,
       * Desktop) whose access prompt was dismissed makes the Tauri read fail, and that is exactly
       * what happened here. Note the asymmetry it exposed: a folder that is **gone** already
       * reported honestly (`path-missing` → 「that folder could not be found, choose another」),
       * while a folder that is **there but unreadable** reported nothing at all. The second is the
       * more common case and it had the worse answer.
       *
       * So the flag is set in `finally`, and a failure carries `access-failed` — the code the
       * first-run screen already turns into a sentence with somewhere to go.
       */
      const record = await getLocalFsHandle();
      await refreshRecentVaults();
      if (!record) {
        return;
      }
      if (cancelled) return;
      const storedHandle = record.handle;
      void touchLocalFsHandle();
      const permission = await verifyRead(storedHandle, false);
      if (cancelled) return;
      if (permission === 'granted') {
        // (Desktop) The common silent failure of auto-restore: the stored vault folder moved or
        // was deleted while the app was closed. Preflight first so it classifies as
        // 'path-missing' and the picker says the folder is gone and to choose again, instead of
        // a raw io error thrown from inside `load`.
        if (!(await tauriVaultRecordResolves(record))) {
          if (!cancelled) {
            setState({
              status: 'error',
              handle: storedHandle,
              manifest: null,
              agentConfigStatus: null,
              agentActivityStatus: emptyAgentActivityStatus(),
              agentActivityLog: [],
              acpWorkReceipts: [],
              fileHandles: new Map(),
              imageHandles: new Map(),
    sourceHandles: new Map(),
              errorMessage: null,
              errorCode: 'path-missing',
              lastLoadedAt: null,
              manifestHandle: null,
            });
          }
          return;
        }
        const resolvedHandle = await resolveVaultHandle(storedHandle);
        if (cancelled) return;
        setOpenedInsidePickedFolder(resolvedHandle.redirectedFrom);
        if (resolvedHandle.redirectedFrom) {
          const now = Date.now();
          await putLocalFsHandle({
            ...record,
            id: CURRENT_LOCAL_FS_HANDLE_ID,
            handle: resolvedHandle.handle,
            name: resolvedHandle.handle.name,
            desktopRootPath:
              getTauriVaultRootPath(resolvedHandle.handle) ?? record.desktopRootPath,
            lastAccessedAt: now,
          });
          await refreshRecentVaults();
        }
        await load(resolvedHandle.handle);
      } else {
        setState({
          status: 'permission-needed',
          handle: storedHandle,
          manifest: null,
          agentConfigStatus: null,
          agentActivityStatus: emptyAgentActivityStatus(),
          agentActivityLog: [],
          acpWorkReceipts: [],
          fileHandles: new Map(),
          imageHandles: new Map(),
    sourceHandles: new Map(),
          errorMessage: null,
          errorCode: null,
          lastLoadedAt: null,
          manifestHandle: null,
        });
      }
    })()
      .catch((error: unknown) => {
        if (cancelled) return;
        /*
         * ⚠️ **A folder that is gone must say so on the web too** (census, 2026-08-31). The desktop
         * preflights the stored absolute path and reports `path-missing`; a browser has no path to
         * preflight, so the folder's disappearance arrives only as a `NotFoundError` thrown out of
         * the File System Access API. That fell into `access-failed`, and its developer sentence
         * ("A requested file or directory could not be found…") was then printed verbatim on a
         * Korean screen. Reading the exception gives both runtimes one code for one fact.
         */
        const missing = isMissingFolderError(error);
        setState({
          status: 'error',
          handle: null,
          manifest: null,
          agentConfigStatus: null,
          agentActivityStatus: emptyAgentActivityStatus(),
          agentActivityLog: [],
          acpWorkReceipts: [],
          fileHandles: new Map(),
          imageHandles: new Map(),
    sourceHandles: new Map(),
          // `path-missing` deliberately carries no cause string: the screen owns that sentence.
          errorMessage: missing ? null : error instanceof Error ? error.message : String(error),
          // Every path that can meet a protected folder classifies the same way; otherwise the app
          // says different things about one fact depending on how the person arrived at it.
          errorCode:
            classifyVaultAccessError(error) === 'permission-denied'
              ? 'permission-denied'
              : missing
                ? 'path-missing'
                : 'access-failed',
          lastLoadedAt: null,
          manifestHandle: null,
        });
      })
      .finally(() => {
        if (!cancelled) setRestoreAttempted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load, refreshRecentVaults]);

  /**
   * Writes the ontology starter markdown files, and seeds `.mcp.json` / `.codex` config only
   * when the bundled agent server is actually installable — an unrunnable config is never
   * planted silently. Existing files are skipped rather than overwritten, so calling this on
   * an existing vault is safe.
   *
   * `starterLocale` decides the language of the starter bodies: a vault created from a screen
   * in one language should read in that language. The file set and the frontmatter are
   * locale-independent, so any language produces the same graph (a contract test proves it).
   *
   * The locale is a **required argument**. With a default of `'en'`, two of the four creation
   * paths passed nothing and a vault created from a Korean screen was seeded with English
   * bodies (walkthrough 2026-07-26). Removing the default makes the type demand a locale from
   * any new call site, so the same drift cannot reopen. An unknown locale is downgraded to EN
   * by `starterFilesForLocale`.
   */
  /**
   * Write the starter for the parts a person chose (`VaultShape`): the map's starter
   * nodes and skills, the wiki's template, or both. Every folder of the fixed shape is
   * created either way — `domains/`, `capabilities/`, `elements/`, `sources/`, `wiki/` —
   * so the folder a teammate pulls always has the same tree, and "start the map" or
   * "start a wiki" later only adds the files that make that part real.
   */
  const scaffoldOntology = useCallback(async (starterLocale: string, shape: VaultShape = { map: true, wiki: true }) => {
    if (!state.handle) {
      throw new Error('Vault is not open');
    }
    const vaultHandle = state.handle;
    await requireWritePermission(vaultHandle);
    // Count the two kinds **separately**. They used to be summed into one `created`, so the
    // toast said "8 starter documents" while the real ontology concept count was 5 and the
    // settings panel said "5 documents" — two screens giving different numbers for one vault.
    let markdownCreated = 0;
    let skipped = 0;
    for (const { relPath, content } of shape.map ? materializeStarterFiles(starterLocale) : []) {
      // The slug is the path with the `.md` extension removed, per createDoc / saveDoc rules.
      const slug = relPath.replace(/\.md$/, '');
      if (state.fileHandles.has(slug)) {
        skipped += 1;
        continue;
      }
      try {
        const resolved = await getParentAndName(slug, true);
        if (!resolved) continue;
        const fh = await resolved.parent.getFileHandle(resolved.fileName, {
          create: true,
        });
        const writable = await fh.createWritable();
        await writable.write(content);
        await writable.close();
        markdownCreated += 1;
      } catch {
        skipped += 1;
      }
    }
    /*
     * The agent guide — **config alone is not enough** (measured 2026-08-17). Even with MCP
     * connected, the agent read frontmatter directly with `sed` and `grep` (zero MCP calls).
     * Putting `AGENTS.md` in the vault made it call `list_concepts` for the same question
     * immediately. Evidence: the `VAULT_AGENT_GUIDE_PATH` comment in `ontology-starter.ts`.
     *
     * **Not counted in `markdownCreated`**, because it is not a concept and that number is
     * rendered as "N concept documents".
     */
    let guideCreated = 0;
    for (const guide of [
      vaultAgentGuideForLocale(starterLocale),
      // Claude Code does not read `AGENTS.md` directly; it goes through `CLAUDE.md`'s import.
      // With only one of them, one of the two runtimes gets no guide at all.
      vaultClaudeBridgeForLocale(starterLocale),
      /*
       * The procedural skill set. Where the guide says *what to call*, these say *in what order
       * and where to stop*. The vault is the agent's working folder, so they appear directly in
       * its `/` listing — evidence: the `VAULT_SKILL_NAMES` comment in `ontology-starter.ts`.
       */
      ...(shape.map ? vaultSkillFilesForLocale(starterLocale) : []),
      /*
       * The wiki's furniture. The vault shape is one folder with `sources/` and `wiki/`
       * always (ledger, 2026-09-06), and the CLI's `init` writes the page template into
       * every new vault; a folder the app started used to lack it, so the two doors left
       * two shapes. The template is the same string the validator enforces.
       */
      ...(shape.wiki ? [{ relPath: 'wiki/_template.md', content: WIKI_PAGE_TEMPLATE }] : []),
    ]) {
      try {
        const resolved = await getParentAndName(guide.relPath.replace(/\.md$/, ''), true);
        if (!resolved) continue;
        const existing = await resolved.parent
          .getFileHandle(resolved.fileName)
          .then(() => true)
          .catch(() => false);
        if (existing) {
          skipped += 1;
          continue;
        }
        const fh = await resolved.parent.getFileHandle(resolved.fileName, { create: true });
        const writable = await fh.createWritable();
        await writable.write(guide.content);
        await writable.close();
        guideCreated += 1;
      } catch {
        skipped += 1;
      }
    }
    // `sources/` from the first minute, in both shapes, so the folder says where files go.
    for (const folder of ['domains', 'capabilities', 'elements', 'sources', 'wiki']) {
      try {
        await state.handle?.getDirectoryHandle(folder, { create: true });
      } catch {
        // A folder that cannot be made is reported by the first file written into it.
      }
    }
    try {
      await state.handle?.getDirectoryHandle('sources', { create: true });
    } catch {
      // A folder that refuses a directory still has its pages; the Library creates it on Add files.
    }

    // Ready-to-use agent configs for "open the vault folder itself" flows.
    // Fail closed when the bundled server cannot be found: write the markdown starter only.
    const starterLaunch = await resolveBundledLaunch();
    const agentConfigResult = starterLaunch
      ? await writeAgentConfigFiles(vaultHandle, starterLaunch)
      : { created: 0, skipped: 0 };
    skipped += agentConfigResult.skipped;
    await load(vaultHandle);
    return {
      /** Markdown files that become ontology nodes — the same unit the map and settings count. */
      markdownCreated,
      /** Agent config files such as `.mcp.json`. Not concepts. */
      agentConfigCreated: agentConfigResult.created + guideCreated,
      /** Backwards-compatible total. When shown to a user, state the two above separately. */
      created: markdownCreated + agentConfigResult.created + guideCreated,
      skipped,
    };
  }, [
    state.fileHandles,
    state.handle,
    getParentAndName,
    load,
    requireWritePermission,
  ]);

  /**
   * The write the "connect" button performs — it takes the client and writes **only that
   * client's file**.
   *
   * Omitting `client` (the starter-vault scaffold) still writes all of them. The label there is
   * "start with a new folder", not "connect", and laying down one full set of configs is what
   * that label promises — two uses of one function, not one contract.
   */
  const ensureAgentConfigs = useCallback(async (client?: AgentClientId) => {
    if (!state.handle) {
      throw new Error('Vault is not open');
    }
    const vaultHandle = state.handle;
    await requireWritePermission(vaultHandle);
    const launch = await resolveBundledLaunch();
    if (!launch) {
      throw new Error(
        'The bundled MCP server is not available here — open this vault in the installed app.',
      );
    }
    const result = await writeAgentConfigFiles(
      vaultHandle,
      launch,
      client ? filesForClient(client) : undefined,
    );
    await load(vaultHandle);
    return result;
  }, [state.handle, load, requireWritePermission]);

  return {
    status: state.status,
    handle: state.handle,
    manifest: state.manifest,
    agentConfigStatus: state.agentConfigStatus,
    agentActivityStatus: state.agentActivityStatus,
    agentActivityLog: state.agentActivityLog,
    acpWorkReceipts: state.acpWorkReceipts,
    recentVaults,
    fileHandles: state.fileHandles,
    imageHandles: state.imageHandles,
    sourceHandles: state.sourceHandles,
    errorMessage: state.errorMessage,
    errorCode: state.errorCode,
    lastLoadedAt: state.lastLoadedAt,
    /**
     * Is this **a re-read of the same folder**? A save, or a rescan after the tab regains focus.
     *
     * Why it is exposed: a consumer that returns empty on `status !== 'loaded'` makes the whole
     * screen blank and come back on every save. Measured 2026-07-26: right after an inline save
     * the entire insights tab vanished, and the "saved" confirmation on the component unmounted
     * in that frame was never seen at all. Re-reading does not mean there is no data — showing
     * what was there a moment ago is the honest thing to do meanwhile. It is false while
     * **switching** folders, so the previous folder is never drawn as if it were the new one.
     */
    isReloadingSameVault:
      state.status === 'loading' &&
      state.manifest !== null &&
      state.manifestHandle === state.handle,
    restoreAttempted,
    /** The folder the person picked, when the map inside it was opened instead. Screens must say so. */
    openedInsidePickedFolder,
    /**
     * Clears that notice once it has been read.
     *
     * ⚠️ A one-time fact must not become permanent furniture. It is set when the substitution
     * happens and nothing else clears it, so without this the line sits in the panel for the rest of
     * the session, long after it has told the person everything it knows.
     */
    dismissOpenedInsideNotice: () => setOpenedInsidePickedFolder(null),
    // Derived from state to stay SSR-consistent (avoiding an `isSupported()` call in the lazy
    // initializer). The switch to 'unsupported' happens in a mount effect.
    isSupported: state.status !== 'unsupported',
    open,
    openRecent,
    forgetRecent,
    close,
    refresh,
    requestPermission,
    saveDoc,
    createDoc,
    deleteDoc,
    renameDoc,
    scaffoldOntology,
    ensureAgentConfigs,
    updateFrontmatter,
    consumeSelfWrittenSlugs,
    selfEditTimestamps,
  };
}
