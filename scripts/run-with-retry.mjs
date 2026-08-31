#!/usr/bin/env node
/**
 * Runs one command **under a time bound**, retrying a fixed number of times on
 * failure.
 *
 * **Why it exists — apt ate 20 minutes whole** (measured 2026-08-20). The E2E job's
 * setup step (`playwright install-deps chromium`) died **six times in one day**, and
 * the shape of the death was the problem: not a single test ran, the log repeated
 * `Ign: http://azure.archive.ubuntu.com/... InRelease` and then stopped, and 19
 * minutes 42 seconds later the 20-minute job timeout left only
 * `The operation was canceled.` All four shards died at the same place together, so
 * one PR cost six re-runs.
 *
 * **apt has no bound on waiting.** If the mirror does not answer it waits forever,
 * and when the only thing cutting that "forever" is the job timeout, the failure is
 * known **only after paying the full cost**. So this does two things: bound a single
 * attempt, and retry when the bound is hit.
 *
 * **Why a script rather than a bash loop** — because it has to be testable. A `for`
 * loop inside CI YAML is verified only by running CI, and that verification costs 20
 * minutes and a runner. The failure paths (killing a stuck command; the exit code
 * when the last attempt also fails) have to be **caused deliberately** to be
 * exercised, and there is no way to reproduce them in CI. As a script they can all be
 * walked with a fake command — which is what `run-with-retry.test.mjs` does.
 *
 * **A stuck command is killed by process *group*.** `playwright install-deps`
 * re-launches apt itself. Killing only the parent leaves a grandchild holding the
 * lock, and the next attempt blocks on that same lock. So the child is spawned
 * `detached` to become its own process-group leader, and the kill signals the whole
 * group via `-pid`. SIGTERM first, then SIGKILL if it survives the grace period.
 *
 * **`--best-effort`** is for setup work that is nice to have but whose absence the
 * next step reports on its own. Installing system libraries is like that: the runner
 * image already has most of them, and if one is genuinely missing, Playwright fails
 * when the browser launches **and names the missing library**. Better to leave a
 * warning and let the next step make the real verdict than to stop a whole PR because
 * a mirror wobbled.
 *
 * Conversely, something like downloading the browser — **without which nothing
 * works** — is used without this flag, and then a final failed attempt exits 1.
 *
 * Usage:
 *
 * ```bash
 * node scripts/run-with-retry.mjs --attempts=3 --timeout-ms=180000 \
 *   --label="playwright install-deps" --best-effort \
 *   -- pnpm exec playwright install-deps chromium
 * ```
 */

import { spawn } from 'node:child_process';

const DEFAULTS = {
  attempts: 3,
  timeoutMs: 180_000,
  /** Grace period between SIGTERM and SIGKILL. */
  killGraceMs: 5_000,
  /** Base pause between attempts — multiplied by n before the nth retry. */
  backoffMs: 5_000,
};

/** Before `--` are this script's options; after it, the command to run. */
export function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0) {
    throw new Error('run-with-retry: put the command to run after `--`');
  }
  const flags = argv.slice(0, separator);
  const command = argv.slice(separator + 1);
  if (command.length === 0) {
    throw new Error('run-with-retry: nothing follows `--`');
  }

  const options = {
    ...DEFAULTS,
    bestEffort: false,
    label: command.join(' '),
  };

  for (const flag of flags) {
    const numeric = (name) => {
      const raw = flag.slice(`--${name}=`.length);
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`run-with-retry: --${name} must be a positive number (got: ${raw})`);
      }
      return value;
    };

    if (flag === '--best-effort') options.bestEffort = true;
    else if (flag.startsWith('--attempts=')) options.attempts = numeric('attempts');
    else if (flag.startsWith('--timeout-ms=')) options.timeoutMs = numeric('timeout-ms');
    else if (flag.startsWith('--kill-grace-ms=')) options.killGraceMs = numeric('kill-grace-ms');
    else if (flag.startsWith('--backoff-ms=')) options.backoffMs = numeric('backoff-ms');
    else if (flag.startsWith('--label=')) options.label = flag.slice('--label='.length);
    else throw new Error(`run-with-retry: unknown option ${flag}`);
  }

  return { options, command };
}

/**
 * Runs once, returning `{ ok, reason }` where `reason` is 'exit-<code>', 'timeout',
 * or 'signal-<name>'.
 */
function runOnce(command, { timeoutMs, killGraceMs }) {
  return new Promise((resolve) => {
    // detached makes the child its own process-group leader; the group is what allows
    // killing grandchildren in one go (see the doc-block above).
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });

    let settled = false;
    let killTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      resolve(result);
    };

    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Already dead means there is no group — that is normal.
      }
    };

    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      signalGroup('SIGTERM');
      killTimer = setTimeout(() => signalGroup('SIGKILL'), killGraceMs);
      // Do not conclude here — waiting for 'close' is what makes the next attempt start
      // only after the child is really cleaned up (preventing overlap while it holds a
      // lock).
    }, timeoutMs);

    child.on('error', (error) => finish({ ok: false, reason: `spawn-error: ${error.message}` }));
    child.on('close', (code, signal) => {
      if (timedOut) return finish({ ok: false, reason: 'timeout' });
      if (signal) return finish({ ok: false, reason: `signal-${signal}` });
      return finish({ ok: code === 0, reason: `exit-${code}` });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWithRetry(command, options) {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const started = Date.now();
    const result = await runOnce(command, options);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (result.ok) {
      if (attempt > 1) {
        console.log(`[run-with-retry] ${options.label}: succeeded on attempt ${attempt} (${seconds}s)`);
      }
      return { ok: true, attempts: attempt };
    }

    const why = result.reason === 'timeout' ? `did not finish within ${options.timeoutMs}ms` : result.reason;
    console.log(
      `[run-with-retry] ${options.label}: ${attempt}/${options.attempts} failed — ${why} (${seconds}s)`,
    );

    if (attempt < options.attempts) await sleep(options.backoffMs * attempt);
  }

  return { ok: false, attempts: options.attempts };
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2));
  const result = await runWithRetry(command, options);
  if (result.ok) return 0;

  if (options.bestEffort) {
    // The format GitHub surfaces as an annotation. Passing silently would be
    // indistinguishable from success.
    console.log(
      `::warning title=${options.label}::all ${options.attempts} attempts failed, but this is not a required step, so the run continues. ` +
        `If the next step breaks because of it, that failure message names what is missing.`,
    );
    return 0;
  }

  console.error(`[run-with-retry] ${options.label}: all ${options.attempts} attempts failed`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('run-with-retry.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[run-with-retry] ${error.message}`);
      process.exitCode = 1;
    });
}
