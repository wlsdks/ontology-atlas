/**
 * `wired` only means the configured script exists; whether a hook fires or blocks, and Codex's
 * `/hooks` approval, are session state no file shows. So `wired` is never drawn as a pass.
 */

interface HookScriptRef {
  /** Repo-relative script path, or `null` when unresolvable. */
  path: string | null;
  /** As written, so the screen shows what it tried. */
  command: string;
}

interface HookFact {
  /** Events joined with ` · `, untranslated. */
  events: string;
  ref: HookScriptRef;
  /** `missing`: the guard is silently absent; `unresolved`: not a testable script path. */
  status: 'wired' | 'missing' | 'unresolved';
}

export interface HookConfigFacts {
  /** e.g. `.claude/settings.json`. */
  configPath: string;
  hooks: readonly HookFact[];
  /** The tool gates execution on an approval this app cannot read (Codex). */
  approvalGate: boolean;
}

/** Strips `${CLAUDE_PROJECT_DIR:-.}/`; `null` when the command is not a script invocation. */
export function hookScriptPath(command: string): string | null {
  const match = command.match(/[\w./${}:@-]*\.(?:sh|mjs|cjs|js|py)\b/);
  if (!match) return null;
  const raw = match[0]
    .replace(/^\$\{CLAUDE_PROJECT_DIR:-\.\}\//, '')
    .replace(/^\$CLAUDE_PROJECT_DIR\//, '')
    .replace(/^\.\//, '');
  // An unexpanded variable cannot be tested against the filesystem.
  return raw.includes('$') || raw.length === 0 ? null : raw;
}

/** Claude `settings.json` and Codex `hooks.json` nest alike; callers dedupe by script. */
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

/** Per-script facts; `scriptExists` is asked once per distinct script. */
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

/** Scripts found on disk across every config. */
export function wiredHookCount(groups: readonly HookConfigFacts[]): number {
  return groups.reduce(
    (sum, group) => sum + group.hooks.filter((hook) => hook.status === 'wired').length,
    0,
  );
}
