// Test-only: the two inputs the harness pins in every JavaScript server process, the clock and the
// source of random UUIDs. The shipped server never imports this file, and no environment variable
// the server itself reads is involved. The Rust server honours the same two variables behind a
// cargo feature the release build lacks, so all programs see identical inputs.
//
//   ATLAS_DIFF_CLOCK_MS    fixed epoch milliseconds returned by `Date.now()` and `new Date()`
//   ATLAS_DIFF_UID_SEED    text that seeds every UUID stream
//
// UUIDs come from named streams so a draw made for a temporary file name cannot shift the UIDs
// minted for concepts. The stream is chosen by the module that asked: `schema` for node UIDs,
// `map-analysis-log` for session ids, `other` for everything else.
import { createHash } from 'node:crypto';

const counters = new Map();

export function uuidStream(name, seed = process.env.ATLAS_DIFF_UID_SEED ?? '') {
  return () => {
    const index = counters.get(name) ?? 0;
    counters.set(name, index + 1);
    const bytes = createHash('sha256').update(`${seed}\0${name}\0${index}`).digest();
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  };
}

export function streamNameOfModule(moduleName) {
  if (/(^|[\\/])schema\.mjs$/.test(moduleName)) return 'schema';
  if (/(^|[\\/])map-analysis-log\.mjs$/.test(moduleName)) return 'map-analysis-log';
  return 'other';
}

/** Replaces `Date` so `Date.now()` and `new Date()` answer one fixed instant. */
export function installFixedClock(clockText = process.env.ATLAS_DIFF_CLOCK_MS) {
  if (clockText === undefined) return;
  const fixed = Number(clockText);
  if (!Number.isFinite(fixed)) throw new Error('ATLAS_DIFF_CLOCK_MS must be a number');
  const RealDate = globalThis.Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }

    static now() {
      return fixed;
    }
  }
  Object.defineProperty(FixedDate, 'name', { value: 'Date' });
  globalThis.Date = FixedDate;
}
