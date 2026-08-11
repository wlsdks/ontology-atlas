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
 * **잠깐 뜨는 표면의 선언이 조용히 줄어들지 않게 한다** (2026-08-11).
 *
 * 훑는 검사(`tests/e2e/transient-surface-contract.spec.ts`)는 **선언한 표면만** 잰다.
 * 그래서 선언이 사라지면 그 표면은 위반이 아니라 **없는 것**이 되고, 스윕은 아무 말 없이
 * 초록을 낸다 — 이 저장소가 2026-08 에 릴리스를 잃은 그 모양(«검사한다고 말한 것을 한
 * 번도 실제로 검사해 본 적 없는 게이트»)이다.
 *
 * 그래서 여기서 잠그는 것은 값이 아니라 **개수와 어휘**다: 선언하는 자리가 오늘보다 줄지
 * 않고, 종류 이름은 다섯 중 하나뿐이다.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

const KINDS: readonly TransientSurfaceKind[] = ["anchored", "menu", "sheet", "notice", "hint"];

/** 주석을 걷어낸 코드 — 주석 안의 설명이 선언으로 오인되지 않게. */
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
 * **오늘 이 하네스로는 못 재는 종류** — 이유를 여기 적는다 (2026-08-11).
 *
 * ⚠️ 이 칸이 비어 있는 것이 이상적이지만, **비어 있는 척하는 것이 더 나쁘다.** 선언만
 * 해 두고 아무도 재지 않으면 그 선언은 장식이고, 그건 이 변경의 결정 기록에 내가 직접
 * 적어 둔 반대 의견이다. 그래서 못 재는 것은 「없는 것」이 아니라 **여기 적힌 것**이 된다.
 *
 * 줄이는 것은 되고 늘리는 것은 안 된다(아래 래칫).
 */
const UNMEASURED_KINDS: Readonly<Record<string, string>> = {
  menu: "캔버스 오른쪽 클릭으로만 열린다. 볼트를 안 고른 브라우저에서는 지도 위 패널이 캔버스를 덮어 클릭이 120초 타임아웃이 나고, 합성 PointerEvent 는 캔버스의 포인터 파이프라인에 닿지 않는다(2026-08-11 실측 3회). 볼트를 실제로 붙이는 하네스가 생기면 이 줄을 지운다.",
  hint: "마우스를 올려서만 열린다. 위와 같은 이유로 포인터를 못 보낸다. 그리고 어느 좌표에 대상이 있는지는 그래프가 정하므로, 억지로 열려고 좌표를 훑으면 「없는 것」을 결함으로 신고하게 된다.",
};

describe("잠깐 뜨는 표면 선언 계약", () => {
  /**
   * 2026-08-11 최초 등재 7곳 — 지도 안내 · 노드 상세 팝오버 · 컨텍스트 메뉴 ·
   * 클러스터 힌트 · 엣지 힌트 · 설정 시트 · 검색 팔레트 · 드롭다운 목록.
   * **늘리는 것은 되고 줄이는 것은 안 된다**(래칫).
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
    // 이 두 집합이 같아지면 종류를 나눈 의미가 없어진다.
    expect(FOCUSLESS_KINDS.length).toBeGreaterThan(0);
    expect(ANCHORED_KINDS.length).toBeGreaterThan(FOCUSLESS_KINDS.length);
    for (const kind of FOCUSLESS_KINDS) expect(KINDS).toContain(kind);
    for (const kind of ANCHORED_KINDS) expect(KINDS).toContain(kind);
    // 뒤를 막는 시트는 초점을 받아야 한다 — 가두는 것이 그 표면의 일이다.
    expect(FOCUSLESS_KINDS).not.toContain("sheet");
  });

  it("표시 이름과 도우미가 같은 것을 낸다 — 손으로 적을 자리를 남기지 않는다", () => {
    expect(TRANSIENT_SURFACE_ATTR).toBe("data-transient-surface");
    expect(transientSurface("notice")).toEqual({ "data-transient-surface": "notice" });
  });

  /**
   * 훑는 스펙이 이 표시를 셀렉터로 쓰는지 확인한다. 스펙이 다른 방법으로 표면을
   * 찾으면(예: 「가장 큰 요소」) 이 선언은 아무 일도 하지 않는 장식이 된다 — 그 방식이
   * 실제로 위반 6건을 헛보고했고, 그래서 이 표시가 생겼다.
   */
  /**
   * **선언한 종류마다 그것을 실제로 여는 시험이 있나** — 없으면 이유가 적혀 있어야 한다.
   * 이 시험이 이 파일의 값어치다: 표시를 붙이는 것만으로는 아무것도 지켜지지 않는다.
   */
  it("모든 종류가 재지거나, 못 재는 이유가 적혀 있다", () => {
    const specs = readdirSync(join(REPO_ROOT, "tests/e2e"))
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => readCode(join(REPO_ROOT, "tests/e2e", f)))
      .join("\n");
    /*
     * 스윕은 화면에서 종류를 읽으므로 코드에 종류 문자열이 없다. 그래서 스윕이 「반드시
     * 연다」고 선언한 목록(`SWEEP_MUST_OPEN`)도 함께 읽는다 — 그 목록은 스윕 안에서
     * 런타임으로 단언되므로 빈말이 될 수 없다.
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
    // 2026-08-11 실측 2종(menu · hint). 늘리려면 그 종류를 재는 방법이 없다는 근거가 필요하다.
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
