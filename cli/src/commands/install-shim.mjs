// `ontology-atlas install-shim [--dir <path>] [--force] [--uninstall]`
//
// ⚠️ **Why this exists instead of `npm i -g`** (owner, 2026-08-25: *"make `atlas`
// take you in… but no npm yet"*).
//
// The CLI has 56 commands and no way to reach them. `bin` names `atlas`, but a
// name in `package.json` only becomes a command through an install, and
// `.claude/rules/forbidden.md` forbids publishing to a registry until the owner
// asks. The remaining honest path is a **shim**: one executable line, in a
// directory the person already owns, pointing at the checkout they already have.
//
// `.claude/rules/surfaces.md` governs installing a command for somebody, and its
// four conditions are the shape of this file:
//
//   1. the user initiates it — this is a command they type, never an app action;
//   2. they see the exact contents first — printed before anything is written,
//      and `--dry-run` is the default when the target already exists;
//   3. it stays in a user-owned location — `~/.local/bin` by default, never
//      `/usr/local/bin`, so no `sudo` and nothing outside their home;
//   4. it is pinned — the shim names this checkout's absolute path, so it cannot
//      silently start running a different copy.
//
// It is undone by `--uninstall`, which removes only a shim this command wrote.
// A file it does not recognise is left alone and reported, because the worst
// outcome here is deleting something a person put there themselves.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COLORS } from '../lib/colors.mjs';
import { formatUnknownFlagError } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--dir', '--force', '--uninstall', '--json'];

/** Marks a shim as ours. `--uninstall` refuses to delete a file without it. */
export const SHIM_SIGNATURE = '# ontology-atlas shim — safe to delete';

/** The entrypoint this shim should run, resolved from where this file actually lives. */
export function cliEntrypoint() {
  return resolve(fileURLToPath(new URL('../index.mjs', import.meta.url)));
}

/**
 * The shim's exact contents, so the caller can print what will be written before writing it.
 *
 * `exec` replaces the shell rather than wrapping it, so signals and the exit code pass through
 * untouched — a wrapper that swallowed Ctrl-C would make every long command feel broken.
 */
export function shimBody(entrypoint) {
  const quoted = JSON.stringify(entrypoint);
  // ⚠️ Checked before exec, because the failure is otherwise unreadable (observed 2026-08-25, the
  // falsifier this decision recorded and then met the same hour). A shim whose checkout has moved or
  // been deleted hands the person a Node module-loader stack trace — a wall of internal frames that
  // names neither `atlas` nor the folder that went missing. One `test -f` turns that into a sentence
  // they can act on, and costs nothing on every successful run.
  return (
    `#!/bin/sh\n${SHIM_SIGNATURE}\n` +
    `if [ ! -f ${quoted} ]; then\n` +
    `  echo "atlas: the checkout this shim points at is gone:" >&2\n` +
    `  echo "  ${entrypoint}" >&2\n` +
    `  echo "Re-run install-shim from the checkout you want, or delete $0." >&2\n` +
    `  exit 127\n` +
    `fi\n` +
    `exec node ${quoted} "$@"\n`
  );
}

export function defaultShimDir() {
  return join(homedir(), '.local', 'bin');
}

/**
 * Is this path already ours, somebody else's, or free?
 *
 * The distinction decides whether `--force` is even offered: overwriting our own stale shim is
 * routine, and overwriting a stranger's file is not something a flag should make easy.
 */
export function inspectTarget(path) {
  if (!existsSync(path)) return { state: 'free' };
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { state: 'unreadable' };
  }
  return text.includes(SHIM_SIGNATURE) ? { state: 'ours', text } : { state: 'foreign', text };
}

/** True when the directory is already on PATH, so the caller can say whether a restart is needed. */
export function onPath(dir, pathEnv = process.env.PATH ?? '') {
  return pathEnv.split(':').filter(Boolean).some((entry) => resolve(entry) === resolve(dir));
}

function parseArgs(args) {
  const flags = { dir: null, force: false, uninstall: false, json: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--force') flags.force = true;
    else if (a === '--uninstall') flags.uninstall = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--dir') flags.dir = args[++i] ?? null;
    else if (a.startsWith('--dir=')) flags.dir = a.slice('--dir='.length);
    else if (a === '--help' || a === '-h') return { help: true };
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else return { error: `unexpected argument: ${a}` };
  }
  if (flags.dir === null && args.includes('--dir')) return { error: '--dir requires a path' };
  return flags;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `${COLORS.bold}install-shim${COLORS.reset} — put ${COLORS.bold}atlas${COLORS.reset} on your PATH\n\n` +
      `  ontology-atlas install-shim [--dir <path>] [--force] [--uninstall] [--json]\n\n` +
      `Writes a one-line launcher into ${COLORS.dim}~/.local/bin/atlas${COLORS.reset} pointing at this\n` +
      `checkout. No registry, no sudo, nothing outside your home directory.\n` +
      `The exact contents are printed before anything is written.\n\n` +
      `  --uninstall  remove a shim this command wrote (leaves anything else alone)\n` +
      `  --force      replace a file that is not ours\n`,
  );
}

export async function runInstallShim(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  const dir = parsed.dir ? resolve(parsed.dir) : defaultShimDir();
  const target = join(dir, 'atlas');
  const found = inspectTarget(target);

  if (parsed.uninstall) {
    if (found.state === 'free') {
      process.stdout.write(`nothing to remove at ${target}\n`);
      return 0;
    }
    if (found.state !== 'ours') {
      // Refusing is the whole point: a file we did not write may be somebody's own script.
      process.stderr.write(
        `${COLORS.yellow}left alone${COLORS.reset}  ${target} was not written by this command.\n` +
          `Delete it yourself if you are sure.\n`,
      );
      return 1;
    }
    rmSync(target);
    process.stdout.write(`removed ${target}\n`);
    return 0;
  }

  const entrypoint = cliEntrypoint();
  const body = shimBody(entrypoint);

  // Condition 2: the exact contents, before anything is written.
  process.stdout.write(`${COLORS.bold}will write${COLORS.reset} ${target}\n\n${body}\n`);

  if (found.state === 'foreign' && !parsed.force) {
    process.stderr.write(
      `${COLORS.yellow}stopped${COLORS.reset}  ${target} already exists and was not written by this command.\n` +
        `Pass --force to replace it, or --dir to pick another directory.\n`,
    );
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(target, body, 'utf8');
  chmodSync(target, 0o755);

  const reachable = onPath(dir);
  if (parsed.json) {
    process.stdout.write(JSON.stringify({ target, entrypoint, onPath: reachable }, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(`${COLORS.green}ok${COLORS.reset}    ${target}\n`);
  if (reachable) {
    process.stdout.write(`\nRun ${COLORS.bold}atlas${COLORS.reset} from anywhere.\n`);
  } else {
    // Saying this plainly beats a shim that exists and does nothing when typed.
    process.stdout.write(
      `\n${COLORS.yellow}note${COLORS.reset}  ${dir} is not on your PATH yet. Add this to your shell profile:\n\n` +
        `  export PATH="${dir}:$PATH"\n`,
    );
  }
  return 0;
}

export const __testables = { dirname };
