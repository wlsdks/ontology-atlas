import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ICON_SIZE } from '../../src/shared/ui/tokens/icon-size';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Content icon sizes are a numeric JSX prop that value lints cannot see. Runtime-variable icons and
 * conditionals are invisible to this scan, so also measure `svg` in the browser.
 */

const ROOT = process.cwd();
const CSS = readGlobalCss();

/** Returns a ramp token's length in pixels at a 16px root; both `px` and `rem` are read. */
function cssPx(name: string): number {
  const m = CSS.match(new RegExp(`^\\s*${name}\\s*:\\s*([0-9.]+)(px|rem);`, 'm'));
  if (!m) throw new Error(`${name} 이 app/globals.css 에 없다`);
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** Terminates an opening tag by brace depth — the trap the control ratchet stepped on twice. */
/**
 * Comments are blanked before tag parsing, preserving offsets: an apostrophe in a comment inside a JSX
 * opening tag opens a quote that never closes and the parser runs past the tag.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
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

interface IconScan {
  /** Number of lucide opening tags (the denominator for the idling guard). */
  total: number;
  /** Off-ramp size literals per file (`size={N}` prop plus `size-N`/`h-N w-N` classes). */
  offRamp: Map<string, number>;
  /** Unspecified sizes per file (lucide renders those at its 24px default). */
  unsized: Map<string, number>;
}

/**
 * The size of an `icon={...}` slot is owned by the consumer: slots of the listed primitives set
 * `[&>svg]:size-` in CSS, so they do not count as unspecified. Unknown consumers still count.
 */
const SIZED_SLOT_OWNERS = new Set(['ChromeChip', 'ChromeTile', 'EmptyState']);

function slotOwner(source: string, tagIndex: number): string | null {
  const before = source.slice(0, tagIndex);
  if (!/icon=\{\s*$/.test(before)) return null;
  let owner: string | null = null;
  for (const m of before.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) owner = m[1];
  return owner;
}

function scanSource(rel: string, raw: string, ramp: Set<number>, acc: IconScan): void {
  // Tag parsing below must not see comment text — see `stripComments`.
  const source = stripComments(raw);
  // [^}] already spans newlines, so no /s flag is needed. Do not write it as
  // [\s\S]*? — the lazy quantifier swallows past another module's import and
  // contaminates the icon name set (it did, in a full scan: 9 files were silently
  // misclassified).
  /* Match both quote styles of the lucide import; a lazy `[\s\S]*?` would swallow other imports. */
  const importMatch = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/.exec(source);
  if (!importMatch) return;
  const lucide = new Set(
    importMatch[1]
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/).pop()?.trim() ?? '')
      .filter(Boolean),
  );
  for (const tagMatch of source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    if (!lucide.has(tagMatch[1])) continue;
    acc.total += 1;
    const tag = openingTag(source, tagMatch.index ?? 0);
    const prop = /\bsize=\{(\d+)\}/.exec(tag);
    const cls = /\bsize-(\d+(?:\.\d)?)\b/.exec(tag) ?? /\bh-(\d+(?:\.\d)?)\s+w-\1\b/.exec(tag);
    if (prop) {
      if (!ramp.has(Number(prop[1]))) acc.offRamp.set(rel, (acc.offRamp.get(rel) ?? 0) + 1);
    } else if (cls) {
      if (!ramp.has(Number(cls[1]) * 4)) acc.offRamp.set(rel, (acc.offRamp.get(rel) ?? 0) + 1);
    } else if (!tag.includes('size=') && !tag.includes('size-[') && !tag.includes('h-[')) {
      const owner = slotOwner(source, tagMatch.index ?? 0);
      if (owner !== null && SIZED_SLOT_OWNERS.has(owner)) continue;
      acc.unsized.set(rel, (acc.unsized.get(rel) ?? 0) + 1);
    }
  }
}

function scanProduction(ramp: Set<number>): IconScan {
  const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
      } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
        scanSource(path.relative(ROOT, p), readFileSync(p, 'utf8'), ramp, acc);
      }
    }
  };
  for (const root of ['src', 'app']) walk(path.join(ROOT, root));
  return acc;
}

/**
 * A literal ledger, not derived from the scan, so "it never grows" can fail. Listed files are debt,
 * not exemptions; delete a row when it reaches 0.
 */
const OFF_RAMP_DEBT: ReadonlyArray<readonly [string, number]> = [
  // An empty ledger does not idle the checks: the scanner still sweeps the repository and counts
  // the denominator, so one new off-ramp value fails as exceeding 0.
];

/**
 * Empty because an `icon={...}` slot is sized by its container (`SIZED_SLOT_OWNERS` plus the
 * CSS assertion on those primitives). A stray unspecified icon elsewhere fails.
 */
