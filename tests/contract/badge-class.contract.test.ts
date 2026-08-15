import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { badgeClass, type BadgeShape } from "../../src/shared/ui/badge-class";

/**
 * 정적 배지 값 층 계약 — **cva 가 합쳐 내는 결과 문자열**을 판정한다.
 *
 * lint 가 못 보는 층이다: 코드에는 `shape: 'pill'` 같은 키만 적혀 있고 실제
 * 값은 실행할 때 합쳐지므로 `no-restricted-syntax` 가 볼 문자열이 없다
 * (`control-class.contract.test.ts` 와 같은 형식·같은 이유).
 *
 * 잠그는 성질 넷:
 * 1. 모든 모양의 출력이 **램프 안**이다 — 반경 스텝 · 타입 스텝만. 램프 밖
 *    리터럴(`px-[3px]` · `#hex` · `text-sm`)이 새면 실패한다.
 * 2. 축이 조용히 늘지 않는다 — `shape` 하나 · 세 모양.
 * 3. **색과 자간은 값 층이 내지 않는다.** 실측에서 색 조합이 60종(최대
 *    클러스터 2)이라 수렴할 다수파가 없었고, 그래서 tone 축을 만드는 것은
 *    소비처 0 선택지를 만드는 일이 된다. 이 단언이 그 판단을 못박는다 —
 *    나중에 tone 을 넣으려면 이 줄을 고쳐야 하고, 그 diff 가 근거를 요구한다.
 * 4. 기본값은 가장 조용한 모양이다.
 */

const ROOT = process.cwd();
const SHAPES: BadgeShape[] = ["micro", "tag", "pill"];

/** 램프가 정한 반경·타입 스텝 이름. 값은 `app/globals.css` 가 소유한다. */
const RADIUS_STEPS = ["rounded-micro", "rounded-chip", "rounded-full"];
const TYPE_STEPS = ["text-caption", "text-label"];

describe("badgeClass — 정적 배지 값 층", () => {
  const all = SHAPES.map((shape) => ({ shape, out: badgeClass({ shape }) }));

  it("탐지기가 공회전하지 않는다 — 세 모양을 실제로 만든다", () => {
    expect(all).toHaveLength(3);
    for (const c of all) expect(c.out.length).toBeGreaterThan(20);
  });

  it("모든 조합이 램프 안에서만 값을 낸다", () => {
    const offenders: string[] = [];
    for (const { shape, out } of all) {
      const label = shape;
      // 반경은 램프 스텝 하나만.
      const radii = RADIUS_STEPS.filter((r) => new RegExp(`\\b${r}\\b`).test(out));
      if (radii.length !== 1) offenders.push(`${label}: 반경 스텝 ${radii.length}개`);
      // 타입도 램프 스텝 하나만.
      const types = TYPE_STEPS.filter((t) => new RegExp(`\\b${t}\\b`).test(out));
      if (types.length !== 1) offenders.push(`${label}: 타입 스텝 ${types.length}개`);
      // 색은 토큰만 — 생 hex·Tailwind 팔레트 금지.
      if (/#[0-9a-fA-F]{3,8}/.test(out)) offenders.push(`${label}: hex 리터럴`);
      if (/\b(?:text|bg|border)-(?:white|black|slate|gray|zinc|red|amber|indigo)-\d/.test(out)) {
        offenders.push(`${label}: Tailwind 팔레트`);
      }
      // 임의 길이 값 금지(px-[3px] 류).
      if (/\b(?:px|py|p|text|rounded)-\[[0-9.]/.test(out)) offenders.push(`${label}: 램프 밖 리터럴`);
    }
    expect(offenders, "값 층이 램프 밖으로 샜다").toEqual([]);
  });

  it("축이 조용히 늘지 않는다 — shape 3, 그리고 색·자간 축은 없다", () => {
    const source = readFileSync(path.join(ROOT, "src/shared/ui/badge-class.ts"), "utf8");
    const variants = source.slice(source.indexOf("variants: {"), source.indexOf("defaultVariants"));
    const axes = (variants.match(/^\s{4}[a-z]+: \{/gm) ?? []).map((s) => s.trim().replace(": {", ""));
    expect(axes, "축이 늘거나 줄었다 — 「체계」 소집이 먼저다").toEqual(["shape"]);
    const shapes = (variants.match(/^\s{6}[a-z]+:/gm) ?? []).length;
    expect(shapes, "shape 가 3을 벗어났다").toBe(3);
  });

  it("색·자간을 값 층이 내지 않는다 — 실측에 다수파가 없어 일부러 뺀 축이다", () => {
    for (const { shape, out } of all) {
      expect(out, `${shape}: 색이 값 층으로 들어왔다`).not.toMatch(/\b(?:bg|text)-\[color:/);
      expect(out, `${shape}: 자간이 값 층으로 들어왔다`).not.toMatch(/tracking-\[/);
      expect(out, `${shape}: 대문자 처리가 값 층으로 들어왔다`).not.toMatch(/uppercase/);
    }
  });

  it("기본값은 가장 조용한 모양이다 — tag", () => {
    expect(badgeClass()).toBe(badgeClass({ shape: "tag" }));
  });

  it("className 은 규격을 덮지 않고 자리잡기만 더한다", () => {
    const out = badgeClass({ shape: "pill", className: "ml-2 max-w-[12ch] truncate" });
    expect(out).toContain("rounded-full");
    expect(out).toContain("truncate");
  });
});
