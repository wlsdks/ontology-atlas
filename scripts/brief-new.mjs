#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const USAGE = 'Usage: pnpm brief:new -- --slug=<slug> --owns=<path,...> [--read=<path,...>] [--path=train|integration] [--budget=<text>] [--port|--no-server]';

const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

export function parseArgs(argv) {
  const options = { slug: '', owns: [], read: [], path: 'integration', budget: '', port: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--port') options.port = true;
    else if (arg === '--no-server') options.port = false;
    else if (arg.startsWith('--slug=')) options.slug = arg.slice(7);
    else if (arg.startsWith('--owns=')) options.owns = list(arg.slice(7));
    else if (arg.startsWith('--read=')) options.read = list(arg.slice(7));
    else if (arg.startsWith('--path=')) options.path = arg.slice(7);
    else if (arg.startsWith('--budget=')) options.budget = arg.slice(9);
    else throw new Error(`unknown option ${arg}`);
  }
  if (!options.slug || options.owns.length === 0) throw new Error('--slug and --owns are required');
  if (!['train', 'integration'].includes(options.path)) throw new Error('--path must be train or integration');
  return options;
}

function hasListener(port) {
  return new Promise((done) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('timeout', () => { socket.destroy(); done(false); });
    socket.once('error', () => done(false));
  });
}

function canListen(port) {
  return new Promise((done) => {
    const server = net.createServer();
    server.once('error', () => done(false));
    server.listen({ port, host: '127.0.0.1' }, () => server.close(() => done(true)));
  });
}

export async function freePort({ from = 3200, to = 3299 } = {}) {
  for (let port = from; port <= to; port += 1) {
    if (!(await hasListener(port)) && (await canListen(port))) return port;
  }
  return null;
}

export function suggestedChecks(paths, { cwd = process.cwd() } = {}) {
  const result = spawnSync(process.execPath, ['scripts/suggest-focused-checks.mjs', '--', ...paths], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout)
    .split('\n')
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trim().split(/\s+#\s/)[0].trim());
}

export function renderBrief({ slug, owns, read, path, budget, port, checks }) {
  const portLine = port == null ? 'No server may run.' : `Use port ${port} only: set \`PLAYWRIGHT_BASE_URL=http://localhost:${port}\`, add \`PLAYWRIGHT_STATIC=1\` when proof must cover the exported build, and pass the same environment to \`pnpm checks:changed\`. Run one spec at a time.`;
  const landing = path === 'train'
    ? `Commit on branch \`${slug}\` in its own worktree; push and open a draft pull request with \`gh pr create --draft\`; never mark it ready or run \`pnpm pr:land\`. The lead lands after an independent review.`
    : `Commit on branch \`${slug}\` in its own worktree; do not push. The lead lands after an independent review.`;
  const checkLines = checks.length ? checks.map((command) => `   - \`${command}\``) : ['   - (no focused check suggested)'];
  return [
    `# Brief: ${slug}`,
    '',
    `1. Port: ${portLine}`,
    `2. Owned files: ${owns.map((p) => `\`${p}\``).join(', ')}; everything else is read-only. If the slice adds modules loaded at runtime (glob, readdir, dynamic import), it also owns \`scripts/quality/dead-code/\`.`,
    '3. No `git stash`, no `git add -A`, and no worktree deletion; the lead cleans up.',
    '4. Scratch: your session scratchpad only; never ~/scratch or the repository.',
    '5. Checks that must stay green:',
    ...checkLines,
    '   Finish with `pnpm checks:changed -- --run`; quote every command exactly as run.',
    `6. Primary sources: ${read.length ? read.map((p) => `\`${p}\``).join(', ') : 'the owned files'}.`,
    `7. Merge: ${landing}`,
    `8. Budget: ${budget || 'none'}.`,
    '',
    '## Task',
    '',
    '',
  ].join('\n');
}

export async function main({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr, cwd = process.cwd(), findPort = freePort, checks = suggestedChecks } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`[brief-new] ${error.message}\n${USAGE}\n`);
    return 1;
  }
  const port = options.port ? await findPort() : null;
  if (options.port && port == null) {
    stderr.write('[brief-new] no free port between 3200 and 3299\n');
    return 1;
  }
  stdout.write(renderBrief({ ...options, port, checks: checks(options.owns, { cwd }) }));
  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
