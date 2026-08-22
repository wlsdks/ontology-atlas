import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The settings sheet has **one** type dialect (2026-08-02, three owner reports).
 *
 * **What was there — a per-section font inventory** (measured, 1512×806, dark):
 *
 * | Section | 12.5px | 11px | **9.5px** |
 * |---|---|---|---|
 * | Appearance | 10 | 5 | 0 |
 * | Workspace | 5 | 1 | 0 |
 * | AI agents | 4 | 3 | 0 |
 * | **Expand** | **0** | 4 | **10** |
 * | Footprint | 0 | 4 | 1 |
 * | Map background | 3 | 2 | 4 |
 *
 * One sheet with the same kind of content (label + control + one-line
 * description), and yet **a whole ramp step was shifted** depending on the
 * section. That is what the owner saw: *"이는 버튼도 너무 작고? 뭔가 설정 자체가좀
 * 작아"* (this button is too small too — the settings themselves feel small),
 * pointing at the Expand section.
 *
 * The cause is inheritance, not taste. `Slider` and `Choice` were born inside
 * `FootprintSettings`' **collapsed details** and carried that place's small
 * dimensions; when they were promoted to shared primitives and became
 * `ExpandSettings`' **primary decision controls**, they brought those dimensions
 * along. Nobody decided "the Expand section is small".
 *
 * **The spec this file locks**:
 *
 * | What | Step |
 * |---|---|
 * | Row and control labels, pressable text | `text-body` (12.5px) |
 * | One-line descriptions, secondary captions, numeric readouts | `text-label` (11px) |
 * | `text-caption` (9.5px) | **not used in the root sheet** |
 *
 * The basis for excluding 9.5px is the ramp's own **definition** —
 * `--text-caption` is the step for "micro labels, legends, timestamps"
 * (`app/globals.css`). A radio button's name is none of those three.
 *
 * **Reach — it includes drill-ins** (widened 2026-08-09).
 *
 * ⚠️ **Drill-ins were excluded at first, and that judgement was wrong.**
 *
 * On 2026-08-02, `VaultAgentSetupPanel` and `AiConnectionPanel` were left outside
 * the reach, on the grounds that *"most `text-caption` in there fits the ramp
 * definition (eyebrows, path code, step badges), so including it becomes 82 items
 * of noise"*. **The noise concern was right and the premise "most are legitimate"
 * was wrong.**
 *
 * On 2026-08-09 the owner pointed at "connect my agent": *"왜이렇게 작아보이지?
 * 우리 디자인 시스템에서 이런거 통일 안되어있나? 다른거 보면 크잖아.. 다 너무
 * 작아서 잘 안보임"* (why does this look so small — isn't this unified in our
 * design system? Other places are bigger; it is all too small to read). Measured
 * (1512×900, vault connected, all eight panes):
 *
 * | Pane | 12.5 | 11 | **9.5** |
 * |---|---|---|---|
 * | Appearance · map background · expand · footprint · notifications · workspace | 2–9 | 1–14 | **0** (all six) |
 * | **Connect my agent** | 2 | 12 | **10 / 24 = 42%** |
 *
 * Six panes had no 9.5px at all, while in this one **42% of visible text** was
 * below the sheet's floor. And opening the supposedly legitimate uses one by one,
 * they were not:
 *
 * - A `dt` (name) at 9.5px whose `dd` (value) was 11px — **the name smaller than
 *   its own value**, the same hierarchy inversion 2026-08-02 named in the Expand
 *   section
 * - An `<input>` for typing API keys and URLs called `fieldClass` and then
 *   **overrode that ramp's default (`text-body-lg`, 14px) with `text-caption`** —
 *   4.5px below its own ramp
 * - A settings JSON `<pre>` the user must check character by character, at 9.5px
 *
 * So the reach widens to drill-ins and below. The chain is
 * `VaultAgentSetupPanel` → `AgentClientButtons` → `WebManualConnectPanel`.
 *
 * **Noise is prevented by narrowing the exemption, not the reach.** Measured when
 * widening: **41 violations → 0 after replacement**, with overflow still 0.
 */

const UI = "src/widgets/app-settings-menu/ui";

/** Files composing the root sheet — the LNB plus six panes. */
const ROOT_SHEET_FILES = [
  "AppSettingsMenu.tsx",
  "settings-primitives.tsx",
  "AppearancePickers.tsx",
  "ExpandSettings.tsx",
  "FootprintSettings.tsx",
  "AgentActivitySettings.tsx",
] as const;

/**
 * Drill-in destinations and their descendants, brought into reach on 2026-08-09
 * (see the preamble). These paths leave `UI`, so they are written from the
 * repository root.
 */
