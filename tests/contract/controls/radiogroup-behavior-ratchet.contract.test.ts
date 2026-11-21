import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../../scripts/lib/design/static-surface-census.mjs";

/**
 * Radiogroup behaviour ratchet: a hand-wired `role="radiogroup"` passes only if the same file calls
 * `useRovingRadioGroup`, the single implementation of arrow-key behaviour. Lint cannot find a missing
 * class and axe runs static DOM rules only. Registering a file without wiring the hook fails.
 */

const ROOT = process.cwd();

/** The single implementation of the behaviour. This file and the primitive are not counted. */
const HOOK = "useRovingRadioGroup";
const EXEMPT_FILES = new Set([
  "src/shared/lib/keyboard/use-roving-radio-group.ts",
  "src/shared/ui/fields/segmented-control.tsx",
]);

/**
 * **Registered** — places that wear the hook directly because their container does
 * not converge onto either of the primitive's two canonical forms. Not an exemption
 * but **a record that "this container cannot be made from a variant"**.
 *
 * ⚠️ **Wearing the hook removes a place from this scanner's view** — the role comes
 * from the hook's `groupProps`, so no `role="radiogroup"` literal remains in the
 * file. That is correct by design (there is no hand-written role left to polish).
 * So this list is **a record, not enforcement**, and `HOOK_ADOPTION_FLOOR` below is
 * what stops adoption being quietly rolled back.
 */
const REGISTERED: ReadonlyArray<readonly [file: string, why: string]> = [
  ["src/widgets/app-settings-menu/ui/pane-settings/AppearancePickers.tsx", "grid preview tile — shape:'tile' + active ink split by parent/child"],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", "panel-scoped ink + chrome radius + a 48px uniform width the owner fixed after two corrections"],
  ["src/widgets/project-drawer/ui/more-info/ProjectBasicInfo.tsx", "shape:'pill' + upper-case mono caption — not a combination of the value-layer chip ramp"],
  ["src/widgets/atlas-git-panel/ui/commit-detail/ConceptChips.tsx", "tone:'secondary' + a conditional border that must not cover the pressed chip's indigo"],
  ["src/views/docs-vault/ui/parts/sidebar/DocsSidebarBody.tsx", "bg-canvas well · Chip items · Tooltip wrapper · label only on the lit chip"],
  /*
   * Hover ink is hand-written per place, not an axis in the value layer, so migrating these would
   * remove hover feedback on inactive items.
   */
  ["src/features/ontology-blocks/ui/BlockImportModule.tsx", "p-1/gap-1 inset + hover on the inactive segment"],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", "panel-scoped hover ink"],
];

/**
 * **The floor on the number of hook call *sites*.** Since the registration above
 * is not enforcement, this number locks the direction instead — a drop means
 * somebody removed the behaviour layer (raising it is free).
 *
 * ⚠️ **Sites are counted, not files.** Counting files first left a hole a probe
 * caught: `AppearancePickers` has two groups, so **removing the wiring from one
 * still leaves the file calling the hook** and it stayed green. Wherever the
 * ratchet's unit is coarser than the defect's unit, that much goes unseen.
 *
 * Today it is **10 sites across 9 registered files** (only `AppearancePickers` has
 * two groups). The primitive's own file is on the exemption list and does not count
 * here; whether the primitive uses the hook is asserted separately by the idling
 * guard — locked in two places.
 */
const HOOK_ADOPTION_FLOOR = 10;

/**
 * Debt ledger: hand-written radiogroups with neither migration nor the hook. It cannot grow; repaying
 * one deletes its row.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  /*
   * Empty: no hand-wired radiogroups remain outside the primitive. What remains is container
   * convergence, a design task rather than a defect.
   */
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/**
 * Counts `role="radiogroup"` per file, matching both quote variants so a single-quote-only match
 * cannot hide most of the repository.
 */
