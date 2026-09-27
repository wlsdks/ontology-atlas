// Installs a one-line `atlas` shim instead of `npm i -g`, which `.claude/rules/forbidden.md` forbids.
// `.claude/rules/surfaces.md` shapes it: the user runs it and sees the exact contents first, it stays in a
// user-owned directory (~/.local/bin, no sudo), and it pins this checkout. `--uninstall` removes only our shim.

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
 * The shim's exact contents, printed before writing. `exec` replaces the shell, so signals and the
 * exit code pass through; a wrapper that swallowed Ctrl-C would break every long command.
 */
export function shimBody(entrypoint) {
  const quoted = JSON.stringify(entrypoint);
  // Checked before exec: a moved checkout otherwise yields a Node loader stack trace naming neither
  // `atlas` nor the missing folder.
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
      `${COLORS.bold}Usage:${COLORS.reset}\n` +
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
      if (parsed.json) {
        process.stdout.write(JSON.stringify({ target, removed: null, state: 'free' }, null, 2) + '\n');
      } else {
        process.stdout.write(`nothing to remove at ${target}\n`);
      }
      return 0;
    }
    if (found.state !== 'ours') {
      // Refusing is the whole point: a file we did not write may be somebody's own script.
      process.stderr.write(
        `${COLORS.yellow}left alone${COLORS.reset}  ${target} was not written by this command.\n` +
          `Delete it yourself if you are sure.\n`,
      );
      if (parsed.json) {
        process.stdout.write(JSON.stringify({ target, removed: null, state: found.state }, null, 2) + '\n');
      }
      return 1;
    }
    rmSync(target);
    if (parsed.json) {
      process.stdout.write(JSON.stringify({ target, removed: target, state: 'ours' }, null, 2) + '\n');
    } else {
      process.stdout.write(`removed ${target}\n`);
    }
    return 0;
  }

  const entrypoint = cliEntrypoint();
  const body = shimBody(entrypoint);

  // The exact contents before anything is written. With --json the preview goes to stderr and the
  // body rides in the JSON as `shim`, keeping stdout one parseable document.
  const previewStream = parsed.json ? process.stderr : process.stdout;
  previewStream.write(`${COLORS.bold}will write${COLORS.reset} ${target}\n\n${body}\n`);

  if (found.state === 'foreign' && !parsed.force) {
    process.stderr.write(
      `${COLORS.yellow}stopped${COLORS.reset}  ${target} already exists and was not written by this command.\n` +
        `Pass --force to replace it, or --dir to pick another directory.\n`,
    );
    // The refusal is the path where somebody else's file sits at that address;
    // a parser must get a document here too, not an empty stdout.
    if (parsed.json) {
      process.stdout.write(JSON.stringify({ target, entrypoint, written: false, state: 'foreign', shim: body }, null, 2) + '\n');
    }
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(target, body, 'utf8');
  chmodSync(target, 0o755);

  const reachable = onPath(dir);
  if (parsed.json) {
    process.stdout.write(JSON.stringify({ target, entrypoint, written: true, state: found.state, onPath: reachable, shim: body }, null, 2) + '\n');
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