const DRILL_IN_FILES = [
  `${UI}/VaultAgentSetupPanel.tsx`,
  `${UI}/AiConnectionPanel.tsx`,
  `${UI}/AgentSetupStep.tsx`,
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
 * Lines using 9.5px. **There is no exemption.**
 *
 * ⚠️ At first, eyebrows carrying `uppercase` were exempt, and that is what drew
 * the owner's second report (2026-08-09). The grounds were the ramp definition
 * ("micro label") plus `uppercase` — but **`uppercase` does nothing to Hangul**,
 * so the typographic device of an uppercase micro label does not exist and what
 * remains is simply dim 9.5px text. Four section names really did stay at 9.5px
 * through that exemption.
 *
 * Decisive was the fact that **the root sheet already used 11px for the same
 * role** (`SETTINGS_SECTION_LABEL`). The exemption was open for a spec nobody
 * used, so deleting it makes the rule simpler.
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
      `9.5px 은 "마이크로 라벨·범례·타임스탬프" 의 단이다. 설정 행의 라벨·설명·` +
        `버튼 글자는 그 셋이 아니다 — 설명은 text-label(11px), 누르는 글자는 ` +
        `text-body(12.5px).`,
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
      "드릴인 칸이 루트 시트보다 한 단 작아졌다. 이름은 text-body(12.5), " +
        "설명·값·경로는 text-label(11). 절 이름은 SETTINGS_SECTION_LABEL 을 쓴다.",
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
    expect(sourceAtPath(`${UI}/VaultAgentSetupPanel.tsx`)).toContain("AgentClientButtons");
    expect(sourceAtPath("src/features/docs-vault-local/ui/AgentClientButtons.tsx")).toContain(
      "WebManualConnectPanel",
    );
    for (const file of ROOT_SHEET_FILES) {
      const source = sourceWithoutComments(file);
      expect(source.length, `${file} 을 못 읽었다`).toBeGreaterThan(200);
      expect(source, `${file} 이 타입 램프를 안 쓴다 — 목록이 낡았다`).toMatch(
        /text-(body|label|title|body-lg)/,
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
   * ⚠️ **Do not pin the source's class string** (that broke this on 2026-08-06).
   *
   * This assertion used to search for `flex h-8 items-center rounded-chip border
   * px-3 text-body` verbatim by regex. **Moving that place into the value layer
   * (`controlClass`)** made the string disappear and the test go red — the check
   * breaking in the direction of a better spec, which makes the next person revert
   * **the spec** rather than the check (`documentation.md`).
   *
   * The substance of the spec is not "how it was written" but **"does it use the
   * same height and the same step"**. So the source is checked without regard to
   * syntax, for whether the height (`h-8`) and the type step (`text-body`) are
   * really standing — as a literal or through `controlClass({ className })`.
   */
  it("라디오 칩 · 세그먼트 · 알림 칩이 같은 높이·같은 단을 쓴다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const activity = sourceWithoutComments("AgentActivitySettings.tsx");

    /*
     * Height — all three on the one 32px step.
     *
     * ⚠️ **This assertion moved in the second round of 2026-08-15.** It used to check
     * whether an `h-8` literal existed inside `settings-primitives.tsx`. That day
     * `Choice` also became a `SegmentedControl` adapter like `SegmentSwitch`, the
     * literal disappeared, and the assertion **went red while the spec improved** —
     * the shape `design-gates.md` calls "a gate holding on to letterforms rather than
     * the spec" (such a gate makes the next person revert the spec instead of the
     * gate).
     *
     * So the 32px guarantee is measured **where it is actually produced**: do the two
     * adapters delegate to the primitive, and do the primitive's two shapes sit on the
     * same height step.
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
  it("칩 행이 44px 미만으로 눌리지 않는다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    // Row containers for Choice and Slider
    const rows = primitives.match(/flex min-h-11 items-center gap-3 px-1 py-2/g) ?? [];
    expect(rows.length, "Choice·Slider 두 행 문법이 같은 최소 높이를 안 쓴다").toBe(2);
  });
});

describe("LNB 는 크롬 치수를 빌려오지 않는다", () => {
  /**
   * The old LNB item was `px-2.5 py-1.5` → 32px with a 14px icon. 32px is the value
   * of the **nav-rail utility tile** (`--app-nav-rail-tile-height`) — a destination
   * people deliberately enter to read and choose in was borrowing the dimensions of
   * a toolbar that floats over the map and yields screen space.
   *
   * The locked-scale contract limits its own reach to **workbench chrome**
   * (`design.md`) — the same logic that excluded the gateway chrome (`GatewayNav`)
   * applies here. So the value is drawn from inside this sheet: **the same padding**
   * as the right pane's `SettingsRow` (`px-3 py-2`), one step above the right-hand
   * row label (`text-body-lg`). No new token is created — with a single consumer, a
   * variable adds a second thing to reference and blurs where the spec lives (the
   * discipline left by that same passage).
   */
  /**
   * ⚠️ **Do not pin the source's class string as one block** (this broke a second
   * time on 2026-08-06).
   *
   * This assertion used to find `flex w-full items-center gap-2.5 rounded-card px-3
   * py-2 text-left text-body-lg` as **one regex block**. Moving that place into the
   * value layer (`controlClass({ shape: 'row' })`) split the string — the shape emits
   * `flex w-full items-center text-left` and only the rest stays in `className` — and
   * it went red.
   *
   * The substance of the spec is not "was it written as one block" but **"does it use
   * the same inset as the right pane's row and text one step above"**. So it is
   * checked **value by value**.
   */
  it("LNB 항목이 오른쪽 칸 행과 같은 인셋을 쓰고 한 단 위 글자를 쓴다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    /*
     * ⚠️ **Do not search the whole file for the value** — written that way at first,
     * the probe caught nothing. `px-3 py-2` also appears **elsewhere** in this file, so
     * reverting the LNB to chrome dimensions still passed. **The scope is narrowed to
     * the LNB item's opening tag.**
     */
    const from = menu.indexOf('data-testid={`app-settings-nav-${item}`}');
    /*
     * Cutting the opening tag at `>` **breaks at a `=>` or a `>` inside a template** —
     * written that way at first, a correct state went red. Brace depth is counted and
     * only a **`>` at depth 0** ends the tag (the same method as this repository's
     * other scanners).
     */
    let depth = 0;
    let to = from;
    for (; to < menu.length; to += 1) {
      const ch = menu[to];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    const lnb = menu.slice(from, to);
    expect(lnb.length, "LNB 항목의 여는 태그를 못 찾았다 — 이 검사가 헛돈다").toBeGreaterThan(40);

    // Inset — must equal the `px-3 py-2` used by the right pane's row (`SettingsRow`).
    expect(lnb, "LNB 인셋이 크롬 치수(px-2.5 py-1.5)로 되돌아갔다").toMatch(/\bpx-3 py-2\b/);
    // Type — one step above the right pane's `text-body`.
    expect(lnb, "LNB 글자가 한 단 내려갔다").toMatch(/\btext-body-lg\b/);
    // Radius — the card family, not chrome's chip.
    expect(lnb, "LNB 반경이 칩으로 되돌아갔다").toMatch(/\brounded-(?:lg|card)\b/);
  });

  it("LNB 아이콘이 글자보다 크다 — 훑기 채널로 선다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    // At 14px it equals the text (text-body-lg = 14px) and the scanning channel disappears.
    expect(menu).toMatch(/<Icon size=\{16\}/);
  });

  /** `SettingsRow` is the single source for the inset — change it and the contract above loses its basis. */
  it("오른쪽 칸 행의 인셋이 LNB 가 맞춘 그 값이다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    // The horizontal inset lives **unconditionally** in the shared part — that is the value the LNB matched.
    expect(primitives).toMatch(/flex items-center justify-between gap-3 px-3/);
    // An ordinary row's vertical dimension is unchanged.
    expect(primitives).toMatch(/\bmin-h-12 py-2\b/);
  });

  /*
   * 2026-08-16 — there are now two row heights. **No height-choosing axis was
   * created**; rows carrying another product's mark simply hold different content: a
   * 32px mark in a 48px row is boxed in top and bottom, and squeezing it to 12px
   * makes it unrecognisable so it stops working as a scanning channel.
   *
   * So the second height is **decided by the presence of a mark.** This test keeps
   * that binding — using it to enlarge arbitrary rows unrelated to a mark is caught
   * here.
   */
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
   * The fixed-size contract (owner, 2026-07-29) stands. Only the height changed,
   * and that value is **derived**, not chosen: within 696 (Tauri's minimum window
   * height of 720 minus the overlay gutter `p-3`, 12px top and bottom), the largest
   * height that still leaves one more gutter (696 − 24 = 672).
   *
   * While it was 640, the busiest section (Appearance) was clipped by 41px while
   * 118px sat empty outside the panel at a 14-inch viewport (1512×806) — a clipped
   * box and spare space on the same screen is the mechanical form of the owner's
   * *"답답해"* (it feels cramped).
   */
  it("패널 높이가 최소 창 − 오버레이 거터 2벌 을 넘지 않는다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    const height = Number(/h-\[(\d+)px\] max-h-\[calc\(100dvh-1\.5rem\)\]/.exec(menu)?.[1]);
    expect(Number.isFinite(height), "패널 고정 높이를 못 찾았다").toBe(true);

    const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const minHeight: number = tauri.app.windows[0].minHeight;
    const OVERLAY_GUTTER = 12; // The overlay's `p-3`
    expect(minHeight, "최소 창 높이 계약이 사라졌다").toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(minHeight - OVERLAY_GUTTER * 4);
    // And it must exceed the previous value (640), or this change has been reverted.
    expect(height).toBeGreaterThan(640);
  });
});
