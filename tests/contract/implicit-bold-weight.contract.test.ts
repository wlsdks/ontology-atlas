import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **`<b>` and `<strong>` must state a weight** — otherwise the browser default is
 * **700**, and 700 is outside this repository's weight ramp (510 · 560 · 650).
 *
 * ## Why this gate is required (measured 2026-08-05)
 *
 * **Even after** the weight axis was closed (#942) and every named step moved onto
 * the ramp, built screens were still painting 700. `/ko/projects/` alone showed
 * **7**, and the exhaustive count is **8 places**.
 *
 * What makes this defect special is that **no value is left in the code**. Without
 * a weight class on `<b>` there is no string for a lint selector to see, and no
 * source scan that counts off-ramp values can catch it. It is the same layer the
 * cursor-affordance gate (`cursor-affordance.spec.ts`) describes when it says a
 * missing central rule can only be seen by measuring the render — and this one was
 * likewise caught **by measuring the static export in a browser**.
 *
 * It had already **split within a single file**: of the 8 engraved-numeral `<b>`
 * elements in `TopologyV2DetailPanel`, 4 stated `strong` (650) and 4 did not.
 * Siblings in the same role diverged at 650 and 700 and nobody saw it.
 *
 * ## Why "must state" rather than "700 forbidden"
 *
 * Blocking places that write 700 is already `typographyAxisSelectors`'s job (the
 * `font-bold` named step is forbidden). What is blocked here is **writing nothing
 * at all**, so the predicate asks whether a value exists, not which value it is.
 *
 * `font-normal` (400) passes too — it is an explicit declaration that emphasis is
 * off, and it is genuinely used to return a `<b>` to body weight
 * (`ConceptEgoCard`, `CommitDetail`).
 */

const ROOT = process.cwd();
const WEIGHT_DECL = /font-\[var\(--font-weight-[a-z]+\)\]|font-(?:normal|medium|semibold|bold|light|black)(?![-\w])/;

/** Terminates an opening tag by brace depth — steps over multi-line tags and callback braces. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from, from + 3000);
}

/**
 * **Strips comments.** Without this the file falls into the trap it documents — the
 * doc-block above quotes `<b>`, and the first implementation counted 2 of its own
 * comments as violations. (The same disease as `unused-token-ratchet` mistaking a
 * token mentioned in a comment for a token in use, registered separately by the
 * 2026-08-05 audit.)
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export interface BoldScan {
  /** Total `<b>`/`<strong>` scanned — the denominator of the idling guard. */
  total: number;
  /** Places with no weight declaration. */
  implicit: string[];
}

export function scanSource(rel: string, raw: string, acc: BoldScan): void {
  const src = stripComments(raw);
  for (const m of src.matchAll(/<(b|strong)\b/g)) {
    const tag = openingTag(src, m.index ?? 0);
    acc.total += 1;
    let effective = tag;
    // When referenced by name, e.g. `className={numeralClass}`, expand that constant one level.
    const ref = /className=\{`?\$?\{?([A-Za-z_][A-Za-z0-9_]*)\}?/.exec(tag);
    if (ref && !/font-/.test(tag)) {
      const decl = new RegExp(`(?:const|let)\\s+${ref[1]}\\s*=\\s*([\\s\\S]{0,600}?);`, 'm').exec(src);
      if (decl) effective += ' ' + decl[1];
    }
    if (!WEIGHT_DECL.test(effective)) {
      const line = src.slice(0, m.index).split('\n').length;
      acc.implicit.push(`${rel}:${line}`);
    }
  }
}

function scanRepo(): BoldScan {
  const acc: BoldScan = { total: 0, implicit: [] };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!name.endsWith('.tsx') || name.includes('.test.')) continue;
      scanSource(path.relative(ROOT, p), readFileSync(p, 'utf8'), acc);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(ROOT, root));
  return acc;
}

describe('<b>/<strong> 은 무게를 명시한다', () => {
  const scan = scanRepo();

  it('스캔이 비어 있지 않다 — 공집합 위의 게이트는 게이트가 아니다', () => {
    expect(scan.total).toBeGreaterThan(10);
  });

  it('무게 선언이 없는 <b>/<strong> 이 0 이다 — 브라우저 기본 700 은 램프 밖이다', () => {
    expect(
      scan.implicit,
      '`<b>`/`<strong>` 에 무게를 안 적으면 브라우저 기본 700 으로 그려진다 — 램프는 510/560/650 이다.\n' +
        '음각 숫자·수치 강조는 `font-[var(--font-weight-strong)]`, 강조를 끄는 자리는 `font-normal`.\n' +
        `위반: ${scan.implicit.join(', ')}`,
    ).toEqual([]);
  });

  it('프로브 — 탐지기가 실제로 먹는다 (주석·상수 참조·명시 선언)', () => {
    const probe = (body: string): BoldScan => {
      const acc: BoldScan = { total: 0, implicit: [] };
      scanSource('probe.tsx', body, acc);
      return acc;
    };

    // Violation — no weight declared
    expect(probe('<b className="tabular-nums">1</b>').implicit).toEqual(['probe.tsx:1']);
    expect(probe('<strong>x</strong>').implicit).toEqual(['probe.tsx:1']);

    // Legitimate — token weight, and explicit removal
    expect(probe('<b className="font-[var(--font-weight-strong)]">1</b>').implicit).toEqual([]);
    expect(probe('<b className="font-normal tabular-nums">1</b>').implicit).toEqual([]);

    // Legitimate — referencing a constant by name still expands that constant
    const viaConst = probe(
      'const numeralClass = "font-mono font-[var(--font-weight-strong)] text-x";\n<b className={numeralClass}>1</b>',
    );
    expect(viaConst.implicit, '상수 참조를 못 펴면 진짜 위반과 구별되지 않는다').toEqual([]);
    // …and if that constant carries no weight it is still caught
    expect(probe('const c = "font-mono text-x";\n<b className={c}>1</b>').implicit).toEqual(['probe.tsx:2']);

    // A `<b>` inside a comment is not counted — this file's own doc-block produced a false positive in the first implementation
    expect(probe('// `<b>` 는 안 적으면 700 이다\nconst a = 1;').total).toBe(0);
    expect(probe('/* <strong>x</strong> */\nconst a = 1;').total).toBe(0);
  });
});
