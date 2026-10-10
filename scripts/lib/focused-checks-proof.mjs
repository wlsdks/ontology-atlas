import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PROOF_LINES = 200;
const COVERS_FLAG = '--covers=';

function git(args, { cwd, spawn, env }) {
  const result = spawn('git', args, { cwd, encoding: 'utf-8', env, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(String(result.stderr || `git ${args.join(' ')} failed`).trim());
  return String(result.stdout || '').trim();
}

export function treeOf(rev, { cwd = process.cwd(), spawn = spawnSync } = {}) {
  return git(['rev-parse', `${rev}^{tree}`], { cwd, spawn });
}

export function contentTree({ cwd = process.cwd(), spawn = spawnSync } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-content-tree-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
    git(['read-tree', 'HEAD'], { cwd, spawn, env });
    git(['add', '-A'], { cwd, spawn, env });
    return git(['write-tree'], { cwd, spawn, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function proofFile({ cwd = process.cwd(), spawn = spawnSync } = {}) {
  const gitDir = git(['rev-parse', '--git-dir'], { cwd, spawn });
  return join(resolve(cwd, gitDir), 'atlas-checks-proofs.jsonl');
}

export function readProofs(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function proofToRecord({ from, before, after }) {
  if (!from || !before || before !== after || from === before) return null;
  return { from, to: before };
}

export function recordProof({ from, to, file, now = () => new Date().toISOString() }) {
  if (from === to) return;
  appendFileSync(file, `${JSON.stringify({ from, to, at: now() })}\n`);
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  if (lines.length > MAX_PROOF_LINES) writeFileSync(file, `${lines.slice(-MAX_PROOF_LINES).join('\n')}\n`);
}

export function covers({ from, to, proofs }) {
  const next = new Map();
  for (const proof of proofs) next.set(proof.from, [...(next.get(proof.from) ?? []), proof.to]);
  const seen = new Set([from]);
  const queue = [from];
  for (const tree of queue) {
    if (tree === to) return true;
    for (const target of next.get(tree) ?? []) {
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return false;
}

export function coversFromGit(rev, { cwd = process.cwd(), spawn = spawnSync } = {}) {
  const proofs = readProofs(proofFile({ cwd, spawn }));
  return covers({ from: treeOf(rev, { cwd, spawn }), to: treeOf('HEAD', { cwd, spawn }), proofs });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const flag = process.argv.slice(2).find((arg) => arg.startsWith(COVERS_FLAG));
  let covered = false;
  try {
    covered = Boolean(flag) && coversFromGit(flag.slice(COVERS_FLAG.length));
  } catch {
    covered = false;
  }
  process.exitCode = covered ? 0 : 1;
}
