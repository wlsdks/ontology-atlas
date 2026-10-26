import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DESTINATION_BY_KEY,
  DESTINATION_HREF,
  DESTINATION_IDS,
  DESTINATION_KEY,
  NAV_LEADER_KEY,
  NAV_LEADER_WINDOW_MS,
} from "@/shared/config/destinations";

/**
 * Destination navigation shortcuts — **the list, the screen, and the help all come
 * from one table.**
 *
 * **What this gate blocks.** Shortcut help in this repository has already lied once.
 * The comment still in `ShortcutSheet`'s map section records it — *"the previous
 * rows described interactions
 * the v2 canvas never implemented — stale carryover from an earlier design that
 * never shipped"*. The sheet was documenting **features that did not exist** (Tab
 * to a neighbour, Shift+click for a path, …), and no check caught it.
 *
 * The cause was that the sheet was a **hand-written list**. So navigation shortcuts
 * now treat the table (`shared/config/destinations.ts`) as the source of truth and
 * the sheet builds its rows from it. This file measures that the wiring is alive.
 *
 * **Why "can it actually be pressed" is not measured here.** Whether pressing the
 * key really changes the screen needs a browser —
 * `tests/e2e/destination-shortcuts.spec.ee.ts` owns that. This contract watches the
 * **table and the wiring**. They are split because e2e is too slow to be worth
 * spending on table mistakes, and a contract alone cannot prove navigation
 * happens.
 */

const REPO = process.cwd();
const read = (path: string) => readFileSync(`${REPO}/${path}`, "utf8");

