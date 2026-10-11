import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readGlobalCss } from "../../scripts/lib/global-css.mjs";

/**
 * The settings sheet has one type dialect: labels and pressable text use `text-body`, descriptions
 * and readouts use `text-label`, and `text-caption` (9.5px) is not used in the root sheet or
 * its drill-ins. The exemption is narrow, not the reach.
 */

const UI = "src/widgets/app-settings-menu/ui";

const ROOT_SHEET_FILES = [
  "AppSettingsMenu.tsx",
  "SettingsNav.tsx",
  "SettingsSearch.tsx",
  "settings-primitives.tsx",
  "AppearancePickers.tsx",
  "ExpandSettings.tsx",
  "FootprintSettings.tsx",
  "AgentActivitySettings.tsx",
  ...readdirSync(`${UI}/panes`)
    .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
    .map((name) => `panes/${name}`),
];

const DRILL_IN_FILES = [
  `${UI}/VaultAgentSetupPanel.tsx`,
  `${UI}/ModelConnectionsPanel.tsx`,
  "src/features/docs-vault-local/ui/AgentClientButtons.tsx",
  "src/features/docs-vault-local/ui/WebManualConnectPanel.tsx",
] as const;

/**
 * Source with comments removed. This file counts **classes that reach the
 * screen**, not sentences describing them — without stripping, a comment
 * documenting the spec is itself caught as a violation, creating the inverted
 * incentive that writing down the spec turns the gate red.
 */
function sourceWithoutComments(file: string): string {
  return sourceAtPath(`${UI}/${file}`);
}

function sourceAtPath(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Lines using 9.5px. There is no exemption: `uppercase` does nothing to Hangul, so an uppercase
 * micro label is just dim small text.
 */
function captionLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => line.includes("text-caption"))
    .map((line) => line.trim().slice(0, 100));
}

describe("설정 루트 시트 — 타입 방언은 하나다", () => {
  it("루트 시트 어디에도 `text-caption`(9.5px) 이 없다", () => {
    const offenders = ROOT_SHEET_FILES.flatMap((file) => {
      const source = sourceWithoutComments(file);
      return source.includes("text-caption") ? [file] : [];
    });
    expect(
      offenders,
      `9.5px is the step for micro labels, legends and timestamps. A settings row's label, description and ` +
        `button text are none of those: descriptions are text-label (11px) and pressable text is ` +
        `text-body (12.5px).`,
    ).toEqual([]);
  });

  /**
   * Idling guard — if the file list empties through a typo or a move, the test
   * above reports "0 violations" forever. This confirms something really was read
   * and that it is a file using the type ramp.
   */
  /** Drill-in destinations use **exactly** the root's dialect. No 9.5px exemption (see above). */
  it("드릴인 목적지에도 9.5px 이 없다", () => {
    const offenders = DRILL_IN_FILES.flatMap((path) =>
      captionLines(sourceAtPath(path)).map((line) => `${path.split("/").pop()}: ${line}`),
    );
    expect(
      offenders,
      "The drill-in pane became one step smaller than the root sheet. Names are text-body (12.5), " +
        "descriptions, values and paths are text-label (11). Section names use SETTINGS_SECTION_LABEL.",
    ).toEqual([]);
  });

  /**
   * There is **one** section-name spec — the root sheet's group header and the
   * drill-in's section header are the same thing. Once a copy exists, one of them
   * drops a step again (which is what happened this time).
   */
  it("절 이름 규격이 한 곳에 있고 소비처가 그것을 가리킨다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    expect(primitives, "SETTINGS_SECTION_LABEL 이 없다").toContain("SETTINGS_SECTION_LABEL");
    expect(primitives, "절 이름은 text-label(11) 이다").toMatch(
      /SETTINGS_SECTION_LABEL\s*=\s*\n?\s*'[^']*\btext-label\b/,
    );
    /*
     * Does the consumer point at the value rather than re-writing it?
     *
     * ⚠️ **`toContain(name)` cannot see this** — with the name still on the import
     * line, hand-writing the value in the body passes (it really did in a probe). So
     * what is checked is that it is used **in the `className` position**.
     */
    const setup = sourceWithoutComments("VaultAgentSetupPanel.tsx");
    expect(setup, "드릴인 절 이름이 규격을 className 으로 쓰지 않는다").toMatch(
      /className=\{[^}]*SETTINGS_SECTION_LABEL/,
    );
  });

  it("게이트가 빈 집합 위에서 돌지 않는다", () => {
    for (const path of DRILL_IN_FILES) {
      const source = sourceAtPath(path);
      expect(source.length, `${path} 을 못 읽었다`).toBeGreaterThan(200);
      expect(source, `${path} 이 타입 램프를 안 쓴다 — 목록이 낡았다`).toMatch(
        /text-(body|label|title|body-lg)/,
      );
    }
    // Is the chain alive — do these files really render inside the settings sheet.
    expect(sourceAtPath(`${UI}/VaultAgentSetupPanel.tsx`)).toContain("useAgentClientControls");
    expect(sourceAtPath("src/features/docs-vault-local/ui/AgentClientButtons.tsx")).toContain(
      "WebManualConnectPanel",
    );
    for (const file of ROOT_SHEET_FILES) {
      const source = sourceWithoutComments(file);
      expect(source.length, `${file} 을 못 읽었다`).toBeGreaterThan(200);
      // A pane built wholly from the shared primitives still sits on the ramp through them.
      expect(source, `${file} 이 타입 램프를 안 쓴다 — 목록이 낡았다`).toMatch(
        /text-(body|label|title|body-lg)|from '\.\.?\/settings-primitives'/,
      );
    }
  });
});

