// Generated vaults for perf:web-open and perf:app-open, kept between runs because a 50,000-file
// folder takes a while to write. `--clean` in either command removes them.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateScaleVault } from '../gen-scale-vault.mjs';

export const PERF_WORK = join(tmpdir(), 'atlas-perf-open');
const VAULTS = join(PERF_WORK, 'vaults');

/** Rows are refused for files modified within two seconds of being seen, so a fresh vault is dated back. */
function dateBack(dir) {
  const then = new Date(Date.now() - 60_000);
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else utimesSync(path, then, then);
    }
  };
  visit(dir);
}

/** The vault of `files` documents of `shape`, written once; returns its folder and what it holds. */
export function prepareVault(files, shape) {
  const dir = join(VAULTS, `${shape}-${files}`);
  const facts = join(VAULTS, `${shape}-${files}.json`);
  if (!existsSync(facts)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const written = generateScaleVault(dir, files, shape);
    dateBack(dir);
    writeFileSync(facts, JSON.stringify(written));
  }
  const known = JSON.parse(readFileSync(facts, 'utf8'));
  if (known.census === undefined) {
    known.census = censusOf(dir);
    writeFileSync(facts, JSON.stringify(known));
  }
  return { dir, files, shape, ...known };
}

/** What the map's concept census counts: concepts other than documents. */
function censusOf(dir) {
  let count = 0;
  for (const rel of listVaultFiles(dir)) {
    if (!rel.endsWith('.md')) continue;
    const kind = readFileSync(join(dir, rel), 'utf8').match(/^kind:\s*(\S+)/m)?.[1];
    if (kind && kind !== 'document') count += 1;
  }
  return count;
}

export function cleanVaults() {
  rmSync(VAULTS, { recursive: true, force: true });
}

/** The files of a vault, relative and sorted. */
export function listVaultFiles(dir) {
  const out = [];
  const visit = (folder, prefix) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(join(folder, entry.name), rel);
      else out.push(rel);
    }
  };
  visit(dir, '');
  return out.sort();
}

/** Shared flags of both commands. */
export function parseOpenArgs(argv, { walks: allowedWalks }) {
  const opts = { files: [], shapes: [], walks: [], check: false, clean: false, capS: null, settleS: 15, port: 3202, extra: {} };
  for (const arg of argv) {
    if (arg === '--') continue;
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'files') opts.files.push(Number(value));
    else if (key === 'shape') opts.shapes.push(value);
    else if (key === 'walk') opts.walks.push(value);
    else if (key === 'check') opts.check = true;
    else if (key === 'clean') opts.clean = true;
    else if (key === 'cap') opts.capS = Number(value);
    else if (key === 'settle') opts.settleS = Number(value);
    else if (key === 'port') opts.port = Number(value);
    else opts.extra[key] = value ?? true;
  }
  if (!opts.files.length) opts.files = [2000];
  if (!opts.shapes.length) opts.shapes = ['key'];
  for (const shape of opts.shapes) if (!['all', 'key', 'library', 'linked'].includes(shape)) throw new Error(`unknown shape ${shape}`);
  for (const walk of opts.walks) if (!allowedWalks.includes(walk)) throw new Error(`unknown walk ${walk}; one of ${allowedWalks.join(', ')}`);
  for (const files of opts.files) if (!Number.isInteger(files) || files < 1) throw new Error(`--files must be a whole number, got ${files}`);
  return opts;
}

/** Seconds a run may take before it is cut off, so a crash loop still ends. */
export function capSeconds(files, walks, override) {
  if (override) return override;
  const open = files <= 2000 ? 90 : files <= 20000 ? 300 : 600;
  return open + walks.length * 240;
}
