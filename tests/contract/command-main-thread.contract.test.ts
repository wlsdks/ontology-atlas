import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate against a slow Tauri command landing back on the macOS main thread.
 *
 * A `#[tauri::command]` without `(async)` runs **inline on the main thread** — verified in
 * `tauri-macros`, whose blocking wrapper calls the function body directly, and in `wry`, whose
 * `startURLSchemeTask` handler WebKit delivers on the main thread. While such a body runs, the
 * tao event loop is stopped: the window cannot be moved, resized or closed, input is ignored,
 * and macOS eventually paints the beachball.
 *
 * **The defect that made this worth gating.** Events emitted from *any* thread are delivered by
 * the main thread's event loop. So the install-progress streaming this repository deliberately
 * built — npm's stderr pumped line by line, the Node download reported every 250ms, both
 * argued at length in their own comments as the cure for the owner's "quiet waiting" report of
 * 2026-08-20 — could never appear, because the command whose progress it reports was itself
 * holding the thread that would deliver it. A 52 MB download froze the window and then replayed
 * every progress event at once. The feature was built, argued, merged, and dead.
 *
 * So this file does not assert a style. It asserts that the commands which wait on a network,
 * a subprocess, or a filesystem walk are not the ones holding the main thread.
 *
 * **`pick_vault_directory` is the deliberate counterexample** and is asserted to stay sync:
 * `rfd::FileDialog::pick_folder` opens an `NSOpenPanel`, which macOS requires on the main thread
 * and which runs its own modal event loop. It stays responsive *because* it blocks there. A
 * blanket "make every command async" would break the one command that needs the opposite — which
 * is why the rule is a named list rather than a lint.
 */

const repoRoot = join(import.meta.dirname, '..', '..');

/** Commands whose body waits on something the app does not control. Each must be `(async)`. */
const MUST_NOT_BLOCK_THE_MAIN_THREAD: { file: string; fn: string; because: string }[] = [
  { file: 'lib.rs', fn: 'acp_install_node', because: 'downloads a 52 MB runtime, bounded at 600s' },
  { file: 'lib.rs', fn: 'acp_install_cli', because: 'waits on npm install, measured at 30-90s' },
  { file: 'lib.rs', fn: 'acp_detect_runtimes', because: 'launches each installed CLI behind a 5s probe' },
  { file: 'lib.rs', fn: 'acp_diagnose', because: 'runs the login and keychain probes' },
  { file: 'lib.rs', fn: 'acp_repair', because: 'runs the doctor context, then repairs' },
  { file: 'lib.rs', fn: 'acp_reset_connection', because: 'runs the doctor context twice around a keychain delete' },
  { file: 'lib.rs', fn: 'inspect_project_source', because: 'walks and hashes up to 4000 files / 32 MiB' },
  { file: 'llm.rs', fn: 'llm_chat', because: 'waits on curl for a model round trip' },
  { file: 'llm.rs', fn: 'secret_verify', because: 'waits on curl to test a key' },
  { file: 'git.rs', fn: 'git_pull', because: 'network git' },
  { file: 'git.rs', fn: 'git_fetch', because: 'network git' },
  { file: 'git.rs', fn: 'git_snapshot', because: 'may push, which is network git' },
  { file: 'agent_setup.rs', fn: 'verify_mcp_server', because: 'spawns the bundled MCP server' },
];

/** Commands that must stay on the main thread, with the reason they are exceptions. */
const MUST_STAY_ON_THE_MAIN_THREAD: { file: string; fn: string; because: string }[] = [
  {
    file: 'lib.rs',
    fn: 'pick_vault_directory',
    because: 'NSOpenPanel must open on the main thread and runs its own modal event loop',
  },
];

function source(file: string): string {
  return readFileSync(join(repoRoot, 'src-tauri/src', file), 'utf8').replace(/\r\n/g, '\n');
}

/** The attribute immediately above the definition, or null when the function is not a command. */
function commandAttributeOf(file: string, fn: string): string | null {
  const body = source(file);
  const match = new RegExp(`(#\\[tauri::command[^\\]]*\\])\\n(?:pub )?fn ${fn}\\b`).exec(body);
  return match ? match[1] : null;
}

describe('slow Tauri commands do not hold the macOS main thread', () => {
  it('finds every command this rule names', () => {
    // A renamed or deleted command must fail loudly here rather than silently dropping out of the
    // list — a rule that quietly stops covering something is worse than no rule.
    for (const { file, fn } of [...MUST_NOT_BLOCK_THE_MAIN_THREAD, ...MUST_STAY_ON_THE_MAIN_THREAD]) {
      expect(commandAttributeOf(file, fn), `${file}::${fn} is no longer a #[tauri::command]`).not.toBe(
        null,
      );
    }
  });

  it('runs every waiting command off the main thread', () => {
    const blocking = MUST_NOT_BLOCK_THE_MAIN_THREAD.filter(
      ({ file, fn }) => commandAttributeOf(file, fn) !== '#[tauri::command(async)]',
    );

    expect(
      blocking.map(({ file, fn, because }) => `${file}::${fn} — ${because}`),
      'these commands wait on something the app does not control, so a bare #[tauri::command] ' +
        'freezes the window and queues every event the wait was supposed to report',
    ).toEqual([]);
  });

  it('keeps the folder picker on the main thread', () => {
    for (const { file, fn, because } of MUST_STAY_ON_THE_MAIN_THREAD) {
      expect(commandAttributeOf(file, fn), `${file}::${fn} must stay sync — ${because}`).toBe(
        '#[tauri::command]',
      );
    }
  });
});
