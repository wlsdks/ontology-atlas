// Physical footprint and its composition for macOS processes, from `footprint` and `vmmap`.
import { execFileSync, spawnSync } from 'node:child_process';

const MB = 1048576;
const WEBKIT = /com\.apple\.WebKit\.(WebContent|GPU|Networking)$/;

/** WebKit helper processes now running, by pid. A new app's helpers are the pids absent before it launched. */
export function webkitHelpers() {
  const out = execFileSync('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' });
  const helpers = new Map();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    const kind = match?.[2].match(WEBKIT)?.[1];
    if (kind) helpers.set(Number(match[1]), kind);
  }
  return helpers;
}

export function childrenOf(pid) {
  const result = spawnSync('/usr/bin/pgrep', ['-P', String(pid)], { encoding: 'utf8' });
  return result.stdout.split('\n').filter(Boolean).map(Number);
}

export function processName(pid) {
  return spawnSync('/bin/ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
}

/** `{ mb, peakMb }` per live pid; the peak is the kernel's lifetime `phys_footprint_peak`. */
export function footprints(pids) {
  const found = new Map();
  if (!pids.length) return found;
  const result = spawnSync(MACOS_TOOL.footprint, ['--noCategories', '-f', 'bytes', ...pids.flatMap((pid) => ['-p', String(pid)])], { encoding: 'utf8' });
  let current = null;
  for (const line of `${result.stdout}`.split('\n')) {
    const head = line.match(/\[(\d+)\]:.*Footprint:\s*(\d+) B/);
    if (head) {
      current = Number(head[1]);
      found.set(current, { mb: Number(head[2]) / MB, peakMb: null });
      continue;
    }
    const peak = line.match(/phys_footprint_peak:\s*(\d+) B/);
    if (peak && current !== null) found.get(current).peakMb = Number(peak[1]) / MB;
  }
  return found;
}

/** `footprint`'s categories for one pid, largest dirty first: what the footprint is made of. */
export function footprintCategories(pid, top = 12) {
  const result = spawnSync(MACOS_TOOL.footprint, ['-f', 'bytes', '-p', String(pid)], { encoding: 'utf8' });
  const rows = [];
  for (const line of `${result.stdout}`.split('\n')) {
    const match = line.match(/^\s*(\d+) B\s+(\d+) B\s+(\d+) B\s+(\d+)\s+(.+)$/);
    if (match && match[5].trim() !== 'TOTAL') rows.push({ category: match[5].trim(), dirtyMb: +(Number(match[1]) / MB).toFixed(1), cleanMb: +(Number(match[2]) / MB).toFixed(1), regions: Number(match[4]) });
  }
  return { raw: result.stdout, rows: rows.sort((a, b) => b.dirtyMb - a.dirtyMb).slice(0, top), error: result.status === 0 ? null : result.stderr.trim().slice(0, 300) };
}

const UNIT = { '': 1 / MB, B: 1 / MB, K: 1 / 1024, M: 1, G: 1024 };
const toMb = (text) => {
  const match = text.match(/^([\d.]+)([BKMG]?)$/);
  return match ? Number(match[1]) * UNIT[match[2]] : 0;
};

/** `vmmap --summary` region types, by dirty plus swapped size; the raw text is kept for the report. */
export function vmmapRegions(pid, top = 15) {
  const result = spawnSync(MACOS_TOOL.vmmap, ['--summary', String(pid)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const rows = [];
  let inTable = false;
  for (const line of `${result.stdout}`.split('\n')) {
    if (line.startsWith('REGION TYPE')) {
      inTable = true;
      continue;
    }
    if (!inTable || line.startsWith('====')) continue;
    if (line.startsWith('TOTAL')) break;
    const match = line.match(/^(.+?)\s+([\d.]+[BKMG]?)\s+([\d.]+[BKMG]?)\s+([\d.]+[BKMG]?)\s+([\d.]+[BKMG]?)\s+/);
    if (match) rows.push({ region: match[1].trim(), residentMb: +toMb(match[3]).toFixed(1), dirtyMb: +toMb(match[4]).toFixed(1), swappedMb: +toMb(match[5]).toFixed(1) });
  }
  rows.sort((a, b) => b.dirtyMb + b.swappedMb - (a.dirtyMb + a.swappedMb));
  return { raw: result.stdout, rows: rows.slice(0, top), error: result.status === 0 ? null : result.stderr.trim().slice(0, 300) };
}

// Absolute paths, held in data so the dead-code check does not resolve them as
// files on its Linux runner.
export const MACOS_TOOL = Object.freeze({
  footprint: '/usr/bin/footprint',
  vmmap: '/usr/bin/vmmap',
  ioreg: '/usr/sbin/ioreg',
  plistBuddy: '/usr/libexec/PlistBuddy',
});
