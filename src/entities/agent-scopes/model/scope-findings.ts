import type {
  HarnessScopes,
  ScopeFile,
  ScopeHook,
  ScopeTool,
} from '@/shared/lib/harness-scopes/tauri-harness-scopes';

import { scopeHeadings } from './scope-headings';

/**
 * The program Work status adds to an agent's hooks. It must match the helper's file name once
 * Work status ships it.
 */
export const WORK_STATUS_HELPER_NAME = 'ontology-atlas-agent-state';

/** Facts drawn as a line; each holds only when the files show it. */
export type ScopeFinding =
  | { kind: 'outside'; count: number; first: { fileId: string; hookKey: string } }
  | { kind: 'tool-gap'; blocking: ScopeTool; unblocked: ScopeTool }
  | { kind: 'all-off'; fileId: string; path: string }
  | { kind: 'managed-only'; skippedCount: number }
  | { kind: 'local-tracked'; path: string }
  | { kind: 'worktree-local'; folder: string; readFile: string; unusedFile: string }
  | { kind: 'codex-inline'; fileId: string; path: string; events: readonly string[] };

/** Facts drawn on one hook's row. */
export type ScopeHookTag =
  | { kind: 'two-files'; tool: ScopeTool; otherPaths: readonly string[] }
  | { kind: 'work-status' };

export interface ScopeFindings {
  lines: ScopeFinding[];
  /** Keyed by `scopeHookKey`. */
  tags: ReadonlyMap<string, readonly ScopeHookTag[]>;
}

export function scopeHookKey(fileId: string, hook: Pick<ScopeHook, 'event' | 'group' | 'handler'>): string {
  return `${fileId}:${hook.event}:${hook.group}:${hook.handler}`;
}

const OUTSIDE_SCOPES = new Set(['user', 'managed', 'system']);
/** Claude Code takes `disableAllHooks` from the highest of these that sets it. */
const DISABLE_ALL_ORDER = ['claude-managed', 'claude-local', 'claude-project', 'claude-user'];

function programName(command: string): string {
  const trimmed = command.trim();
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : null;
  const program = quote
    ? trimmed.slice(1, trimmed.indexOf(quote, 1) < 0 ? undefined : trimmed.indexOf(quote, 1))
    : (trimmed.split(/\s+/)[0] ?? '');
  const name = program.split(/[\\/]/).pop() ?? '';
  return name.replace(/\.exe$/i, '');
}

export function isWorkStatusHook(hook: ScopeHook): boolean {
  return hook.kind === 'command' && hook.command !== null && programName(hook.command) === WORK_STATUS_HELPER_NAME;
}

function outsideFinding(scopes: HarnessScopes): ScopeFinding | null {
  const outside = scopeHeadings(scopes, (_hook, file) => OUTSIDE_SCOPES.has(file.scope));
  const count = outside.reduce((total, heading) => total + heading.hooks.length, 0);
  const first = outside.find((heading) => heading.hooks.length > 0);
  if (count === 0 || !first) return null;
  return {
    kind: 'outside',
    count,
    first: { fileId: first.file.id, hookKey: scopeHookKey(first.file.id, first.hooks[0]!) },
  };
}

function toolGapFinding(
  scopes: HarnessScopes,
  isGuardrailEvent: (event: string) => boolean,
): ScopeFinding | null {
  const readFiles = scopes.files.filter((file) => file.status === 'read');
  const blocks = (tool: ScopeTool) =>
    readFiles.some((file) => file.tool === tool && file.hooks.some((hook) => isGuardrailEvent(hook.event)));
  const present = (tool: ScopeTool) => readFiles.some((file) => file.tool === tool);
  if (!present('claude-code') || !present('codex')) return null;
  const [claude, codex] = [blocks('claude-code'), blocks('codex')];
  if (claude === codex) return null;
  return claude
    ? { kind: 'tool-gap', blocking: 'claude-code', unblocked: 'codex' }
    : { kind: 'tool-gap', blocking: 'codex', unblocked: 'claude-code' };
}

function allOffFinding(files: readonly ScopeFile[]): ScopeFinding | null {
  for (const id of DISABLE_ALL_ORDER) {
    const file = files.find((candidate) => candidate.id === id);
    if (file?.disableAllHooks == null) continue;
    return file.disableAllHooks ? { kind: 'all-off', fileId: file.id, path: file.path } : null;
  }
  return null;
}

function managedOnlyFinding(files: readonly ScopeFile[]): ScopeFinding | null {
  const managed = files.find((file) => file.id === 'claude-managed');
  if (managed?.allowManagedHooksOnly !== true) return null;
  const skippedCount = files
    .filter((file) => file.tool === 'claude-code' && file.scope !== 'managed')
    .reduce((total, file) => total + file.hooks.length, 0);
  return { kind: 'managed-only', skippedCount };
}

function localFindings(scopes: HarnessScopes): ScopeFinding[] {
  const local = scopes.files.find((file) => file.id === 'claude-local');
  const out: ScopeFinding[] = [];
  const git = scopes.localFileGit;
  if (local && local.status !== 'missing' && git && (git.tracked || !git.ignored)) {
    out.push({ kind: 'local-tracked', path: local.path });
  }
  if (local && scopes.worktree.unusedLocalFile) {
    out.push({
      kind: 'worktree-local',
      folder: scopes.repository,
      readFile: local.path,
      unusedFile: scopes.worktree.unusedLocalFile,
    });
  }
  return out;
}

function hookTags(files: readonly ScopeFile[]): Map<string, ScopeHookTag[]> {
  const tags = new Map<string, ScopeHookTag[]>();
  const add = (key: string, tag: ScopeHookTag) => tags.set(key, [...(tags.get(key) ?? []), tag]);
  const sameHook = new Map<string, { file: ScopeFile; hook: ScopeHook }[]>();
  for (const file of files) {
    for (const hook of file.hooks) {
      if (isWorkStatusHook(hook)) add(scopeHookKey(file.id, hook), { kind: 'work-status' });
      if (hook.kind !== 'command') continue;
      const identity = JSON.stringify([file.tool, hook.event, hook.matcher ?? '', hook.command]);
      sameHook.set(identity, [...(sameHook.get(identity) ?? []), { file, hook }]);
    }
  }
  for (const entries of sameHook.values()) {
    const paths = [...new Set(entries.map(({ file }) => file.path))];
    if (paths.length < 2) continue;
    for (const { file, hook } of entries) {
      add(scopeHookKey(file.id, hook), {
        kind: 'two-files',
        tool: file.tool,
        otherPaths: paths.filter((path) => path !== file.path),
      });
    }
  }
  return tags;
}

/** `isGuardrailEvent` names the events whose hooks can stop an action, as Setup's categories do. */
export function scopeFindings(
  scopes: HarnessScopes,
  isGuardrailEvent: (event: string) => boolean,
): ScopeFindings {
  const lines = [
    outsideFinding(scopes),
    toolGapFinding(scopes, isGuardrailEvent),
    allOffFinding(scopes.files),
    managedOnlyFinding(scopes.files),
    ...localFindings(scopes),
    ...scopes.inlineHooks
      .filter((config) => config.events.length > 0)
      .map(
        (config): ScopeFinding => ({
          kind: 'codex-inline',
          fileId: config.id,
          path: config.path,
          events: config.events,
        }),
      ),
  ].filter((finding): finding is ScopeFinding => finding !== null);
  return { lines, tags: hookTags(scopes.files) };
}
