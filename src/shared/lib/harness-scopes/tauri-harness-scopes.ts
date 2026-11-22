/**
 * Agent settings from every scope: the bridge over `src-tauri/src/harness_scopes/`. Rust opens a
 * constant list of files plus files the person picked, and returns only hook entries, two switches
 * and permission-rule counts; no `env` value, helper, `http` address or header, prompt or rule
 * text crosses this bridge. A browser cannot read a home or dot folder, so on the web both calls
 * return `null` without invoking.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';

export type ScopeTool = 'claude-code' | 'codex';
export type ScopeName = 'user' | 'project' | 'local' | 'managed' | 'system';
export type ScopePlatform = 'macos' | 'linux' | 'windows';
export type ScopeFileStatus = 'read' | 'missing' | 'invalid' | 'unreadable';
export type ScopeOpenFailure =
  | 'link'
  | 'not-a-file'
  | 'not-a-folder'
  | 'permission-denied'
  | 'too-large'
  | 'io';
/** `other` covers a missing or unknown `type`. Only a `command` hook carries its command. */
export type ScopeHookKind = 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent' | 'other';

export interface ScopeHook {
  event: string;
  /** Position of the group in the event's array, then of the handler in the group's `hooks`. */
  group: number;
  handler: number;
  matcher: string | null;
  kind: ScopeHookKind;
  command: string | null;
  timeoutSeconds: number | null;
  async: boolean | null;
}

export interface ScopePermissionCounts {
  allow: number;
  deny: number;
  ask: number;
}

export interface ScopeFile {
  /** `claude-user`, `codex-project`, …, or `picked-<n>` for a file the person picked. */
  id: string;
  tool: ScopeTool;
  scope: ScopeName;
  /** Absolute path as shown on screen. */
  path: string;
  picked: boolean;
  status: ScopeFileStatus;
  /** Why an `unreadable` file could not be opened; `null` otherwise. */
  failure: ScopeOpenFailure | null;
  bytes: number | null;
  modifiedMs: number | null;
  hooks: ScopeHook[];
  disableAllHooks: boolean | null;
  allowManagedHooksOnly: boolean | null;
  permissionCounts: ScopePermissionCounts | null;
}

/** Codex hooks defined in a `config.toml`, named by event only. */
export interface ScopeInlineHooks {
  id: 'codex-project-config' | 'codex-user-config';
  tool: 'codex';
  scope: 'project' | 'user';
  path: string;
  status: ScopeFileStatus;
  failure: ScopeOpenFailure | null;
  events: string[];
}

export interface HarnessScopes {
  platform: ScopePlatform;
  /** The connected folder's absolute path. */
  repository: string;
  files: ScopeFile[];
  inlineHooks: ScopeInlineHooks[];
  worktree: {
    linked: boolean;
    /** The connected worktree's own Local file, when it exists and Claude Code reads another. */
    unusedLocalFile: string | null;
  };
  /** Git's view of the Local file Claude Code reads; `null` outside a work tree. */
  localFileGit: { tracked: boolean; ignored: boolean } | null;
}

export type PickRefusal = 'name' | 'link' | 'not-a-file' | 'in-repository' | 'too-many' | 'unreadable';

export type PickOutcome =
  | { outcome: 'held'; id: string; path: string }
  | { outcome: 'cancelled' }
  | { outcome: 'already-listed'; path: string }
  | { outcome: 'refused'; reason: PickRefusal; path: string; repository?: string };

export function isHarnessScopesAvailable(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

export async function readHarnessScopes(
  vaultPath: string,
  projectSlug: string,
): Promise<HarnessScopes | null> {
  if (!isHarnessScopesAvailable()) return null;
  return invoke<HarnessScopes>('read_harness_scopes', { vaultPath, projectSlug });
}

/** Opens the system file picker; Rust holds the chosen file until the app closes. */
export async function pickHarnessScopeFile(dialogTitle: string): Promise<PickOutcome | null> {
  if (!isHarnessScopesAvailable()) return null;
  return invoke<PickOutcome>('pick_harness_scope_file', { dialogTitle });
}
