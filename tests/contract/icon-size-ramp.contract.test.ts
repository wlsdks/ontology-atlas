import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ICON_SIZE } from '../../src/shared/ui/icon-size';

/**
 * Content icon size ramp — **CSS ↔ JS mirror plus an off-ramp literal ratchet.**
 *
 * ## Why this gate has to exist (체계 seat inventory 2026-08-04, docs/DECISIONS.md)
 *
 * Content icon (lucide) sizes arrive as a JSX **numeric prop** (`size={N}`). That
 * is not a className, so it is out of range of the value lints (`text-[Npx]` and
 * friends), and the size tokens (`--topology-chrome-icon-size` and so on) are
 * surface-owned, leaving content icons nothing to lean on. The result: 167 call
 * sites split across **9 px values** (10·11·12·13·14·15·16·17 plus unspecified 24),
 * and two surfaces mixed 4 values within a single file (docs palette 10/11/12/14 ·
 * dependency picker 10/11/12/13). That is drift, not role.
 * A field tester's note: *"아무것도 나에게 다른 값을 알려주지 않았다."*
 * (nothing told me the values differed)
 *
 * The same disease as the framer duration incident
 * (`motion-token-mirror.contract.test.ts`): **a value living in a channel no gate
 * watches will always drift.**
 *
 * ## Why a ratchet and not a lint rule
 *
 * 64 debt items cannot be cleared in one PR — each substitution moves rendered
 * pixels (±1–2px) and needs a per-place design verdict (the same reasoning as the
 * control ratchet's founding judgement). And a lint rule would need the debt files
 * excluded via `no-restricted-syntax`, but flat config replaces rule options
 * rather than merging them, so an icon-only exception block would swap out **those
 * files' ramp selectors wholesale** (the multi-block trap) — the exception's range
 * cannot be made to fit. The ratchet counts exactly these literals per file, and
 * **a new file must be 0 from day one.**
 *
 * ## Range
 *
 * Only lucide opening tags in production `.tsx` files that import lucide. Chrome
 * and rail icon tokens (`--*-icon-size` · `--chrome-icon`) are owned by the
 * surface contract and are out of scope. Two known limits, **both in the
 * under-reporting direction**:
 *
 * 1. **A conditional is not a literal and is invisible**, e.g.
 *    `size={cond ? 14 : undefined}` (1 place today, AppSettingsMenu — and that
 *    place is not a defect: all three variants are covered by a className token
 *    (`--app-nav-rail-utility-icon-size` · `--topology-chrome-icon-size`) or by
 *    size={14}. Re-measured 2026-08-15 — the earlier claim that "the else branch
 *    renders unspecified at 24" was a misreading that ignored the className).
 * 2. **Icons rendered through a runtime variable**
 *    (`const Icon = item.icon; <Icon size={17} />`) are invisible because the
 *    opening tag name is not in the lucide import set. Measured 2026-08-05: 8
 *    places, and **one of them really was off-ramp** — `BottomTabBar`'s nav icons
 *    at 17px **disagreed within a single bar** with the neighbouring "get the app"
 *    icon at 16px (found by measuring in the browser: the source scan saw not one
 *    17, while the screen drew four). It was fixed; the other 7 sit on the ramp.
 *    **Aliases such as `Map as MapIcon` are in view** (import parsing follows the
 *    alias).
 *
 * → **Never claim "0" from the source scan alone.** Both limits live in the
 *    rendered screen, so every round also measures `svg` in the browser.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

function cssPx(name: string): number {
  const m = CSS.match(new RegExp(`^\\s*${name}\\s*:\\s*([0-9.]+)px;`, 'm'));
  if (!m) throw new Error(`${name} 이 app/globals.css 에 없다`);
  return Number(m[1]);
}

/** Terminates an opening tag by brace depth — the trap the control ratchet stepped on twice. */
/**
 * Comments are blanked before tag parsing — byte offsets and line numbers are
 * preserved. `openingTag` tracks quotes, and a comment inside a JSX opening tag
 * defeats that: an English apostrophe (`This scrim's name`) opens a quote that
 * never closes, so the parser runs past the tag. Measured 2026-08-22 in
 * `control-adoption-ratchet`, where a census silently fell 5 → 4. Latent here
 * for the same reason and closed the same way.
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
 * **The size of an `icon={…}` slot is owned by the consumer** (2026-08-15).
 *
 * The previous ledger treated "unspecified lucide = renders at the 24px default"
 * and carried 9 places (5 files) as debt. **All 9 were false debt** — the slot
 * container sets the size in CSS in every case: ChromeChip
 * `[&>svg]:size-3.5` (14) · ChromeTile `[&>svg]:size-[var(--chrome-icon)]` (16) ·
 * EmptyState `[&>svg]:size-4` (16). "Repaying" these by adding a `size=` prop
 * would write the container's value a second time at the call site — and a value
 * written in two places starts drifting from then on (Carbon).
 *
 * So they are excluded from the unspecified count. But **not every `icon={` is
 * exempt**: only when the nearest opening tag before the slot is in the list below
 * (primitives proven by a separate assertion to set `[&>svg]:size-` on the slot).
 * An unknown consumer's `icon={<X/>}` still counts as unspecified — the
 * over-reporting direction, so a person sees it. Off-ramp literals such as
 * `size={13}` are still caught inside a slot.
 */
