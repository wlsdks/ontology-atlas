import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readGlobalCss } from "../../../scripts/lib/design/global-css.mjs";

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

describe("settings root sheet: there is one type dialect", () => {
  it("there is no `text-caption` (9.5px) anywhere in the root sheet", () => {
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
  it("there is no 9.5px in the drill-in destinations either", () => {
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
  it("the section name spec lives in one place and consumers point at it", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    expect(primitives, "SETTINGS_SECTION_LABEL is missing").toContain("SETTINGS_SECTION_LABEL");
    expect(primitives, "a section name is text-label (11)").toMatch(
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
    expect(setup, "the drill-in section name does not use the spec as a className").toMatch(
      /className=\{[^}]*SETTINGS_SECTION_LABEL/,
    );
  });

  it("the gate does not run on an empty set", () => {
    for (const path of DRILL_IN_FILES) {
      const source = sourceAtPath(path);
      expect(source.length, `could not read ${path}`).toBeGreaterThan(200);
      expect(source, `${path} does not use the type ramp, so the list is stale`).toMatch(
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
      expect(source.length, `could not read ${file}`).toBeGreaterThan(200);
      // A pane built wholly from the shared primitives still sits on the ramp through them.
      expect(source, `${file} does not use the type ramp, so the list is stale`).toMatch(
        /text-(body|label|title|body-lg)|from '\.\.?\/settings-primitives'/,
      );
    }
  });
});

describe("\"pick one value\" inside one sheet has one spec", () => {
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
  it("radio chip, segment and notification chip use the same height and the same step", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const activity = sourceWithoutComments("AgentActivitySettings.tsx");

    /*
     * The 32px guarantee is measured where it is produced: both adapters delegate to the primitive
     * and its two shapes sit on the same height step.
     */
    expect(
      primitives.match(/<SegmentedControl\b/g)?.length ?? 0,
      "the two \"pick one value\" controls of the settings sheet (Choice and SegmentSwitch) lost the value layer delegation",
    ).toBeGreaterThanOrEqual(2);

    const valueLayer = sourceAtPath("src/shared/ui/control-class.ts");
    for (const shape of ["chip", "segment"]) {
      expect(
        valueLayer,
        `${shape} lg lost the 32px step (min-h-8), which breaks the premise that both containers have the same height`,
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
    expect(primitives, "a control height outside the ramp appeared in the sheet").not.toMatch(/(?<!min-)\bh-(7|9|10|11)\b/);
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

describe("the LNB does not borrow chrome dimensions", () => {
  /**
   * The LNB takes its dimensions from this sheet (the same padding as `SettingsRow`, `px-3 py-2`), not
   * from the nav-rail tile. No new token is created: a single consumer does not need one.
   */
  /**
   * Do not pin the class string as one block: the value layer splits it, so the inset and type step
   * are checked value by value.
   */
  it("LNB items use the same inset as the rows of the right-hand section and one step larger text", () => {
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
    expect(lnb.length, "could not find the opening tag of an LNB item, so this check spins idle").toBeGreaterThan(40);

    // Inset — must equal the `px-3 py-2` used by the right pane's row (`SettingsRow`).
    expect(lnb, "the LNB inset went back to the chrome dimensions (px-2.5 py-1.5)").toMatch(/\bpx-3 py-2\b/);
    /* Type uses the row label step (`text-body`) so the nav stays a quiet index below each pane head. */
    expect(lnb, "LNB text is not at the row title step (text-body)").toMatch(/\btext-body\b(?!-)/);
    expect(lnb, "the LNB got bigger than the section title again").not.toMatch(/\btext-body-lg\b/);
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const head = primitives.slice(primitives.indexOf("export function SettingsPaneHead"));
    expect(head.length, "SettingsPaneHead is missing, so the spec of one head per section is gone").toBeGreaterThan(40);
    expect(head.slice(0, 900), "the section head lost the title step (text-title)").toMatch(/\btext-title\b/);
    expect(menu, "the settings sheet does not draw the section head").toMatch(/<SettingsPaneHead\b/);
    // Radius — the card family, not chrome's chip.
    expect(lnb, "the LNB radius went back to the chip").toMatch(/\brounded-(?:lg|card)\b/);
  });

  it("LNB icons are bigger than the text, standing as the scanning channel", () => {
    const nav = sourceWithoutComments("SettingsNav.tsx");
    // At the text's own size the icon matches it and the scanning channel disappears.
    expect(nav).toMatch(/<Icon size=\{16\}/);
  });

  /** `SettingsRow` is the single source for the inset — change it and the contract above loses its basis. */
  it("the inset of the right-hand section rows is the value the LNB aligned to", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    /*
     * The horizontal inset lives unconditionally in the shared part; assert the inset and gap, not the
     * whole class string, since the row layout is not this gate subject.
     */
    expect(primitives).toMatch(/\bflex\b[^"']*\bpx-4\b/);
    expect(primitives).toMatch(/\bgap(?:-x)?-3\b/);
    // An ordinary row's vertical dimension is unchanged.
    expect(primitives).toMatch(/\bmin-h-14 py-3\b/);
  });

  /* There are two row heights: the taller one is decided by the presence of a mark, not a free axis. */
  it("the only tall rows are rows with a mark, and height is not an axis to choose", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    expect(primitives, "if the large dimension is gone, it is time to delete this contract").toMatch(
      /\bmin-h-16 py-3\b/,
    );
    // The condition selecting the larger dimension must be **whether a mark slot exists**.
    expect(primitives).toMatch(/hasMarkSlot \? 'min-h-16 py-3' : 'min-h-14 py-3'/);
  });
});

describe("the panel does not eat its own gutter inside the minimum window", () => {
  /**
   * The panel is at most the minimum window height, and at `sm` its clamp keeps the overlay's `sm:p-6` on both sides.
   */
  it("the panel height does not exceed the minimum window minus two overlay gutters", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    const token = /h-\[var\((--[a-z0-9-]+)\)\] max-h-\[calc\(100dvh-1\.5rem\)\]/.exec(menu)?.[1];
    expect(token, "the panel's fixed height is not a token").toBeDefined();
    const height = Number(new RegExp(`${token}:\\s*(\\d+)px;`).exec(readGlobalCss())?.[1]);
    expect(Number.isFinite(height), `${token} has no px value in app/styles`).toBe(true);

    const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const minHeight: number = tauri.app.windows[0].minHeight;
    expect(minHeight, "the minimum window height contract is gone").toBeGreaterThan(0);
    expect(menu, "the panel can outgrow the window: its max-height clamp is gone").toMatch(/max-h-\[calc\(100dvh-1\.5rem\)\] sm:max-h-\[calc\(100dvh-3rem\)\]/);
    expect(menu, "the overlay gutter the clamp assumes is gone").toMatch(/p-3 sm:p-6/);
    expect(height).toBeLessThanOrEqual(minHeight);
    // And it must exceed the previous value (640), or this change has been reverted.
    expect(height).toBeGreaterThan(640);
  });
});
