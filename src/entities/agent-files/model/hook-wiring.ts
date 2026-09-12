/**
 * **What a repository's hook configuration says, and the exact limit of what that proves.**
 *
 * A hook is the only part of a harness that can *stop* an agent rather than advise it, which is
 * why a person reads a hook row as a guarantee. Almost nothing about that guarantee is readable
 * from files:
 *
 * - **Wired** — the script the config names exists on disk. This is the whole claim. It is worth
 *   making because the opposite is a real, measured failure: a `settings.json` entry whose path
 *   does not resolve produces no block and no error, just a non-blocking status code, and the
 *   guard disappears in silence.
 * - **Not readable** — whether the hook fires, whether it blocks, and, for Codex, whether a person
 *   has approved it in `/hooks`. Codex hashes each entry and refuses to run a new or changed one
 *   until it is trusted; that approval is session state, in no file. This repository measured the
 *   consequence on 2026-09-02: its Codex `PostToolUse` and `Stop` mirrors were silent for that
 *   reason alone while every file on disk looked correct.
 *
 * So `wired` never renders as a green check, and the Codex row carries the approval fact as text.
 */

/** Where a hook command's script lives, and whether we could resolve a path at all. */
interface HookScriptRef {
  /** The repo-relative script path, or `null` when the command runs something we cannot resolve. */
  path: string | null;
  /** The command as written, kept so the screen can show what it actually tried. */
  command: string;
}

interface HookFact {
  /** Lifecycle events this script answers, joined with ` · `. The tool's own word, untranslated. */
  events: string;
  ref: HookScriptRef;
  /**
   * `wired` — the script exists. `missing` — it does not, and the guard is silently absent.
   * `unresolved` — the command is not a script path we can test, so we say that instead of
   * guessing either way.
   */
  status: 'wired' | 'missing' | 'unresolved';
}

export interface HookConfigFacts {
  /** The config file read, e.g. `.claude/settings.json`. */
  configPath: string;
  hooks: readonly HookFact[];
  /**
   * The tool gates execution behind an approval this app cannot read. Present for Codex; the
   * screen prints it as a standing fact beside every hook in the group.
   */
  approvalGate: boolean;
}

/**
 * The repo-relative script a hook command runs.
 *
 * `${CLAUDE_PROJECT_DIR:-.}/` is the documented way to write a project-absolute path in Claude's
 * settings, so it is stripped to get back to something the filesystem can be asked about. When the
 * command is not a script invocation at all, the answer is `null` — "we could not resolve this",
 * which the screen prints rather than dropping the row.
 */
export function hookScriptPath(command: string): string | null {
  const match = command.match(/[\w./${}:@-]*\.(?:sh|mjs|cjs|js|py)\b/);
  if (!match) return null;
  const raw = match[0]
    .replace(/^\$\{CLAUDE_PROJECT_DIR:-\.\}\//, '')
    .replace(/^\$CLAUDE_PROJECT_DIR\//, '')
    .replace(/^\.\//, '');
  // A path still carrying an unexpanded variable cannot be tested against the filesystem.
  return raw.includes('$') || raw.length === 0 ? null : raw;
}

/**
 * `{ event, command }` pairs out of a Claude `settings.json` or a Codex `hooks.json`.
 *
 * Both formats nest the same way: `hooks` → event → matchers → commands. Codex repeats one script
 * across three matchers for a single Bash call, so the caller de-duplicates by script; counting
 * config entries would report thirty hooks where ten scripts exist.
 */
export function parseHookConfig(text: string): Array<{ event: string; command: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const hooks = (parsed as { hooks?: unknown } | null)?.hooks;
  if (!hooks || typeof hooks !== 'object') return [];
  const out: Array<{ event: string; command: string }> = [];
  for (const [event, matchers] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      const list = (matcher as { hooks?: unknown } | null)?.hooks;
      if (!Array.isArray(list)) continue;
      for (const hook of list) {
        const command = (hook as { command?: unknown } | null)?.command;
        if (typeof command === 'string' && command.trim()) out.push({ event, command });
      }
    }
  }
  return out;
}

/**
 * Turns one hook config into per-script facts. `scriptExists` is the only outside question asked,
 * and it is asked once per distinct script.
 */
export async function collectHookFacts(
  configPath: string,
  configText: string,
  scriptExists: (path: string) => Promise<boolean>,
  options: { approvalGate: boolean },
): Promise<HookConfigFacts> {
  const byScript = new Map<string, { events: string[]; ref: HookScriptRef }>();
  for (const entry of parseHookConfig(configText)) {
    const path = hookScriptPath(entry.command);
    const key = path ?? `command:${entry.command}`;
    const existing = byScript.get(key);
    if (existing) {
      if (!existing.events.includes(entry.event)) existing.events.push(entry.event);
      continue;
    }
    byScript.set(key, { events: [entry.event], ref: { path, command: entry.command } });
  }

  const hooks: HookFact[] = [];
  for (const { events, ref } of byScript.values()) {
    const status: HookFact['status'] = ref.path === null
      ? 'unresolved'
      : (await scriptExists(ref.path)) ? 'wired' : 'missing';
    hooks.push({ events: events.join(' · '), ref, status });
  }
  hooks.sort((a, b) => (a.ref.path ?? a.ref.command).localeCompare(b.ref.path ?? b.ref.command));

  return { configPath, hooks, approvalGate: options.approvalGate };
}

/** Scripts actually found on disk across every config — the sentence's hook half. */
export function wiredHookCount(groups: readonly HookConfigFacts[]): number {
  return groups.reduce(
    (sum, group) => sum + group.hooks.filter((hook) => hook.status === 'wired').length,
    0,
  );
}
