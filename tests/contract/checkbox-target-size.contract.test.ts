import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The **target size** contract for native checkboxes and radios
 * (WCAG 2.5.8 AA — 24×24).
 *
 * **Why this gate is needed — two checks missed it side by side.** Exhaustive count
 * 2026-08-05: **all 5 native checkboxes were under 24px** (`h-4`=16 · `h-3.5`=14 ·
 * `size-3.5`=14 ×2 · **no size class at all** ×1). Yet not one gate in this
 * repository went red:
 *
 * | Gate | Why it could not see |
 * |---|---|
 * | `control-adoption-ratchet` | it counts only the tags `button`, `Link`, `a` |
 * | `touch-target-contract.spec.ts` | all four selectors are `button, a[href]` |
 *
 * **Both guard hand-written controls, and forms were outside both fields of view.**
 * So forms could grow without limit, and they did.
 *
 * **The predicate is WCAG transcribed.** A target is not "how many px is the icon"
 * but **"what receives the click"** (SC 2.5.5 Understanding). When a `<label>`
 * wraps the checkbox, the **native behaviour** that clicking the label toggles it
 * makes the whole label one target. So there are two ways to pass:
 *
 * 1. the checkbox itself is at least 24px, or
 * 2. **the wrapping `<label>` has a 24px floor**.
 *
 * All five places today chose (2) — growing a 14px checkbox to 24px would make it
 * larger than the 11px label text, inverting the hierarchy in the opposite
 * direction ("the thing you press is smaller than its label"). Instead the label
 * carries `min-h-6` (24, AA) together with `atlas-touch-floor` (coarse 44, toward
 * AAA).
 *
 * **What this check cannot do — hence a separate e2e.** It reads source only, so it
 * does not know the **rendered rect**. If a label has the 24px floor but a parent
 * clips it with `overflow-hidden`, this check is green while the screen fails. That
 * layer belongs to `tests/e2e/touch-target-contract.spec.ts`. This contract watches
 * the **cause** (is the floor in the code); the e2e watches the **result** (is it 24
 * on screen).
 */

const ROOT = join(__dirname, '..', '..');
const ROOTS = [join(ROOT, 'src'), join(ROOT, 'app')];

/** Tailwind's `size-N`/`h-N` are in 0.25rem units — 24px is `6`. */
const AA_MIN_PX = 24;
const TAILWIND_STEP_PX = 4;