const UNSIZED_DEBT: ReadonlyArray<readonly [string, number]> = [];

describe('콘텐츠 아이콘 크기 램프', () => {
  const ramp = new Set<number>(Object.values(ICON_SIZE));

  it('CSS 램프(--icon-*)와 JS 거울(ICON_SIZE)이 같은 값이다', () => {
    expect(cssPx('--icon-sm')).toBe(ICON_SIZE.sm);
    expect(cssPx('--icon-md')).toBe(ICON_SIZE.md);
    expect(cssPx('--icon-lg')).toBe(ICON_SIZE.lg);
  });

  it('거울의 이름 집합이 3단(sm/md/lg)을 벗어나지 않는다 — 단을 늘리려면 원장부터', () => {
    expect(Object.keys(ICON_SIZE).sort()).toEqual(['lg', 'md', 'sm']);
  });

  it('램프 단이 타입 램프의 짝 위에 서 있다 — sm≈label·body, md=body-lg, lg=title', () => {
    // If the pairing is redefined (a type ramp revision), this assertion forces a re-decision.
    expect(ICON_SIZE.md).toBe(cssPx('--text-body-lg'));
    expect(ICON_SIZE.lg).toBe(cssPx('--text-title'));
    expect(ICON_SIZE.sm).toBeGreaterThan(cssPx('--text-label'));
    expect(ICON_SIZE.sm).toBeLessThan(cssPx('--text-body-lg'));
  });

  const scan = scanProduction(ramp);

  it('탐지기가 공회전하지 않는다 — 제품을 실제로 먹는다', () => {
    // Floor so that a vanished scan target cannot read as zero violations.
    expect(scan.total).toBeGreaterThanOrEqual(120);
  });

  it('램프 밖 크기 리터럴은 장부를 넘지 못한다 — 새 파일은 첫날부터 0', () => {
    const ledger = new Map(OFF_RAMP_DEBT);
    const over: string[] = [];
    for (const [file, count] of scan.offRamp) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(over, '램프 밖 아이콘 크기가 늘었다 — ICON_SIZE(12/14/16)를 쓰거나, 새 단이 필요하면 「체계」 소집 + 원장').toEqual([]);
  });

  it('장부의 0 회수분은 줄을 지운다 — 장부가 실측보다 후하면 래칫이 헐겁다', () => {
    const stale: string[] = [];
    for (const [file, allowed] of OFF_RAMP_DEBT) {
      const actual = scan.offRamp.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual} — 장부를 ${actual}로 내려라`);
    }
    expect(stale).toEqual([]);
  });

  it('무지정(기본 24px) lucide 는 장부를 넘지 못한다', () => {
    const ledger = new Map(UNSIZED_DEBT);
    const over: string[] = [];
    for (const [file, count] of scan.unsized) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(over, '크기 무지정 lucide 가 늘었다 — 기본 24 는 선택이 아니라 누락이다').toEqual([]);
    const stale: string[] = [];
    for (const [file, allowed] of UNSIZED_DEBT) {
      const actual = scan.unsized.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual}`);
    }
    expect(stale).toEqual([]);
  });

  /**
   * **The slot exemption holds only while the consumer really owns the size.** If
   * the classification trusted the `SIZED_SLOT_OWNERS` names alone, the day
   * `[&>svg]:size-*` is deleted from one of those primitives every slot icon would
   * fall back to 24px with nothing turning red. So the name set and the real CSS are
   * tied together here.
   */
  it('슬롯 소유자는 자기 슬롯의 svg 크기를 실제로 소유한다 ([&>svg]:size-*)', () => {
    const OWNER_FILES: Record<string, string> = {
      ChromeChip: 'src/shared/ui/controls/chrome-chip.tsx',
      ChromeTile: 'src/shared/ui/controls/chrome-tile.tsx',
      EmptyState: 'src/shared/ui/status/empty-state.tsx',
    };
    expect(Object.keys(OWNER_FILES).sort()).toEqual([...SIZED_SLOT_OWNERS].sort());
    for (const [owner, rel] of Object.entries(OWNER_FILES)) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(
        src.includes('[&>svg]:size-'),
        `${owner}(${rel}) 가 슬롯 svg 크기를 잃었다 — 슬롯 면제(SIZED_SLOT_OWNERS)의 전제가 무너진다`,
      ).toBe(true);
    }
  });

  /*
   * ── Standing probes: is the detector itself alive? Synthetic sources are fed to
   * the same function. (The gate-probe discipline: prove the detector consumes real
   * defects, not merely that violations exist.)
   */
  it('프로브: 램프 밖 prop·class 는 잡히고, 램프 값·문자열 size·비-lucide 는 통과한다', () => {
    const probe = (body: string): IconScan => {
      const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
      scanSource(
        'probe.tsx',
        `import { Check, Search } from 'lucide-react';\nimport { Select } from './x';\n${body}`,
        ramp,
        acc,
      );
      return acc;
    };
    // Violation — off-ramp numeric prop (also exercises multi-line tags and callback braces)
    const bad = probe('<Check\n  size={13}\n  onClick={() => {}}\n/>');
    expect(bad.offRamp.get('probe.tsx')).toBe(1);
    // Violation — off-ramp class notation
    expect(probe('<Check className="h-5 w-5" />').offRamp.get('probe.tsx')).toBe(1);
    // Healthy — the three ramp values
    const good = probe('<Check size={12} /><Check size={14} /><Search size={16} />');
    expect(good.offRamp.size).toBe(0);
    expect(good.total).toBe(3);
    // Healthy — ramp class notation (size-3 = 12px)
    expect(probe('<Check className="size-3" />').offRamp.size).toBe(0);
    // Unspecified — caught as the 24px default
    expect(probe('<Check aria-hidden />').unsized.get('probe.tsx')).toBe(1);
    // Unspecified in a slot — not unspecified when the slot belongs to a size-owning primitive
    const owned = probe('<ChromeChip icon={<Check aria-hidden />} />');
    expect(owned.unsized.size).toBe(0);
    expect(owned.total, '슬롯 면제가 분모까지 지우면 공회전 단언이 헐거워진다').toBe(1);
    // A slot on an **unknown consumer** still counts as unspecified (the exemption errs toward over-reporting)
    expect(probe('<Mystery icon={<Check aria-hidden />} />').unsized.get('probe.tsx')).toBe(1);
    // Off-ramp literals are still caught inside a slot
    expect(probe('<ChromeChip icon={<Check size={13} />} />').offRamp.get('probe.tsx')).toBe(1);
    // Correctly out of view — numeric size on a non-lucide tag, and string sizes
    expect(probe('<Select size={13} />').total).toBe(0);
    // A token reference is neither unspecified nor a violation
    const varRef = probe('<Check className="size-[var(--icon-sm)]" />');
    expect(varRef.offRamp.size).toBe(0);
    expect(varRef.unsized.size).toBe(0);
  });

  /**
   * Probe with double-quoted imports: probes written with single quotes only would share the
   * scanner's blind spot and prove nothing.
   */
  it('프로브: 큰따옴표 lucide import 도 본다 (73% 를 못 보던 실명의 재현)', () => {
    const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
    scanSource(
      'double.tsx',
      `import { Check } from "lucide-react";\n<Check size={13} />`,
      ramp,
      acc,
    );
    expect(acc.total, '큰따옴표 import 를 못 보면 이 래칫은 저장소의 73% 에 대해 존재하지 않는다').toBe(1);
    expect(acc.offRamp.get('double.tsx')).toBe(1);
  });

  /**
   * **Real coverage — the layer synthetic probes cannot prove.**
   *
   * "Not an empty set" and "sees the whole set" are different. The old denominator
   * assertion (≥120) proved only the former, so it stayed green while the scanner
   * skipped 73% of the files. This assertion checks that icons are actually being
   * counted in **both notations that exist in the repository**.
   */
  it('실물 커버리지: 두 따옴표 표기 파일 모두에서 아이콘을 센다', () => {
    const seen = { single: 0, double: 0 };
    const walkAll = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === 'node_modules' || name === '.next') continue;
          walkAll(p);
          continue;
        }
        if (!name.endsWith('.tsx') || name.endsWith('.test.tsx')) continue;
        const src = readFileSync(p, 'utf8');
        const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
        scanSource(path.relative(ROOT, p), src, ramp, acc);
        if (acc.total === 0) continue;
        if (/from\s*'lucide-react'/.test(src)) seen.single += acc.total;
        else if (/from\s*"lucide-react"/.test(src)) seen.double += acc.total;
      }
    };
    for (const root of ['src', 'app']) walkAll(path.join(ROOT, root));

    expect(seen.single, "작은따옴표 파일에서 센 아이콘이 0 — 스캐너가 한쪽 표기를 잃었다").toBeGreaterThan(50);
    expect(seen.double, "큰따옴표 파일에서 센 아이콘이 0 — 2026-08-05 의 실명이 되돌아왔다").toBeGreaterThan(50);
  });

  it('프로브: 스캔 루트가 공집합이면 실패한다', () => {
    const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
    scanSource('empty.tsx', '', ramp, acc);
    expect(acc.total).toBe(0); // Empty source is 0 — the denominator assertion (≥120) above blocks empty-set idling
  });
});
