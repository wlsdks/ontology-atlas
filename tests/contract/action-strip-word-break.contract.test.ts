import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **Korean labels in a narrow multi-column strip must not break mid-word.**
 *
 * ## Why this gate exists (measured in the installed app, 2026-07-29)
 *
 * The node detail panel's action strip has **five columns** on the web, so labels fit
 * on one line. In the installed app the LLM bridge adds 「말로 시키기」 and makes it
 * **six columns**; as the columns narrowed, three labels broke at a syllable:
 *
 *   「AI 요약 복 / 사」 · 「말로 시키 / 기」 · 「이것만 보 / 기」
 *
 * The browser's default line breaking splits CJK by syllable, so **any label does
 * this once the width narrows** — shortening the copy treats the symptom and it
 * breaks again at the next label.
 *
 * ## Why web verification cannot catch it
 *
 * It does not reproduce at five columns. The strip narrowed **because a desktop
 * capability added a column**, which makes this the case `surfaces.md`'s "desktop
 * capabilities count only when measured in the installed app" actually existed for.
 *
 * ## Why a class check and not a render test
 *
 * jsdom does not perform line breaking — real wrapping happens only in a browser, so
 * a unit test cannot measure it in principle. What can be measured is **whether the
 * spec is in place**, which is where this repository keeps repeating that a spec
 * with no rule is not upheld.
 */

const FILE = "src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx";

describe("노드 상세 액션 스트립 — CJK 라벨 줄바꿈", () => {
  const source = readFileSync(FILE, "utf8");

  it("probe: 액션 타일 클래스가 실재한다", () => {
    expect(source).toContain("const ACTION_TILE_INK");
  });

  it("액션 타일이 `keep-all` 을 싣는다", () => {
    /*
     * The selector went stale once: it used to look for the **hand-written shape
     * string** `flex flex-1 flex-col items-center justify-start`, and on 2026-08-03 the
     * tile moved up to `controlClass({ shape: "tile" })`, taking that string into the
     * value layer. It now matches **the ink constant's declaration** — whichever layer
     * the shape comes from, `keep-all` is off the ramp and therefore stays here.
     */
    const declaration = /const ACTION_TILE_INK =[\s\S]*?;\n/.exec(source)?.[0];
    expect(declaration, "액션 타일 잉크 선언을 못 찾았다 — 셀렉터가 낡았다").toBeDefined();
    expect(
      declaration!.includes("[word-break:keep-all]"),
      `여섯 칸으로 좁아지면 한국어 라벨이 음절에서 잘린다 —\n` +
        `「AI 요약 복 / 사」 처럼. 웹(다섯 칸)에서는 재현되지 않으므로\n` +
        `이 규격이 빠지면 설치 앱에서만 조용히 깨진다.`,
    ).toBe(true);
  });
});