/** Markers indicating a label carries the floor. `.atlas-touch-floor` is coarse-only, so it cannot satisfy AA alone. */
const AA_FLOOR_CLASS = /\bmin-h-(\d+(?:\.\d+)?)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.|\.spec\./.test(name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Strip comments. **This repository hit this defect four times in 2026-08 alone** —
 * either counting example code inside a comment as a violation (over-report) or
 * missing a real violation hidden behind one (under-report).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Reads px from `size-6`, `h-6`, `size-[24px]` and friends. null when unreadable. */
function declaredPx(className: string): number | null {
  const bracket = className.match(/\b(?:size|h)-\[(\d+(?:\.\d+)?)px\]/);
  if (bracket) return Number(bracket[1]);
  const step = className.match(/\b(?:size|h)-(\d+(?:\.\d+)?)\b/);
  if (step) return Number(step[1]) * TAILWIND_STEP_PX;
  return null;
}

type Site = {
  file: string;
  type: string;
  className: string;
  ownPx: number | null;
  labelFloorPx: number | null;
  hasCoarseFloor: boolean;
};

/**
 * Finds checkboxes/radios and reads the floor from **the opening tag of the nearest
 * enclosing `<label>`**, scanning backwards.
 *
 * Scanning backwards works without parsing JSX: "is this input inside a label" can
 * be decided by finding the nearest preceding `<label` and checking that no
 * `</label>` sits in between.
 */
/**
 * Slices from `<input` to where the tag **really ends**.
 *
 * ⚠️ **`[^>]*` does not work — the first version did that and mis-flagged all five
 * places.** A JSX handler is an arrow function (`onChange={(e) => …}`), so the
 * slice stops at that `>` and never reaches the `className` after it. The verdict
 * becomes "no size class" while the code plainly has one.
 *
 * Brace depth is counted, and only a `>` **at depth 0** ends the tag.
 */
function inputTagAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Extracts from a **source string** rather than a file, so synthetic probes do not depend on the real count. */
function collectFromSource(label: string, raw: string): Site[] {
  const sites: Site[] = [];
  const source = stripComments(raw);
  for (const m of source.matchAll(/<input\b/g)) {
    const tag = inputTagAt(source, m.index ?? 0);
    const typeMatch = tag.match(/type=["'](checkbox|radio)["']/);
    if (!typeMatch) continue;
    const className = tag.match(/className=["']([^"']*)["']/)?.[1] ?? '';
    sites.push({
      file: label,
      type: typeMatch[1],
      className,
      ownPx: declaredPx(className),
      labelFloorPx: null,
      hasCoarseFloor: false,
    });
  }
  return sites;
}

function collect(files: string[]): Site[] {
  const sites: Site[] = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/<input\b/g)) {
      const tag = inputTagAt(source, m.index ?? 0);
      const typeMatch = tag.match(/type=["'](checkbox|radio)["']/);
      if (!typeMatch) continue;
      const className = tag.match(/className=["']([^"']*)["']/)?.[1] ?? '';

      const before = source.slice(0, m.index ?? 0);
      const labelOpen = before.lastIndexOf('<label');
      const labelClose = before.lastIndexOf('</label>');
      const wrapped = labelOpen !== -1 && labelOpen > labelClose;
      let labelFloorPx: number | null = null;
      let hasCoarseFloor = false;
      if (wrapped) {
        const labelTag = source.slice(labelOpen, source.indexOf('>', labelOpen) + 1);
        /*
         * The floor arrives two ways — as a literal (`min-h-6 atlas-touch-floor`) or from
         * the **value layer** (`fieldLabel({ row: true })`). Not knowing the latter makes
         * this gate **punish progress** the moment the spec moves into the value layer —
         * the failure hit twice today. What `fieldLabel`'s `row` emits is guarded by its
         * own contract (`field-class.contract.test.ts`).
         */
        const viaValueLayer = /fieldLabel\s*\(\s*\{[^}]*\brow:\s*true/.test(labelTag);
        const floor = labelTag.match(AA_FLOOR_CLASS);
        labelFloorPx = viaValueLayer ? AA_MIN_PX : floor ? Number(floor[1]) * TAILWIND_STEP_PX : null;
        hasCoarseFloor = viaValueLayer || labelTag.includes('atlas-touch-floor');
      }
      sites.push({
        file: file.slice(ROOT.length + 1),
        type: typeMatch[1],
        className,
        ownPx: declaredPx(className),
        labelFloorPx,
        hasCoarseFloor,
      });
    }
  }
  return sites;
}

const sites = collect(ROOTS.flatMap(walk));

describe('네이티브 체크박스·라디오의 타깃 크기 (WCAG 2.5.8 AA)', () => {
  /**
   * Idling guard. This repository has repeatedly built gates that cannot distinguish
   * "0 because it is clean" from "0 because nothing was looked at" — if the scanner
   * goes quiet, this assertion turns red first.
   */
  /**
   * ⚠️ **Never put a lower bound on the number of defects (or targets)** (caught in
   * the 2026-08-06 re-review).
   *
   * This assertion used to require **at least 5** checkboxes. The measurement was
   * **6**, leaving a margin of **1** — deleting one checkbox turns it red for no
   * reason. The same disease as "the gate punishes progress", hit six times in this
   * repository today.
   *
   * The question is not "are there enough targets" but **"is the scanner alive"**. So
   * it checks ① that enough files were scanned (the scanner's field of view) and
   * ② that a checkbox is really extracted from a **synthetic tag** (the predicate's
   * survival). Neither depends on the real count.
   */
  it('탐지기가 살아 있다 — 시야가 넓고, 합성 체크박스를 실제로 뽑는다', () => {
    expect(
      ROOTS.flatMap(walk).length,
      '훑은 파일이 너무 적다 — 스캐너의 시야가 죽었다',
    ).toBeGreaterThan(300);

    const probe = collectFromSource(
      'probe.tsx',
      '<input type="checkbox" className="size-4" onChange={(e) => go(e)} />',
    );
    expect(probe.length, '합성 체크박스를 못 뽑았다 — 태그 파서가 죽었다').toBe(1);
    expect(probe[0].ownPx, '합성 체크박스의 크기를 못 읽었다').toBe(16);
  });

  it.each(sites.map((s) => [`${s.file} (${s.type})`, s] as const))(
    '%s — 자기 24px 이거나 감싸는 라벨이 24px 바닥을 갖는다',
    (_name, site) => {
      const ownOk = site.ownPx !== null && site.ownPx >= AA_MIN_PX;
      const labelOk = site.labelFloorPx !== null && site.labelFloorPx >= AA_MIN_PX;
      expect(
        ownOk || labelOk,
        `자기 크기 ${site.ownPx ?? '미지정'}px · 라벨 바닥 ${site.labelFloorPx ?? '없음'}px. ` +
          '체크박스를 24px 로 키우거나, 감싸는 <label> 에 `min-h-6` 을 얹어라 ' +
          '(라벨 클릭이 곧 토글이라 라벨 전체가 하나의 타깃이다).',
      ).toBe(true);
    },
  );

  /**
   * With no size class at all the browser default renders (≈13px on Chromium macOS).
   * **No value is left in the code, so no value-reading lint can see it** — the form
   * edition of "what was never written leaves no trace in the code", a failure this
   * repository has hit repeatedly. `AtlasGitPanel`'s push opt-in was in exactly that
   * state.
   */
  it.each(sites.map((s) => [s.file, s] as const))(
    '%s — 크기를 UA 기본값에 맡기지 않는다',
    (_file, site) => {
      expect(
        site.ownPx,
        '크기 클래스가 없다. 브라우저마다 다른 값이 그려지고, 값이 코드에 안 남아 lint 도 못 본다.',
      ).not.toBeNull();
    },
  );

  it('손가락에서도 바닥이 있다 — 라벨로 타깃을 낸 자리는 coarse 44 도 함께 받는다', () => {
    const labelTargeted = sites.filter((s) => !(s.ownPx !== null && s.ownPx >= AA_MIN_PX));
    expect(labelTargeted.length, '라벨로 타깃을 내는 자리가 없다면 이 단언은 헛돈다').toBeGreaterThan(0);
    const missing = labelTargeted.filter((s) => !s.hasCoarseFloor);
    expect(
      missing.map((s) => s.file),
      'AA 24 는 마우스 기준이다. 손가락(coarse)에서는 `atlas-touch-floor` 가 44 를 낸다.',
    ).toEqual([]);
  });

  /**
   * Locks visual size against scattering. Before the fix the five places were 16 ·
   * 14 · 14 · 14 · UA default — the same part carrying a different value per place is
   * the defect this repository calls "50 distinct combinations".
   */
  it('체크박스 시각 크기가 한 값으로 모인다', () => {
    const sizes = [...new Set(sites.map((s) => s.ownPx))].sort();
    expect(sizes.length, `체크박스 크기가 ${sizes.join(' · ')} 로 갈렸다`).toBe(1);
  });
});