describe("한 시트 안에서 «값 하나 고르기» 는 한 규격이다", () => {
  /**
   * `Choice`'s radio chip and `SegmentSwitch`'s segment are both "pick one value".
   * There was no reason for them to differ, and they did — 24px/9.5px against
   * 32px/12.5px. The chip was smaller than its own label (11px), making **the thing
   * you press the smallest text on screen** (hierarchy inversion).
   *
   * `AgentActivitySettings`' notification chip was already 32px/12.5px — the newer
   * code in this sheet had already picked the right values, and only `Choice` still
   * carried its old dimensions.
   */
  /**
   * Do not pin the source class string: the check asserts the same height (`h-8`) and type step
   * (`text-body`), as a literal or through `controlClass({ className })`.
   */
  it("라디오 칩 · 세그먼트 · 알림 칩이 같은 높이·같은 단을 쓴다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const activity = sourceWithoutComments("AgentActivitySettings.tsx");

    /*
     * The 32px guarantee is measured where it is produced: both adapters delegate to the primitive
     * and its two shapes sit on the same height step.
     */
    expect(
      primitives.match(/<SegmentedControl\b/g)?.length ?? 0,
      "설정 시트의 «값 하나 고르기» 둘(Choice·SegmentSwitch)이 값 층 위임을 잃었다",
    ).toBeGreaterThanOrEqual(2);

    const valueLayer = sourceAtPath("src/shared/ui/control-class.ts");
    for (const shape of ["chip", "segment"]) {
      expect(
        valueLayer,
        `${shape} lg 가 32px 단(min-h-8)을 잃었다 — 두 그릇이 같은 높이라는 전제가 깨진다`,
      ).toMatch(new RegExp(`shape: '${shape}', size: 'lg', class: '[^']*min-h-8`));
    }

    expect(activity).toMatch(/\bh-8\b/);

    // Type step — the chip is `text-body` (12.5). The segment differs only in weight, same step.
    expect(primitives).toMatch(/\btext-body\b/);
    expect(activity).toMatch(/\btext-body\b/);

    /*
     * Check no off-ramp height slipped in. **`min-h-` is excluded** — the row
     * container's `min-h-11` (the 44px touch floor) is the value required by the "chip
     * rows are never pressed below 44px" test below, and without excluding it this
     * assertion fights that one (which actually happened).
     */
    expect(primitives, "시트에 램프 밖 컨트롤 높이가 생겼다").not.toMatch(/(?<!min-)\bh-(7|9|10|11)\b/);
  });

  /**
   * **WCAG 2.5.8 (AA, Target Size Minimum) headroom.** The old chip was exactly
   * 24px, sitting on the minimum with zero headroom, and the "ring" and "column"
   * options were 38.4px wide. `h-8` (32px) leaves 8px above it.
   * `--touch-target-min` (44px) is a `pointer: coarse`-only contract and does not
   * apply directly to this desktop sheet, but the vertical inset (`py-2` +
   * `min-h-11`) stands the whole row at 44px so the row satisfies the target on
   * touch as well.
   */
  it.each(["Choice", "Slider"])("%s rows retain their 44px minimum", (component) => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const body = primitives.split(`export function ${component}`)[1];
    expect(body, `${component} inventory must not be empty`).toBeDefined();
    const row = body?.match(/return\s*\(\s*<(?:label|div)\s+className="([^"]*)"/)?.[1];
    expect(row, `${component} must expose its row container`).toBeDefined();
    // Layout may reflow; the minimum hit-area height is the protected property.
    expect(row?.split(/\s+/), `${component} row must remain at least 44px tall`).toContain("min-h-11");
  });
});

