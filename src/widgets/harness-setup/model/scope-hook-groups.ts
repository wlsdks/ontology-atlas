import { hookEventStep, type HookEventStep } from '@/entities/agent-files';
import { scopeHeadings, scopeHookKey, type ScopeHeading } from '@/entities/agent-scopes';
import type { HarnessScopes, ScopeFile, ScopeHook } from '@/shared/lib/harness-scopes/tauri-harness-scopes';

import type { SetupGroupId, SetupItem, ToolFilter } from './harness-setup';

/**
 * Setup's hook categories when the app has read every scope: each category lists the hooks of
 * every settings file under that file's heading, not only the repository's. Pure.
 */

export const SCOPE_HOOK_GROUPS: Readonly<Record<HookEventStep, SetupGroupId>> = Object.freeze({
  context: 'contextHooks',
  guardrails: 'blockingHooks',
  verification: 'hooks',
  other: 'otherHooks',
});

const HOOK_GROUP_IDS: ReadonlySet<SetupGroupId> = new Set(Object.values(SCOPE_HOOK_GROUPS));

export function isHookGroup(id: SetupGroupId): boolean {
  return HOOK_GROUP_IDS.has(id);
}

/** The selection key of one hook under its file, distinct from a report item's key. */
export function scopeOptionKey(file: ScopeFile, hook: ScopeHook): string {
  return `scope:${scopeHookKey(file.id, hook)}`;
}

export interface ScopeHookGroup {
  headings: ScopeHeading[];
  count: number;
}

/** O(files × hooks) per category. */
export function scopeHookGroups(scopes: HarnessScopes, filter: ToolFilter): Map<SetupGroupId, ScopeHookGroup> {
  const out = new Map<SetupGroupId, ScopeHookGroup>();
  for (const [step, id] of Object.entries(SCOPE_HOOK_GROUPS) as Array<[HookEventStep, SetupGroupId]>) {
    const headings = scopeHeadings(
      scopes,
      (hook, file) => (filter === null || file.tool === filter) && hookEventStep(hook.event) === step,
    ).filter(({ file }) => filter === null || file.tool === filter);
    const count = headings.reduce((sum, heading) => sum + heading.hooks.length, 0);
    if (count > 0) out.set(id, { headings, count });
  }
  return out;
}

/** The program a command hook runs, as its row names it: a script's file name, else the command. */
export function hookLabel(hook: ScopeHook): string {
  if (hook.kind !== 'command' || !hook.command) return hook.kind;
  const tokens = hook.command.trim().split(/\s+/);
  const script = tokens.find((token) => /\.(?:sh|bash|zsh|py|js|mjs|cjs|ts|rb|ps1)$/i.test(token.replace(/["']/g, '')));
  const chosen = (script ?? tokens[0] ?? hook.command).replace(/["']/g, '');
  return chosen.split(/[\\/]/).pop() || hook.command;
}

/** The script path a command names, or the whole command, for the detail's title. */
export function hookTitle(hook: ScopeHook): string {
  if (hook.kind !== 'command' || !hook.command) return hook.kind;
  const script = hook.command
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["']/g, ''))
    .find((token) => /\.(?:sh|bash|zsh|py|js|mjs|cjs|ts|rb|ps1)$/i.test(token));
  return script ?? hook.command;
}

/** A path as a person reads it: inside the repository relative to it, inside the home folder from `~`. */
export function displayPath(path: string, scopes: HarnessScopes): string {
  const repository = scopes.repository.replace(/[\\/]+$/, '');
  if (path.startsWith(`${repository}/`) || path.startsWith(`${repository}\\`)) return path.slice(repository.length + 1);
  const home = homeFolder(scopes);
  if (home && (path.startsWith(`${home}/`) || path.startsWith(`${home}\\`))) return `~${path.slice(home.length)}`;
  return path;
}

function homeFolder(scopes: HarnessScopes): string | null {
  for (const id of ['claude-user', 'codex-user']) {
    const file = scopes.files.find((entry) => entry.id === id);
    const match = file ? /^(.*?)[\\/]\.(?:claude|codex)[\\/][^\\/]+$/.exec(file.path) : null;
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * The report's row for a hook in the repository's own file, so a missing script found by the scan
 * still marks the hook. Matched on the config path, the event and the script the command names.
 */
export function reportItemFor(
  file: ScopeFile,
  hook: ScopeHook,
  scopes: HarnessScopes,
  items: ReadonlyMap<string, SetupItem>,
): SetupItem | null {
  if (file.picked || (file.scope !== 'project' && file.scope !== 'local')) return null;
  const configPath = displayPath(file.path, scopes).replace(/\\/g, '/');
  for (const item of items.values()) {
    if (item.namedBy !== configPath || !item.events?.split(' · ').includes(hook.event)) continue;
    if (hook.command?.includes(item.label)) return item;
  }
  return null;
}
