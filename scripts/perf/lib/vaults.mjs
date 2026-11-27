// Generated vaults for perf:app-open and the map tools, kept between runs because a 50,000-file
// folder takes a while to write. `--clean` in `perf:app-open` removes them.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateScaleVault } from '../gen-scale-vault.mjs';

export const PERF_WORK = join(tmpdir(), 'atlas-perf-open');
const VAULTS = join(PERF_WORK, 'vaults');

/** Rows are refused for files modified within two seconds of being seen, so a fresh vault is dated back. */
function dateBack(directory) {
  const then = new Date(Date.now() - 60_000);
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else utimesSync(path, then, then);
    }
  };
  visit(directory);
}

/** The vault of `files` documents of `shape`, written once; returns its folder and what it holds. */
export function prepareVault(files, shape) {
  const directory = join(VAULTS, `${shape}-${files}`);
  const facts = join(VAULTS, `${shape}-${files}.json`);
  if (!existsSync(facts)) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    const written = generateScaleVault(directory, files, shape);
    dateBack(directory);
    writeFileSync(facts, JSON.stringify(written));
  }
  const known = JSON.parse(readFileSync(facts, 'utf8'));
  if (known.census === undefined) {
    known.census = censusOf(directory);
    writeFileSync(facts, JSON.stringify(known));
  }
  return { dir: directory, files, shape, ...known };
}

/** The Markdown of the generated vault as `{ path: text }`, the form the faked app runtime serves. */
export function scaleVaultFiles(files, shape) {
  const { dir } = prepareVault(files, shape);
  const served = {};
  for (const rel of listVaultFiles(dir)) if (rel.endsWith('.md')) served[rel] = readFileSync(join(dir, rel), 'utf8');
  return served;
}

/** What the map's concept census counts: concepts other than documents. */
function censusOf(directory) {
  let count = 0;
  for (const rel of listVaultFiles(directory)) {
    if (!rel.endsWith('.md')) continue;
    const kind = readFileSync(join(directory, rel), 'utf8').match(/^kind:\s*(\S+)/m)?.[1];
    if (kind && kind !== 'document') count += 1;
  }
  return count;
}

export function cleanVaults() {
  rmSync(VAULTS, { recursive: true, force: true });
}

/** The files of a vault, relative and sorted. */
export function listVaultFiles(directory) {
  const out = [];
  const visit = (folder, prefix) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(join(folder, entry.name), rel);
      else out.push(rel);
    }
  };
  visit(directory, '');
  return out.sort();
}

/** Shared flags of both commands. */
export function parseOpenArgs(argv, { walks: allowedWalks }) {
  const options = { files: [], shapes: [], walks: [], check: false, clean: false, capS: null, settleS: 15, port: 3202, extra: {} };
  for (const arg of argv) {
    if (arg === '--') continue;
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'files') options.files.push(Number(value));
    else if (key === 'shape') options.shapes.push(value);
    else if (key === 'walk') options.walks.push(value);
    else if (key === 'check') options.check = true;
    else if (key === 'clean') options.clean = true;
    else if (key === 'cap') options.capS = Number(value);
    else if (key === 'settle') options.settleS = Number(value);
    else if (key === 'port') options.port = Number(value);
    else options.extra[key] = value ?? true;
  }
  if (!options.files.length) options.files = [2000];
  if (!options.shapes.length) options.shapes = ['key'];
  for (const shape of options.shapes) if (!['all', 'key', 'library', 'linked'].includes(shape)) throw new Error(`unknown shape ${shape}`);
  for (const walk of options.walks) if (!allowedWalks.includes(walk)) throw new Error(`unknown walk ${walk}; one of ${allowedWalks.join(', ')}`);
  for (const files of options.files) if (!Number.isInteger(files) || files < 1) throw new Error(`--files must be a whole number, got ${files}`);
  return options;
}

/** Seconds a run may take before it is cut off, so a crash loop still ends. */
export function capSeconds(files, walks, override) {
  if (override) return override;
  const open = files <= 2000 ? 90 : files <= 20000 ? 300 : 600;
  return open + walks.length * 240;
}
