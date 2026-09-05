import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Folding a chip to icon-only is two halves, and one of them was optional.**
 *
 * `ChromeChip` already has a complete icon-only mode: the `compact` prop sends the
 * label `sr-only` **and** narrows the box to `--chrome-tile-size`. Its doc-block
 * also offers a second door — a responsive variant on `[data-chip-label]` — for
 * callers that collapse by viewport rather than by prop. That door only carried the
 * label half. The padding stayed, so the chip landed on a width belonging to no
 * role.
 *
 * Measured 2026-09-05, `/topology` top chrome at 1024×768:
 *
 * | Control | Width | Shape |
 * |---|---:|---|
 * | `topology-expand-all` · `-auto-arrange` · `-view-3d` · `-concept-search` | 36 | icon-only tile |
 * | `topology-switch-to-my-data` | **44** | icon-only chip, labelled padding |
 * | `topology-spotlight-toggle` | 88 | labelled — the owner's 2026-08-02 record |
 *
 * Three widths for what a person reads as one row of buttons, and the 44 is the one
 * that carried no meaning: it recorded which file collapsed the chip, not what the
 * control is. `design.md`, "Dimensional regularity".
 *
 * **Why a contract and not lint.** The verdict needs two class strings to agree
 * about one element, and the second lives behind a `ChromeChip` prop in another
 * file. `no-restricted-syntax` selects within one AST node; the pairing rules this
 * repository already keeps for accent/tint are contracts for the same reason.
 */

const ROOT = process.cwd();

/** The responsive door — hiding the label by viewport instead of by the `compact` prop. */
const LABEL_HOOK = /(max-[a-z0-9]+):\[&_\[data-chip-label\]\]:hidden/g;

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, acc);
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) acc.push(path);
  }
  return acc;
}

describe("크롬 칩 축소 — 라벨을 접으면 상자도 접힌다", () => {
  const files = sources(join(ROOT, "src"));

  it("탐지기가 공회전하지 않는다 — 반응형 라벨 접기가 실재한다", () => {
    const hooks = files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(LABEL_HOOK)]);
    // The day this reaches zero, every caller folds through the `compact` prop and this
    // contract can be retired — not before.
    expect(hooks.length, "반응형 라벨 접기를 하나도 못 찾았다 — 셀렉터가 깨졌다").toBeGreaterThan(0);
  });

  it("라벨을 접는 폭마다 같은 폭에서 상자도 타일 치수로 좁아진다", () => {
    // The shared constant counts as the pair for the breakpoint its own value carries —
    // its literal lives in `chrome-chip.tsx` so Tailwind's scanner can see it, and the
    // third case below proves it is the same box the `compact` prop applies.
    const chip = readFileSync(join(ROOT, "src/shared/ui/chrome-chip.tsx"), "utf8");
    const sharedBreakpoint = /export const CHROME_CHIP_COMPACT_BELOW_XL =\s*\n?\s*'(max-[a-z0-9]+):/.exec(chip)?.[1];
    expect(sharedBreakpoint, "공유 상수의 브레이크포인트를 못 읽었다").toBeTruthy();

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(LABEL_HOOK)) {
        const breakpoint = match[1];
        const narrows =
          (source.includes(`${breakpoint}:w-[var(--chrome-tile-size)]`) &&
            source.includes(`${breakpoint}:px-0`)) ||
          (breakpoint === sharedBreakpoint && source.includes("CHROME_CHIP_COMPACT_BELOW_XL"));
        if (!narrows) {
          offenders.push(`${file.slice(ROOT.length + 1)} — ${breakpoint} 에서 라벨만 접고 상자는 그대로다`);
        }
      }
    }
    expect(
      offenders,
      "아이콘만 남은 칩은 타일과 같은 정사각형이어야 한다. `CHROME_CHIP_COMPACT_BELOW_XL` 을 함께 쓰거나 `compact` 프롭으로 접어라.",
    ).toEqual([]);
  });

  it("공유 상수가 프롭 쪽 상자와 같은 값을 쓴다 — 두 벌이 갈라지지 않는다", () => {
    const chip = readFileSync(join(ROOT, "src/shared/ui/chrome-chip.tsx"), "utf8");
    const compactProp = /const COMPACT_CLASS =\s*'([^']+)'/.exec(chip)?.[1];
    const responsive = /export const CHROME_CHIP_COMPACT_BELOW_XL =\s*\n?\s*'([^']+)'/.exec(chip)?.[1];
    expect(compactProp, "`COMPACT_CLASS` 를 못 읽었다").toBeTruthy();
    expect(responsive, "`CHROME_CHIP_COMPACT_BELOW_XL` 을 못 읽었다").toBeTruthy();
    // Same declarations, one carrying a variant prefix. Comparing the stripped form
    // means a change to either side has to be a deliberate change to both.
    const strip = (value: string) =>
      value
        .split(/\s+/)
        .map((token) => token.replace(/^max-[a-z0-9]+:/, ""))
        .sort();
    expect(strip(responsive!), "반응형 축소 상자가 프롭 축소 상자와 다르다").toEqual(
      strip(compactProp!),
    );
  });
});
