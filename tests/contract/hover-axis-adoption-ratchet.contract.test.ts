import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";
import { judgeRatchet } from "./lib/ratchet-base";

/**
 * **Hover axis adoption ratchet** — hand-written hovers can never grow
 * (2026-08-15, ledger 11).
 *
 * **Why this ratchet is born in the same PR as the axis.** This repository's
 * post-mortems are unambiguous: `Card`, `Badge`, and `DetailCard` all died with
 * **zero consumers**, and the cause of death was not the component but **a
 * component without a gate**. Everything alive today (Dialog, Checkbox,
 * SegmentedControl, badgeClass) shipped **migration and ratchet in the same
 * round**. An axis is no different — build the axis without the gate and the next
 * person simply hand-writes it.
 *
 * **What is counted.** Hand-written hover declarations (`hover:text-`,
 * `hover:bg-`, `hover:border-`) **inside a `controlClass({ … })` call block**.
 * Outside a call (native elements, hoisted constants) is **not this ratchet's
 * jurisdiction** — those places never went through the value layer at all, so the
 * debt is not "did not use the axis" but "this control is outside the value
 * layer", which belongs to `control-adoption-ratchet`.
 *
 * **The unit is a declaration, not a file.** Ledger entry 9 of 2026-08-15 learned
 * that from a probe: counting per file left a file with two of them green after
 * reverting one. **A ratchet whose unit is coarser than the defect's misses that
 * much.**
 *
 * **Why today's number is large — most places the axis does not cover.** The axis
 * carries only the measured majority (2 ink steps, 1 surface, 1 border). Of the
 * remaining 387, most are ⓐ indigo-family hovers (an axis the value layer
 * deliberately lacks — tint steps are a hierarchy call), ⓑ conditional or `active`
 * places (each needing its own guard decision), and ⓒ steps whose value differs
 * from the axis. **Reaching 0 is not the goal** — not growing is, and when it
 * falls the floor comes down.
 */

/**
 * **Judged against the change's merge base, not a literal** (2026-09-26).
 *
 * This file used to hold `CEILING` plus a dated line for every fall, and the literal
 * changed in 21 of its 22 commits, ten of them in the two weeks before the conversion.
 * Parallel branches that each migrated a hover conflicted on that line and on the
 * history paragraph above it. Now the census runs on the working tree and again on the
 * merge-base tree (`tests/contract/lib/ratchet-base.ts`), and only growth fails. A fall
 * is banked by the next branch's base without anyone writing it down; the history of
 * falls is in this file's Git history.
 *
 * A hover that must be hand-written, with a reason the axis cannot carry, is a
 * `tests/contract/ratchet-raises/hand-hover-declarations.<slug>.json` record.
 *
 * 280 is the measurement at conversion. It is never edited: it serves a clone with no
 * merge base, and is a floor for a tree compared with itself.
 */
const FALLBACK_CEILING = 280;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

/** Terminates `controlClass({ … })` by brace depth, so it is not cut short at a `=>`. */
function callBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/controlClass\(\{/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + "controlClass(".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (!depth) {
          i += 1;
          break;
        }
      }
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

const HAND_HOVER = /hover:(?:text|bg|border)-\[color:var\(/g;

function scan(root = process.cwd()) {
  const byFile = new Map<string, number>();
  let total = 0;
  let callsSeen = 0;
  let axisUsers = 0;

  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      const src = stripComments(readFileSync(file, "utf8"));
      for (const block of callBlocks(src)) {
        callsSeen += 1;
        if (/hover(?:Ink|Surface|Border):/.test(block)) axisUsers += 1;
        const n = [...block.matchAll(HAND_HOVER)].length;
        if (n) {
          byFile.set(rel, (byFile.get(rel) ?? 0) + n);
          total += n;
        }
      }
    }
  }
  return { byFile, total, callsSeen, axisUsers };
}

describe("호버 축 채택 래칫", () => {
  const census = scan();

  it("탐지기가 공회전하지 않는다 — 호출을 실제로 끊고 축 소비처가 실재한다", () => {
    expect(census.callsSeen, "controlClass 호출을 못 끊었다 — 파서가 죽었다").toBeGreaterThan(200);
    /*
     * **The axis must have consumers.** The discipline this repository adopted after
     * killing three components with zero consumers: an option with no consumer is
     * misinformation, not a spec. The day this assertion reaches 0 is the day the axis
     * died.
     */
    expect(census.axisUsers, "호버 축을 쓰는 호출이 없다 — 축이 소비처 0 이다").toBeGreaterThan(20);
  });

  it("손으로 쓴 호버가 늘지 않는다", () => {
    const verdict = judgeRatchet({
      gate: "hand-hover-declarations",
      measure: (root) => (root === process.cwd() ? census : scan(root)).total,
      reads: ["src", "app"],
      fallback: FALLBACK_CEILING,
    });
    expect(
      verdict.current,
      `손 호버 선언이 ${verdict.current} 로, 기준 ${verdict.ceiling} 을 넘었다.\n${verdict.explain}\n` +
        "값 층이 세 축을 갖고 있다 — `hoverInk`('strong'|'secondary') · " +
        "`hoverSurface`('lift') · `hoverBorder`('strong'). 그 값이면 축을 쓰고,\n" +
        "다른 값이 필요하면 **왜 다른지**를 먼저 대라(인디고 틴트 단은 값이 아니라 위계 판정이다).\n" +
        [...census.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it("탐지기가 심은 위반을 잡고 축 사용은 안 잡는다", () => {
    const hand = `controlClass({ shape: 'chip', className: 'hover:text-[color:var(--color-text-primary)]' })`;
    const axis = `controlClass({ shape: 'chip', hoverInk: 'strong' })`;
    const outside = `<button className="hover:text-[color:var(--color-text-primary)]" />`;
    const count = (s: string) =>
      callBlocks(s).reduce((a, b) => a + [...b.matchAll(HAND_HOVER)].length, 0);

    expect(count(hand), "손 호버를 못 잡는다").toBe(1);
    expect(count(axis), "축 사용을 위반으로 센다 — 그러면 쓸 이유가 사라진다").toBe(0);
    expect(count(outside), "호출 밖은 이 래칫의 관할이 아니다").toBe(0);
  });
});