const ROLE_RE = /role=\{?["']radiogroup["']\}?/g;

const HOOK_CALL_RE = new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`);
/** The global version of the same pattern — counts **sites** within a file. */
const HOOK_CALL_RE_G = new RegExp(`${HOOK}\\s*(?:<[^>]*>)?\\s*\\(`, "g");

function scan() {
  const found = new Map<string, number>();
  /** **Every** file that calls the hook — counted regardless of any role literal. */
  const hookFiles = new Set<string>();
  let hookCallSites = 0;
  let scanned = 0;
  let doubleQuoted = 0;
  let singleQuoted = 0;

  for (const dir of ["src", "app"]) {
    const base = path.join(ROOT, dir);
    for (const file of walk(base)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      scanned += 1;
      if (EXEMPT_FILES.has(rel)) continue;
      /*
       * Comments are stripped first, using the same helper as the static surface inventory, so a quotation
       * in a comment is not a violation and the two scanners cannot drift.
       */
      const src = stripComments(readFileSync(file, "utf8"));
      // Skip generic arguments (`useRovingRadioGroup<T>({…})`) — literal matching dies
      // silently on a single type argument.
      const hookCalls = [...src.matchAll(HOOK_CALL_RE_G)].length;
      if (hookCalls > 0) {
        hookFiles.add(rel);
        hookCallSites += hookCalls;
      }
      const hits = [...src.matchAll(ROLE_RE)];
      if (!hits.length) continue;
      found.set(rel, hits.length);
      for (const h of hits) {
        if (h[0].includes('"')) doubleQuoted += 1;
        else singleQuoted += 1;
      }
    }
  }
  return { found, hookFiles, hookCallSites, scanned, doubleQuoted, singleQuoted };
}

describe("radiogroup behaviour ratchet — does the keyboard that the role promises exist", () => {
  const census = scan();
  const debt = new Map(DEBT);
  const registered = new Map(REGISTERED);

  it("the detector does not idle — enough files scanned and the ledger exists", () => {
    expect(census.scanned, "too few files scanned — the worker died").toBeGreaterThan(300);
    for (const [file] of [...DEBT, ...REGISTERED]) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} does not exist`).toBe(true);
    }
    /*
     * Checks that **the premise of the two exemptions is still true**. The exemption
     * says "this file is not counted", and its evidence is "the hook owns the role and
     * the primitive wears it". If that structure breaks, the exemption becomes a hole.
     *
     * ⚠️ The primitive's body contains **no** `radiogroup` string — if it did, that
     * would signal the behaviour had grown a second implementation. The role is emitted
     * by the hook's `groupProps`.
     */
    const hook = stripComments(
      readFileSync(path.join(ROOT, "src/shared/lib/keyboard/use-roving-radio-group.ts"), "utf8"),
    );
    expect(hook, "the hook lost the radiogroup role — the premise of the exemption is gone").toContain("radiogroup");
    expect(hook, "the hook lost roving tabindex").toContain("tabIndex");
    expect(hook, "the hook lost arrow-key movement").toContain("ArrowRight");

    const primitive = stripComments(
      readFileSync(path.join(ROOT, "src/shared/ui/fields/segmented-control.tsx"), "utf8"),
    );
    expect(
      HOOK_CALL_RE.test(primitive),
      "the primitive does not use the hook — the behaviour became two implementations",
    ).toBe(true);
    expect(primitive, "the primitive does not spread the hook's groupProps — the role is not carried").toContain(
      "groupProps",
    );
  });

  it("hand-attached radiogroups do not grow — a new file starts at 0 on day one", () => {
    const over: string[] = [];
    for (const [file, count] of census.found) {
      const allowed = registered.has(file) ? count : (debt.get(file) ?? 0);
      if (count > allowed) over.push(`${file}: ${count} > allowed ${allowed}`);
    }
    expect(
      over,
      "Do not set `role=\"radiogroup\"` by hand: `SegmentedControl` (variant well|chips) " +
        "supplies the container and the behaviour together. If the container really differs, wear `useRovingRadioGroup` and " +
        "register it in this file's REGISTERED with the reason.",
    ).toEqual([]);
  });

  it("registration is not an exemption — a registered file must really call the hook", () => {
    const fake: string[] = [];
    for (const [file] of REGISTERED) {
      if (!census.hookFiles.has(file)) fake.push(`${file}: registered but there is no ${HOOK} call`);
    }
    expect(fake, "a registration that only writes the name is laundering").toEqual([]);
  });

  it("behaviour-layer adoption does not go backwards — the floor of hook call sites", () => {
    /*
     * A place wearing the hook loses its `role` literal and leaves the scan above's
     * view, which removes any eye on "adoption being quietly rolled back" — this floor
     * is that eye. Raising it is free; lowering it turns red (a ratchet always runs one
     * way).
     */
    expect(
      census.hookCallSites,
      `the "sites" calling ${HOOK} shrank — check whether a group had the behaviour layer stripped out.`,
    ).toBeGreaterThanOrEqual(HOOK_ADOPTION_FLOOR);
  });

  it("reclaimed ledger entries come down — a ledger more generous than the measurement is not a ratchet", () => {
    const stale: string[] = [];
    for (const [file, allowed] of DEBT) {
      const actual = census.found.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: ledger ${allowed} > measured ${actual} — lower it`);
    }
    expect(stale).toEqual([]);
  });

  it("notation coverage — it does not watch only one kind of quote", () => {
    /*
     * Proves synthetically that the regex matches every notation even if only one exists today, since
     * a non-empty set is not the same as seeing the whole set.
     */
    const probe = `role="radiogroup" role='radiogroup' role={"radiogroup"}`;
    expect([...probe.matchAll(ROLE_RE)]).toHaveLength(3);
    // Quotations inside comments are not counted — documenting a migration must not become a violation.
    const commented = stripComments(`/** 종전엔 role="radiogroup" 을 손으로 걸었다 */\nconst x = 1;`);
    expect([...commented.matchAll(ROLE_RE)]).toHaveLength(0);
    expect(census.doubleQuoted + census.singleQuoted).toBe(
      [...census.found.values()].reduce((a, b) => a + b, 0),
    );
  });
});
