/**
 * Inventory of static (non-pressable) surfaces — **the ledger and the gate count
 * with the same function.**
 *
 * Built after hitting "the hand-written ledger is wrong" four times in one day on
 * 2026-08-15 (see `/design-system-audit`, the section on deriving the ledger from
 * the scanner). The ratchet contract and the inventory report both call **this one
 * file**, so the ledger cannot drift from the measurement and the bidirectional
 * "the ledger is more generous than the measurement" check has meaning.
 *
 * Two things are counted:
 *
 * - **Section cards** — `<div>`/`<section>`/`<article>` carrying both a radius
 *   (card|panel) and an inset. A box that holds content.
 * - **Static badges** — `<span>` carrying a radius plus either an inset or a type
 *   step. Status dots (small circles with no text) are excluded: they belong to
 *   the signal-tone spec, not to badges.
 *
 * Excluded from both: tests · `src/shared/ui/` (the primitive layer is the
 * legitimate home of native elements) · anything already through the value layer
 * (`badgeClass`/`controlClass`/`fieldClass`).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Strip comments, preserving line count so reported line numbers stay right. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Terminates an opening tag by **brace depth**. Searching for a bare `>` cuts at
 * the arrow in `onClick={() => …}` — a trap this repository stepped on twice.
 */
export function openingTag(source, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

const VALUE_LAYER = /badgeClass|controlClass|fieldClass/;

/** Is this a static badge — a `<span>` that hand-writes geometry without the value layer? */
export function isHandBadge(tag) {
  if (!/className=/.test(tag)) return false;
  if (VALUE_LAYER.test(tag)) return false;
  if (!/rounded-(micro|chip|full)\b/.test(tag)) return false;
  const hasInset = /\bp[xy]?-[0-9.]+/.test(tag);
  const hasType = /\btext-(caption|label|body)\b/.test(tag);
  return hasInset || hasType;
}

/** Is this a section card — a container carrying both a (card|panel) radius and an inset? */
export function isHandCard(tag) {
  if (!/className=/.test(tag)) return false;
  if (VALUE_LAYER.test(tag)) return false;
  if (!/rounded-(card|panel)\b/.test(tag)) return false;
  return /\bp[xy]?-[0-9.]+/.test(tag);
}

/**
 * Extracts a card's **five axes** — the five the 체계 (design-systems) seat
 * demanded an exhaustive combination count for before any axis is decided:
 * surface token · border · radius · padding · presence of a header. A header
 * cannot be seen from the opening tag, so it is decided by looking **into the
 * body that follows** for a first child carrying a divider.
 */
export function cardAxes(tag, after) {
  const radius = (tag.match(/rounded-(card|panel)/) || [])[1];
  const surface = (tag.match(/bg-\[color:var\(--(?:color-)?([a-z0-9-]+)\)\]/) || [])[1] || 'none';
  const border = /\bborder\b/.test(tag)
    ? (tag.match(/border-\[color:var\(--color-([a-z0-9-]+)\)\]/) || [])[1] || 'default'
    : 'none';
  const px = (tag.match(/\bpx-([0-9.]+)/) || [])[1];
  const py = (tag.match(/\bpy-([0-9.]+)/) || [])[1];
  const p = (tag.match(/\bp-([0-9.]+)/) || [])[1];
  const pad = p ? `p-${p}` : `px-${px ?? '0'} py-${py ?? '0'}`;
  // Header = does an element with a bottom divider appear in the card's first 300 characters?
  const header = /border-b\b/.test((after || '').slice(0, 300)) ? 'header' : 'plain';
  return { radius, surface, border, pad, header };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
      continue;
    }
    if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

/**
 * @param {string} root repository root
 * @returns {{ badges: Map<string,number>, cards: Map<string,number>,
 *             cardCombos: Map<string,{count:number, sites:string[]}>, scanned: number }}
 */
export function censusStaticSurfaces(root = process.cwd()) {
  const badges = new Map();
  const cards = new Map();
  const cardCombos = new Map();
  let scanned = 0;

  for (const dir of ['src', 'app']) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file);
      scanned += 1;
      if (rel.startsWith(`src${path.sep}shared${path.sep}ui${path.sep}`)) continue;
      const source = stripComments(readFileSync(file, 'utf8'));

      for (const m of source.matchAll(/<span\b/g)) {
        if (isHandBadge(openingTag(source, m.index))) {
          badges.set(rel, (badges.get(rel) ?? 0) + 1);
        }
      }

      for (const m of source.matchAll(/<(div|section|article)\b/g)) {
        const tag = openingTag(source, m.index);
        if (!isHandCard(tag)) continue;
        cards.set(rel, (cards.get(rel) ?? 0) + 1);
        const axes = cardAxes(tag, source.slice(m.index + tag.length, m.index + tag.length + 300));
        const key = `${axes.radius} | ${axes.pad} | ${axes.surface} | ${axes.border} | ${axes.header}`;
        const line = source.slice(0, m.index).split('\n').length;
        const entry = cardCombos.get(key) ?? { count: 0, sites: [] };
        entry.count += 1;
        entry.sites.push(`${rel}:${line}`);
        cardCombos.set(key, entry);
      }
    }
  }
  return { badges, cards, cardCombos, scanned };
}

/** The shape to paste into the ledger — never hand-edited. */
export function ledgerLines(counts) {
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => `  ["${file.split(path.sep).join('/')}", ${count}],`)
    .join('\n');
}