describe("LNB 는 크롬 치수를 빌려오지 않는다", () => {
  /**
   * The LNB takes its dimensions from this sheet (the same padding as `SettingsRow`, `px-3 py-2`), not
   * from the nav-rail tile. No new token is created: a single consumer does not need one.
   */
  /**
   * Do not pin the class string as one block: the value layer splits it, so the inset and type step
   * are checked value by value.
   */
  it("LNB 항목이 오른쪽 칸 행과 같은 인셋을 쓰고 한 단 위 글자를 쓴다", () => {
    const nav = sourceWithoutComments("SettingsNav.tsx");
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    /*
     * ⚠️ **Do not search the whole file for the value** — written that way at first,
     * the probe caught nothing. `px-3 py-2` also appears **elsewhere** in this file, so
     * reverting the LNB to chrome dimensions still passed. **The scope is narrowed to
     * the LNB item's opening tag.**
     */
    const from = nav.indexOf('data-testid={`app-settings-nav-${item}`}');
    /*
     * Cutting the opening tag at `>` **breaks at a `=>` or a `>` inside a template** —
     * written that way at first, a correct state went red. Brace depth is counted and
     * only a **`>` at depth 0** ends the tag (the same method as this repository's
     * other scanners).
     */
    let depth = 0;
    let to = from;
    for (; to < nav.length; to += 1) {
      const ch = nav[to];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    const lnb = nav.slice(from, to);
    expect(lnb.length, "LNB 항목의 여는 태그를 못 찾았다 — 이 검사가 헛돈다").toBeGreaterThan(40);

    // Inset — must equal the `px-3 py-2` used by the right pane's row (`SettingsRow`).
    expect(lnb, "LNB 인셋이 크롬 치수(px-2.5 py-1.5)로 되돌아갔다").toMatch(/\bpx-3 py-2\b/);
    /* Type uses the row label step (`text-body`) so the nav stays a quiet index below each pane head. */
    expect(lnb, "LNB 글자가 행 제목 단(text-body)이 아니다").toMatch(/\btext-body\b(?!-)/);
    expect(lnb, "LNB 가 다시 칸 제목보다 커졌다").not.toMatch(/\btext-body-lg\b/);
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const head = primitives.slice(primitives.indexOf("export function SettingsPaneHead"));
    expect(head.length, "SettingsPaneHead 가 없다 — 칸마다 머리가 하나라는 규격이 사라졌다").toBeGreaterThan(40);
    expect(head.slice(0, 900), "칸 머리가 제목 단(text-title)을 잃었다").toMatch(/\btext-title\b/);
    expect(menu, "설정 시트가 칸 머리를 그리지 않는다").toMatch(/<SettingsPaneHead\b/);
    // Radius — the card family, not chrome's chip.
    expect(lnb, "LNB 반경이 칩으로 되돌아갔다").toMatch(/\brounded-(?:lg|card)\b/);
  });

  it("LNB 아이콘이 글자보다 크다 — 훑기 채널로 선다", () => {
    const nav = sourceWithoutComments("SettingsNav.tsx");
    // At the text's own size the icon matches it and the scanning channel disappears.
    expect(nav).toMatch(/<Icon size=\{16\}/);
  });

  /** `SettingsRow` is the single source for the inset — change it and the contract above loses its basis. */
  it("오른쪽 칸 행의 인셋이 LNB 가 맞춘 그 값이다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    /*
     * The horizontal inset lives unconditionally in the shared part; assert the inset and gap, not the
     * whole class string, since the row layout is not this gate subject.
     */
    expect(primitives).toMatch(/\bflex\b[^"']*\bpx-3\b/);
    expect(primitives).toMatch(/\bgap(?:-x)?-3\b/);
    // An ordinary row's vertical dimension is unchanged.
    expect(primitives).toMatch(/\bmin-h-12 py-2\b/);
  });

  /* There are two row heights: the taller one is decided by the presence of a mark, not a free axis. */
  it("키가 큰 행은 마크가 있는 행뿐이다 — 높이를 고르는 축이 아니다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    expect(primitives, "큰 치수가 사라졌다면 이 계약을 지울 때다").toMatch(
      /\bmin-h-16 py-2\.5\b/,
    );
    // The condition selecting the larger dimension must be **whether a mark slot exists**.
    expect(primitives).toMatch(/hasMarkSlot \? 'min-h-16 py-2\.5' : 'min-h-12 py-2'/);
  });
});

describe("패널은 최소 창 안에서 자기 거터를 먹지 않는다", () => {
  /**
   * The panel height is derived: the minimum window height 720 minus the overlay gutter `p-3`,
   * less one more gutter (696 - 24 = 672).
   */
  it("패널 높이가 최소 창 − 오버레이 거터 2벌 을 넘지 않는다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    const token = /h-\[var\((--[a-z0-9-]+)\)\] max-h-\[calc\(100dvh-1\.5rem\)\]/.exec(menu)?.[1];
    expect(token, "the panel's fixed height is not a token").toBeDefined();
    const height = Number(new RegExp(`${token}:\\s*(\\d+)px;`).exec(readGlobalCss())?.[1]);
    expect(Number.isFinite(height), `${token} has no px value in app/styles`).toBe(true);

    const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const minHeight: number = tauri.app.windows[0].minHeight;
    const OVERLAY_GUTTER = 12; // The overlay's `p-3`
    expect(minHeight, "최소 창 높이 계약이 사라졌다").toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(minHeight - OVERLAY_GUTTER * 4);
    // And it must exceed the previous value (640), or this change has been reverted.
    expect(height).toBeGreaterThan(640);
  });
});
