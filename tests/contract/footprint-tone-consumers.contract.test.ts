import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FOOTPRINT_TONE_FALLBACK,
  FOOTPRINT_TONE_TOKEN,
} from "@/shared/lib/appearance-preferences";

/**
 * Every trail tone reaches every consumer.
 *
 * ⚠️ **Written after the failure it describes.** A third tone was added to the union and to
 * the settings control, the map loop learned it, and the settings **preview** did not — so
 * choosing starlight painted the preview amber while the canvas painted white. The glyph
 * module lives in `shared` precisely so the two draw the same picture, and its own header
 * says a preview that drifts has stopped being a preview (design-system, 2026-09-10).
 *
 * The tokens are one exported table now, so this pins the property rather than the names: a
 * fourth tone fails here instead of shipping half-wired.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const TONES = Object.keys(FOOTPRINT_TONE_TOKEN);

describe("걸어온 길 톤 — 모든 소비처가 모든 톤을 안다", () => {
  it("토큰 표와 폴백 표가 같은 톤을 가진다", () => {
    expect(TONES.length).toBeGreaterThan(0);
    expect(read("src/widgets/ontology-map/ui/use-topology-loop.ts")).toContain("useTopologyAppearanceEffects({");
    expect(Object.keys(FOOTPRINT_TONE_FALLBACK).sort()).toEqual([...TONES].sort());
  });

  it("모든 톤이 실제로 정의된 CSS 토큰을 가리킨다", () => {
    const css = read("app/globals.css");
    for (const [tone, cssVar] of Object.entries(FOOTPRINT_TONE_TOKEN)) {
      expect(
        new RegExp(`${cssVar}:\\s*#[0-9a-fA-F]{6}`).test(css),
        `${tone} 톤의 ${cssVar} 가 globals.css 에 없다`,
      ).toBe(true);
    }
  });

  it("폴백 값이 토큰 값과 바이트 단위로 같다", () => {
    const css = read("app/globals.css");
    for (const [tone, cssVar] of Object.entries(FOOTPRINT_TONE_TOKEN)) {
      const hex = new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(
        [...FOOTPRINT_TONE_FALLBACK[tone as keyof typeof FOOTPRINT_TONE_FALLBACK]],
        `${tone} 폴백이 ${cssVar} 와 다르다 — 토큰이 사라진 순간 다른 색이 나온다`,
      ).toEqual(rgb);
    }
  });

  /*
   * The two consumers must reach the tone through the shared table, not through a branch of
   * their own. A hand-written `tone === "..."` in either file is how the divergence happened.
   */
  it.each([
    ["src/widgets/ontology-map/ui/use-topology-appearance-effects.ts", "the map canvas"],
    ["src/widgets/app-settings-menu/ui/FootprintSettings.tsx", "the settings preview"],
  ])("%s 는 공유 표로 톤을 읽는다", (rel) => {
    const source = read(rel);
    expect(source, `${rel} 가 FOOTPRINT_TONE_TOKEN 을 쓰지 않는다`).toContain(
      "FOOTPRINT_TONE_TOKEN",
    );
    expect(
      /--color-footprint-trail(-indigo|-star)?['"]/.test(source),
      `${rel} 가 톤 토큰 이름을 직접 적었다 — 표를 우회하면 다음 톤에서 또 갈라진다`,
    ).toBe(false);
  });
});
