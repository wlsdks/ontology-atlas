import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  OVERLAY_RISE,
  OVERLAY_SETTLED,
  SHEET_RISE,
  SHEET_RISE_REDUCED,
  SHEET_SETTLED,
} from "@/shared/motion";

/**
 * **A surface's starting place is a name, not a number.**
 *
 * `src/shared/motion` had the entry clock (`MOTION`) and the exit clock
 * (`EXIT_TRANSITION`) under the mirror contract from 2026-07 and 2026-09-05, and the
 * distance stayed a literal: on 2026-09-08 eight files wrote their own
 * `{ opacity: 0, y: 8 }` or `{ opacity: 0, y: 12, scale: 0.985 }`, 16 sites in all. That
 * is the setup every doc-block in that module warns about — duplicate a value and
 * eventually only one copy changes.
 *
 * This gate is the reason the names hold. It scans the tracked source for a framer
 * `initial` / `animate` / `exit` prop carrying its own `y:` offset and requires the
 * module's constants instead. Two grammars are named because two exist; a third would
 * be a new motion decision, and this test is where it has to be argued rather than
 * typed.
 */
const ROOT = path.join(import.meta.dirname, "..", "..");

const TRACKED = execFileSync("git", ["ls-files", "src", "app"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => /\.tsx?$/.test(f))
  .filter((f) => !/\.(test|spec)\.tsx?$/.test(f))
  // The module that owns the values is where they are allowed to be literals.
  .filter((f) => !f.startsWith("src/shared/motion/"));

/**
 * The gate is **narrow on purpose**: it refuses a literal that duplicates a value the
 * module already names, not every offset in the codebase. A census on 2026-09-08 found
 * six entrance shapes; two of them were copy-pasted 16 times and are now named, while
 * `y: 4` (the similar-node warning), `y: 10` (the project detail header), `y: -8` with
 * `scale: 0.98` (the palette dropping from above) and the drawer's `x`/`y` pairs each
 * have one consumer. A single-consumer value is not a token — that is the module's own
 * rule and `design.md`'s — so naming them would be misinformation, and gating them
 * would be a rule with nothing to catch.
 */
const NAMED_STARTS = [
  { name: "OVERLAY_RISE", axes: [/\bopacity:\s*0\b/, /\by:\s*8\b/], forbidExtra: /\bscale:/ },
  {
    name: "SHEET_RISE",
    axes: [/\bopacity:\s*0\b/, /\by:\s*12\b/, /\bscale:\s*0\.985\b/],
    forbidExtra: null,
  },
] as const;

/** One `initial` / `animate` / `exit` prop's object literal, in either JSX or object form. */
const MOTION_PROP = /\b(?:initial|animate|exit)\s*[=:]\s*\{\{?([^}]*)\}/g;

function offenders(): Array<{ file: string; line: number; name: string; text: string }> {
  const found: Array<{ file: string; line: number; name: string; text: string }> = [];
  for (const file of TRACKED) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    if (!source.includes("y:")) continue;
    source.split("\n").forEach((text, index) => {
      MOTION_PROP.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MOTION_PROP.exec(text)) !== null) {
        const body = match[1];
        for (const start of NAMED_STARTS) {
          if (!start.axes.every((axis) => axis.test(body))) continue;
          if (start.forbidExtra && start.forbidExtra.test(body)) continue;
          found.push({ file, line: index + 1, name: start.name, text: text.trim() });
        }
      }
    });
  }
  return found;
}

describe("framer 등장 문법 — 시작 위치는 이름으로만 온다", () => {
  it("두 문법의 값이 실제로 그 두 개다 — 이름만 있고 값이 바뀌면 소용없다", () => {
    expect(OVERLAY_RISE).toEqual({ opacity: 0, y: 8 });
    expect(OVERLAY_SETTLED).toEqual({ opacity: 1, y: 0 });
    expect(SHEET_RISE).toEqual({ opacity: 0, y: 12, scale: 0.985 });
    expect(SHEET_SETTLED).toEqual({ opacity: 1, y: 0, scale: 1 });
    expect(SHEET_RISE_REDUCED).toEqual({ opacity: 0, y: 0, scale: 1 });
  });

  it("쉬는 자리는 시작 자리의 모든 축을 되돌린다 — scale 을 빠뜨리면 작은 채로 멈춘다", () => {
    for (const [start, rest] of [
      [OVERLAY_RISE, OVERLAY_SETTLED],
      [SHEET_RISE, SHEET_SETTLED],
    ] as const) {
      expect(Object.keys(rest).sort()).toEqual(Object.keys(start).sort());
    }
  });

  it("탐지기가 공회전하지 않는다 — 실제 파일을 읽고, 이름 붙은 값만 잡는다", () => {
    expect(TRACKED.length).toBeGreaterThan(200);
    const hits = (line: string) => {
      MOTION_PROP.lastIndex = 0;
      let m: RegExpExecArray | null;
      const names: string[] = [];
      while ((m = MOTION_PROP.exec(line)) !== null) {
        for (const start of NAMED_STARTS) {
          if (!start.axes.every((a) => a.test(m![1]))) continue;
          if (start.forbidExtra && start.forbidExtra.test(m![1])) continue;
          names.push(start.name);
        }
      }
      return names;
    };
    expect(hits("initial={{ opacity: 0, y: 8 }}")).toEqual(["OVERLAY_RISE"]);
    expect(hits("initial={{ y: 8, opacity: 0 }}")).toEqual(["OVERLAY_RISE"]);
    expect(hits("exit={{ opacity: 0, y: 12, scale: 0.985 }}")).toEqual(["SHEET_RISE"]);
    // A one-off offset is not this gate's business.
    expect(hits("initial={{ opacity: 0, y: 4 }}")).toEqual([]);
    expect(hits("initial={{ opacity: 0, y: -8, scale: 0.98 }}")).toEqual([]);
    // And a name is never a hit.
    expect(hits("initial={SHEET_RISE}")).toEqual([]);
  });

  it("이름이 있는 시작 위치는 어디에서도 숫자로 다시 적히지 않는다", () => {
    const hits = offenders();
    expect(
      hits,
      `A start position that already has a name was written out by hand. Use that name from @/shared/motion:\n` +
        hits.map((h) => `  ${h.file}:${h.line}  ${h.name} ← ${h.text}`).join("\n"),
    ).toEqual([]);
  });
});
