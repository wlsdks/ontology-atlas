import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANCHORED_KINDS,
  FOCUSLESS_KINDS,
  TRANSIENT_SURFACE_ATTR,
  transientSurface,
  type TransientSurfaceKind,
} from "@/shared/ui/transient-surface";

/**
 * **Stops declarations of transient surfaces from silently shrinking** (2026-08-11).
 *
 * The sweeping check (`tests/e2e/transient-surface-contract.spec.ts`) measures
 * **only declared surfaces**. So a deleted declaration turns that surface into
 * something that **does not exist** rather than something that violates, and the
 * sweep reports green without a word — the shape that cost this repository a release
 * in 2026-08 (a gate that had never once checked what it claimed to check).
 *
 * So what is locked here is not values but **count and vocabulary**: the number of
 * declaring places never falls below today's, and the kind name is one of five.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

const KINDS: readonly TransientSurfaceKind[] = ["anchored", "menu", "sheet", "notice", "hint"];

/** Source with comments stripped, so prose inside a comment is not mistaken for a declaration. */
const readCode = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(path) && !/\.test\./.test(path)) out.push(path);
  }
  return out;
}

const declaringFiles = walk(join(REPO_ROOT, "src"))
  .filter((path) => /transientSurface\(/.test(readCode(path)))
  .map((path) => relative(REPO_ROOT, path))
  .sort();

const declaredKinds = declaringFiles.flatMap((file) =>
  [...readCode(join(REPO_ROOT, file)).matchAll(/transientSurface\("([^"]+)"\)/g)].map(([, kind]) => kind),
);

/**
 * **Kinds this harness cannot measure today** — with the reason recorded
 * (2026-08-11).
 *
 * ⚠️ An empty list is the ideal, but **pretending it is empty is worse.** A
 * declaration nobody measures is decoration, which is the dissent recorded against
 * this change in the decision ledger. So what cannot be measured becomes **something
 * written here**, not something absent.
 *
 * Shrinking this list is allowed; growing it is not (the ratchet below).
 */
const UNMEASURED_KINDS: Readonly<Record<string, string>> = {
  menu: "캔버스 오른쪽 클릭으로만 열린다. 볼트를 안 고른 브라우저에서는 지도 위 패널이 캔버스를 덮어 클릭이 120초 타임아웃이 나고, 합성 PointerEvent 는 캔버스의 포인터 파이프라인에 닿지 않는다(2026-08-11 실측 3회). 볼트를 실제로 붙이는 하네스가 생기면 이 줄을 지운다.",
  hint: "마우스를 올려서만 열린다. 위와 같은 이유로 포인터를 못 보낸다. 그리고 어느 좌표에 대상이 있는지는 그래프가 정하므로, 억지로 열려고 좌표를 훑으면 「없는 것」을 결함으로 신고하게 된다.",
};

describe("잠깐 뜨는 표면 선언 계약", () => {
  /**
   * First registered 2026-08-11, 7 places — map guidance · node detail popover ·
   * context menu · cluster hint · edge hint · settings sheet · search palette ·
   * dropdown list.
   * **Growing is allowed; shrinking is not** (a ratchet).
   */
  it("선언하는 자리가 줄지 않는다", () => {
    expect(
      declaringFiles.length,
      `잠깐 뜨는 표면 선언이 ${declaringFiles.length}곳으로 줄었다 — 줄어든 곳은 스윕이 아예 보지 않는다:\n${declaringFiles.join("\n")}`,
    ).toBeGreaterThanOrEqual(7);
  });

  it("종류 이름은 다섯 중 하나뿐이다 — 오타는 「선언 없음」과 구별되지 않는다", () => {
    expect(declaredKinds.length, "선언을 하나도 못 찾았다 — 이 시험이 공회전한다").toBeGreaterThan(6);
    const unknown = [...new Set(declaredKinds)].filter((kind) => !KINDS.includes(kind as TransientSurfaceKind));
    expect(unknown, `모르는 종류: ${unknown.join(", ")}`).toEqual([]);
  });

  it("다섯 종류가 전부 쓰인다 — 아무도 안 쓰는 종류는 규격이 아니라 틀린 정보다", () => {
    const used = new Set(declaredKinds);
    const unused = KINDS.filter((kind) => !used.has(kind));
    expect(unused, `쓰이지 않는 종류: ${unused.join(", ")}`).toEqual([]);
  });

  it("초점을 못 받는 종류와 옆에 서야 하는 종류가 갈려 있다", () => {
    // If these two sets become identical, splitting the kinds meant nothing.
    expect(FOCUSLESS_KINDS.length).toBeGreaterThan(0);
    expect(ANCHORED_KINDS.length).toBeGreaterThan(FOCUSLESS_KINDS.length);
    for (const kind of FOCUSLESS_KINDS) expect(KINDS).toContain(kind);
    for (const kind of ANCHORED_KINDS) expect(KINDS).toContain(kind);
    // A sheet that blocks what is behind it must take focus — trapping is that surface's job.
    expect(FOCUSLESS_KINDS).not.toContain("sheet");
  });

  it("표시 이름과 도우미가 같은 것을 낸다 — 손으로 적을 자리를 남기지 않는다", () => {
    expect(TRANSIENT_SURFACE_ATTR).toBe("data-transient-surface");
    expect(transientSurface("notice")).toEqual({ "data-transient-surface": "notice" });
  });

  /**
   * Confirms the sweeping spec uses this marker as its selector. If the spec finds
   * surfaces another way (for example "the largest element"), this declaration becomes
   * decoration that does nothing — and that approach really did report 6 false
   * violations, which is why the marker exists.
   */
  /**
   * **Does every declared kind have a test that actually opens it** — and if not, is
   * the reason recorded? This is what makes the file worth having: attaching a marker
   * on its own protects nothing.
   */
  it("모든 종류가 재지거나, 못 재는 이유가 적혀 있다", () => {
    const specs = readdirSync(join(REPO_ROOT, "tests/e2e"))
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => readCode(join(REPO_ROOT, "tests/e2e", f)))
      .join("\n");
    /*
     * The sweep reads kinds from the screen, so its code contains no kind strings. The
     * list the sweep declares it must open (`SWEEP_MUST_OPEN`) is therefore read as
     * well — that list is asserted at runtime inside the sweep, so it cannot be empty
     * words.
     */
    const sweepDeclared =
      readCode(join(REPO_ROOT, "tests/e2e/transient-surface-contract.spec.ts")).match(
        /const SWEEP_MUST_OPEN = \[([^\]]*)\]/,
      )?.[1] ?? "";
    const unexercised = KINDS.filter(
      (kind) =>
        !specs.includes(`data-transient-surface="${kind}"`) &&
        !sweepDeclared.includes(`"${kind}"`) &&
        !(kind in UNMEASURED_KINDS),
    );
    expect(
      unexercised,
      `선언만 되고 아무 시험도 열지 않는 종류: ${unexercised.join(", ")} — 여는 시험을 쓰거나 UNMEASURED_KINDS 에 이유를 적어라.`,
    ).toEqual([]);
  });

  it("못 재는 종류가 늘지 않는다", () => {
    // Measured 2026-08-11: 2 kinds (menu, hint). Growing this needs evidence that the kind cannot be measured.
    expect(
      Object.keys(UNMEASURED_KINDS).length,
      `못 재는 종류가 ${Object.keys(UNMEASURED_KINDS).length}개로 늘었다 — 재는 하네스를 만드는 쪽이 답이다.`,
    ).toBeLessThanOrEqual(2);
    for (const [kind, reason] of Object.entries(UNMEASURED_KINDS)) {
      expect(KINDS, `.${kind} 는 종류 목록에 없다 — 죽은 면제다`).toContain(kind as TransientSurfaceKind);
      expect(reason.length, `${kind} 의 이유가 너무 짧다 — 「왜 못 재는가」가 답이어야 한다`).toBeGreaterThan(40);
    }
  });

  it("스윕이 이 표시로 표면을 찾는다", () => {
    const spec = readCode(join(REPO_ROOT, "tests/e2e/transient-surface-contract.spec.ts"));
    expect(spec, "스윕이 선언 표시를 셀렉터로 쓰지 않는다").toContain(`[${TRANSIENT_SURFACE_ATTR}]`);
    expect(spec, "스윕이 초점 계약을 재지 않는다").toMatch(/tookFocus/);
  });
});