const SIZED_SLOT_OWNERS = new Set(['ChromeChip', 'ChromeTile', 'EmptyState']);

/** Slot-owner resolution — the nearest opening component tag before `icon={`. */
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
  /*
   * ⚠️ **Match both quote styles** (2026-08-05). This used to match only the single
   * quotes of `'lucide-react'`, while **72 of this repository's 99 lucide imports
   * used double quotes** — meaning the ratchet had never once seen **73% of the
   * icons**. The debt recorded in the ledger as 63 measured **230**.
   *
   * The denominator assertion (`total >= 120`) did not close this hole: 27
   * single-quote files alone exceed 120. **Not being an empty set is different from
   * seeing the whole set** — a denominator assertion proves only the former.
   *
   * A case of **syntax**, not value, evading a gate — the third in this round alone
   * (named weight steps · scoped-block override · here).
   */
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
 * **A literal ledger — not derived from the scan** (the control ratchet's
 * discipline: deriving the baseline from the measurement makes "it never grows"
 * impossible to fail in principle).
 *
 * Values are the 2026-08-04 inventory. Files listed here are **debt, not
 * exemptions** — the gate turns red when a count grows, and when it reaches 0 the
 * row must be deleted. Repaying is a design pass with a per-place before→after
 * table (±1–2px of pixel movement).
 */
/*
 * ## 2026-08-05: the ledger was wrong end to end — the scanner missed 73%
 *
 * See the quote-style comment above. The ledger said 16 files / 63 items; making
 * it see double-quoted imports produced **41 files / 230 items**. The ledger was
 * not generous, it was **blind**.
 *
 * **127 of those were repaid in that round** — the ones whose ramp step is
 * determined without a verdict (9·10·11 → sm, 17·18 → lg). At the same time the
 * 207 that were already on the ramp were converted from literals to `ICON_SIZE`
 * references: until then `ICON_SIZE` and `--icon-*` had **0 consumers**, so the
 * values merely happened to match and there was no ramp ("a token nobody uses is
 * misinformation, not a spec" — design.md).
 *
 * **The remaining 103 are all 13px and 15px.** Both sit **exactly halfway**
 * between two ramp steps (13 → 12|14, 15 → 14|16), so "nearest" gives no answer.
 * The ramp's tiebreaker is the type step sitting beside the icon, and measurement
 * found that **59 places have no type at all** (icon-only controls and icon-only
 * buttons). That is not a value a codemod can invent, so it goes to a design pass
 * with a per-place before→after table — the same reasoning as this file's founding
 * judgement.
 */
const OFF_RAMP_DEBT: ReadonlyArray<readonly [string, number]> = [
  // **2026-08-05: empty.** All 103 of the 13/15 ties were moved onto the ramp.
  //
  // An empty array must not make the checks below free green — the scanner still
  // sweeps the whole repository and counts the denominator (`total`), so a single
  // new off-ramp value turns it red as "exceeded the ledger's 0".
];

/**
 * **2026-08-15: empty — and empty because the ledger was wrong, not because it
 * was repaid.**
 *
 * The 9 places listed here (HomePage 3 · ConnectionsTab 2 · ImpactRankingCard 1 ·
 * SearchHint 2 · TopologyFitControl 1) were all `icon={…}` slots whose container
 * set the size in CSS (ChromeChip 14 · ChromeTile 16 · EmptyState 16). The old
 * premise that they "render at the 24px default" was a misreading that ignored the
 * container's `[&>svg]:size-*`. The `SIZED_SLOT_OWNERS` classification plus the
 * slot-owner CSS assertion carry that judgement now.
 *
 * An empty array does not make the check idle — the scanner still sweeps the whole
 * repository, and a single unspecified icon outside a slot, or inside an unknown
 * consumer's slot, turns it red as "exceeded the ledger's 0" (probes prove both
 * directions).
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
    // Measured 167 on 2026-08-04. Not there to block refactors that remove icons —
    // it is the floor that stops "the scan target vanished, therefore 0 violations"
    // from reading as green.
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
      ChromeChip: 'src/shared/ui/chrome-chip.tsx',
      ChromeTile: 'src/shared/ui/chrome-tile.tsx',
      EmptyState: 'src/shared/ui/empty-state.tsx',
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
   * **Quote-style probe — reproduces the blindness that actually occurred on
   * 2026-08-05.**
   *
   * The old scanner saw only single-quoted imports while **73% of this repository's
   * files used double quotes**. The synthetic probes above failed to catch it
   * because the probes themselves were written with single quotes only — **a probe
   * that shares the defect's assumption cannot prove the defect.**
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