/**
 * Source with comments stripped. **Without stripping, a sentence explaining the
 * spec is itself caught as a violation** — which happened in this file: the hook's
 * comment said *"a single `querySelector(...)` is wrong"* and was judged as "that
 * code is still there". That creates the inverted incentive where writing the spec
 * down turns the gate red (the same lesson the settings-dialect gate left).
 */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("destination shortcuts: the table is canonical", () => {
  it("each destination has one letter and no two collide", () => {
    const keys = DESTINATION_IDS.map((id) => DESTINATION_KEY[id]);
    expect(keys.length, "there are no destinations; if the table is gone this whole test spins idle").toBeGreaterThan(
      3,
    );
    expect(new Set(keys).size, `letters collide: ${keys.join(" ")}`).toBe(keys.length);
    for (const key of keys) {
      expect(key, `${key} must be a single letter`).toMatch(/^[a-z]$/);
    }
    // The reverse table matches the forward one plus two compatibility aliases: `d` (Docs has no tile;
    // its published shortcut opens Library's Ontology tab) and `c` (MCP; its published `g c` still
    // lands on the Agents tab).
    expect(Object.keys(DESTINATION_BY_KEY).sort()).toEqual([...keys, 'd', DESTINATION_KEY.mcp].sort());
    for (const id of DESTINATION_IDS) {
      expect(DESTINATION_BY_KEY[DESTINATION_KEY[id]]).toBe(id);
    }
    expect(keys, 'the Docs compatibility alias must not replace a live destination key').not.toContain('d');
    expect(DESTINATION_BY_KEY.d).toBe('docs');
    expect(DESTINATION_HREF.docs).toBe('/docs/');
  });

  it("each destination has an address that has the shape of a route", () => {
    for (const id of DESTINATION_IDS) {
      const href = DESTINATION_HREF[id];
      expect(href, `${id} has no address`).toBeTruthy();
      // `@/i18n/navigation` adds the locale prefix — baking it into the table doubles it.
      expect(href, `${id}: do not hard-code the locale in the table`).not.toMatch(/^\/(en|ko)\//);
      expect(href, `${id}: must start and end with a slash (static export convention)`).toMatch(/^\/.*\/$/);
    }
  });

  /**
   * Is the decision not to use ⌘1–⌘9 still present in the code? The leader is a
   * letter pressed with no modifier, and the hook must filter modifier presses
   * **first**.
   */
  it("input with a modifier key held is not ours", () => {
    const hook = read("src/shared/lib/keyboard/use-destination-shortcuts.ts");
    expect(hook, "events with meta/control/alt held are not filtered out").toMatch(
      /if\s*\(event\.metaKey\s*\|\|\s*event\.ctrlKey\s*\|\|\s*event\.altKey\)\s*return/,
    );
  });

  it("does not navigate while typing", () => {
    const hook = read("src/shared/lib/keyboard/use-destination-shortcuts.ts");
    expect(hook).toContain("INPUT");
    expect(hook).toContain("TEXTAREA");
    expect(hook).toContain("isContentEditable");
  });

  /**
   * No navigation while a blocking surface is open. Deciding **by `aria-modal`** is
   * the contract — making each caller remember `disabled` means a new modal forgets it
   * (the same family as #65, where per-page registration of the rail utility slot was
   * missed by one surface).
   */
  it("does not navigate while a blocking surface is open", () => {
    const hook = read("src/shared/lib/keyboard/use-destination-shortcuts.ts");
    expect(hook, "does not judge blocking surfaces by aria-modal").toContain('[aria-modal="true"]');
  });

  /**
   * Count only rendered modals: a single `querySelector` returns the first match, and a surface still
   * in the DOM during its exit animation would stop every shortcut. Scan all and count rendered ones.
   */
  it("a hidden modal does not count as a blocking surface", () => {
    const hook = read("src/shared/lib/keyboard/use-destination-shortcuts.ts");
    expect(hook, "looking only at the first match gets caught on a hidden modal").toContain("querySelectorAll");
    expect(hook, "does not measure whether it was drawn on screen").toContain("getClientRects");
    expect(hook, "does not skip aria-hidden ancestors").toContain('aria-hidden="true"');
    expect(readCode("src/shared/lib/keyboard/use-destination-shortcuts.ts"), "code that decides with a single querySelector is left").not.toMatch(
      /querySelector\(\s*'\[aria-modal/,
    );
  });

  it("there is a wait time after the leader key is pressed", () => {
    expect(NAV_LEADER_WINDOW_MS).toBeGreaterThan(300);
    expect(NAV_LEADER_WINDOW_MS).toBeLessThanOrEqual(3000);
    expect(read("src/shared/lib/keyboard/use-destination-shortcuts.ts")).toContain("NAV_LEADER_WINDOW_MS");
  });
});

describe("the rail, the sheet and the shell read the same table", () => {
  it("MCP is the second tab of Agents and is deliberately absent from the rail", () => {
    expect(DESTINATION_IDS).not.toContain("mcp");
    expect(DESTINATION_HREF.mcp).toBe("/agents/?tab=mcp");
  });

  it("the library inherits the docs drawer and leaves no stale door", () => {
    expect(DESTINATION_IDS).toContain("library");
    const sidebar = read("src/views/docs-vault/ui/parts/DocsSidebarBody.tsx");
    expect(sidebar, "the old library navigation row is left inside the merged screen").not.toContain(
      'data-testid="docs-sidebar-library-link"',
    );
  });

  it("the rail does not retype addresses by hand", () => {
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    expect(rail, "the rail does not import the table").toContain("DESTINATION_HREF");
    /*
     * A literal address left inside the rail's destination array means two copies. Only
     * the array block is sliced — banning addresses elsewhere in the file (gateway links
     * and so on) would catch the wrong things.
     */
    const block = rail.slice(
      rail.indexOf("const destinations"),
      rail.indexOf("];", rail.indexOf("const destinations")),
    );
    expect(block.length, "could not find the destination array, so this assertion spins idle").toBeGreaterThan(120);
    const literals = block.match(/href:\s*["'][^"']+["']/g) ?? [];
    expect(literals, `literal addresses are left in the rail: ${literals.join(", ")}`).toEqual([]);
  });

  it("the shell wires the hook", () => {
    const shell = read("src/app/providers/AppShell.tsx");
    expect(shell, "the shell does not mount the navigation shortcuts").toContain("useDestinationShortcuts");
  });

  it("the sheet builds its rows from the table, not by hand", () => {
    const sheet = read("src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx");
    expect(sheet, "the sheet does not import the table").toContain("DESTINATION_IDS");
    expect(sheet, "the sheet does not derive its rows from the table").toMatch(
      /DESTINATION_IDS\.map\(/,
    );
    // Are the derived rows actually plugged into the navigation section?
    expect(sheet).toMatch(/rows:\s*\[\s*\.\.\.DESTINATION_ROWS/);
  });

  it("both locales have wording for every destination", () => {
    for (const locale of ["ko", "en"] as const) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const rows = messages.searchWidgets?.shortcuts?.rows ?? {};
      for (const id of DESTINATION_IDS) {
        const key = `goTo_${id}`;
        expect(rows[key], `${locale}: wording for ${key} is missing`).toBeTruthy();
      }
    }
  });

  /**
   * Does it collide with a bare letter already in use? The leader grammar makes
   * collisions impossible in principle (`G` then `D` ≠ `D`), but if **the leader
   * itself** is bound as a bare letter, that feature cannot fire.
   */
  it("the leader letter does not collide with any other solo shortcut", () => {
    const SINGLE_KEY_SHORTCUTS = ["d", "f", "?", "/"];
    expect(
      SINGLE_KEY_SHORTCUTS,
      `the leader (${NAV_LEADER_KEY}) is already a letter used on its own`,
    ).not.toContain(NAV_LEADER_KEY);
  });

  /**
   * Nine is the ceiling the rail height supports at the app's minimum window (`minWidth: 1040`,
   * `minHeight: 720`, 616px pane) with nothing scrolling. A tenth needs its own decision; the pane
   * still scrolls for zoom and longer translations.
   */
  it("destinations do not exceed nine, and a tenth requires a separate decision", () => {
    expect(
      DESTINATION_IDS.length,
      `The rail has ${DESTINATION_IDS.length} destinations. ` +
        `Adding a tenth needs its own decision record and an update to this cap`,
    ).toBeLessThanOrEqual(9);
  });

  it("the current list has nine: source changes have a separate entry and the existing merges stay", () => {
    /*
     * A ceiling far above the current count turns slack into a free pass, so the exact inventory is
     * pinned: a change to the list needs a decision.
     */
    expect(
      DESTINATION_IDS.length,
      "the destination list changed; review the source-change briefing destination decision",
    ).toBe(9);
  });

  /**
   * **The compact pitch remains part of the measured rail, so it is asserted with it.**
   *
   * It was introduced when nine tiles had to fit. Merging two destinations does not
   * silently restyle every remaining tile; that would be a separate visual change.
   */
  it("the measured tile padding is unchanged", () => {
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    const block = rail.slice(rail.indexOf('shape: "card", className: "group relative w-full'));
    expect(block.slice(0, 200), "the vertical padding of the destination tile button is not py-1").toContain(
      "px-0 py-1 ",
    );
  });

  it("the rail can scroll when it overflows, since a cap alone cannot stop scaling", () => {
    /*
     * The ceiling of seven only protects the nominal height of the default minimum
     * window; it guarantees nothing under zoom, longer translations, or a smaller
     * effective viewport. Without `overflow` handling there, the lower destinations and
     * the utility layer are **clipped and unreachable** — the same defect the responsive
     * seat measured as "the gear is lost at 200% zoom".
     */
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    expect(rail, "the destination nav does not own scrolling").toMatch(
      /<nav[\s\S]*?className="[^"]*min-h-0[^"]*overflow-y-auto[^"]*overscroll-contain[^"]*"/,
    );
    expect(rail, "the utility layer may shrink, so it needs shrink-0 on its own className").toMatch(
      /data-testid="app-nav-rail-utility-tier"[\s\S]{0,240}className="[^"]*shrink-0[^"]*"/,
    );
  });
});
