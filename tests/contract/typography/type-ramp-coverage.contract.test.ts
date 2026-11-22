import { existsSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// **Read the original** rather than duplicating the glob list here — a copy drifts
// silently, creating the very blind spot this test exists to guard.
import {
  arbitrarySizeSelectors,
  rampCoveredGlobs,
  rampDebtExemptions,
} from "../../../eslint.config.mjs";

/**
 * Pins coverage of the type, radius, leading, motion and shadow ramp specs. The lint config is a
 * denylist, so a newly created directory is covered; ESLint itself is run through
 * `calculateConfigForFile` rather than copying its selectors as regexes.
 */

/**
 * Debt ledger for exception files, empty. An empty array must not make the checks green for free,
 * so when it is empty they instead measure that a once-exempt file receives the ramp selectors.
 */
const EXEMPT_DEBT: ReadonlyArray<readonly [string, number]> = [];

/**
 * Files that were once exceptions: confirms those paths really receive the ramp selectors, so an
 * empty list cannot hide a spec that is still absent.
 */
const FORMERLY_EXEMPT = [
  "src/entities/project/ui/ProjectCard.tsx",
  "src/views/root-entry/ui/RootEntryPage.tsx",
] as const;

/**
 * **Paths that do not exist yet** — one per FSD layer plus the routing root, so
 * wherever the next person puts a new surface it is covered from day one.
 */
const FUTURE_PATHS = [
  "src/views/brand-new-surface/ui/BrandNewPage.tsx",
  "src/widgets/brand-new-widget/ui/BrandNewWidget.tsx",
  "src/features/brand-new-feature/ui/BrandNewControl.tsx",
  "src/entities/brand-new-entity/ui/BrandNewCard.tsx",
  "src/shared/ui/brand-new-primitive.tsx",
  "src/shared/lib/brand-new-helper.ts",
  "src/app/brand-new-provider.tsx",
  "app/[locale]/brand-new/page.tsx",
];

/** The single line the field trial planted. It trips four families at once. */
const FIELD_TRIAL_VIOLATION =
  'export const Probe = () => <div className="text-[13px] rounded-[5px] leading-[1.9] duration-300" />;\n';

/** The compliant form of the same line — ramp utilities only. Turning red here is a false positive. */
const RAMP_CLEAN =
  'export const Probe = () => <div className="text-body rounded-card leading-body" />;\n';

const PROBE_PATH = "src/views/brand-new-surface/ui/BrandNewPage.tsx";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const exemptions = rampDebtExemptions as string[];
const rampSelectors = (arbitrarySizeSelectors as { selector: string }[]).map(
  (rule) => rule.selector,
);

/**
 * Explicit timeout: this is the only contract that runs real ESLint over files, so it is slow with
 * high variance, and a gate that fails on time is noise. 30 seconds still catches a genuine loop.
 */
const ESLINT_CASE_TIMEOUT_MS = 30_000;

/** Uses the repository's real `eslint.config.mjs` as is. */
const eslint = new ESLint({ cwd: REPO_ROOT });

/**
 * An instance that **forcibly re-enables** the ramp rules on exception files.
 * `overrideConfig` is appended after the config file so it beats the exception's
 * `ignores` — measuring debt requires the rules to be on.
 */
const eslintForcingRamp = new ESLint({
  cwd: REPO_ROOT,
  overrideConfig: [
    {
      files: [...exemptions],
      rules: { "no-restricted-syntax": ["error", ...(arbitrarySizeSelectors as object[])] },
    },
  ],
});

function selectorsFor(config: { rules?: Record<string, unknown> }): string[] {
  const entry = config.rules?.["no-restricted-syntax"];
  if (!Array.isArray(entry)) return [];
  return entry
    .slice(1)
    .map((option) => (option as { selector?: string }).selector)
    .filter((selector): selector is string => typeof selector === "string");
}

async function measureExemptDebt(): Promise<Map<string, number>> {
  const results = await eslintForcingRamp.lintFiles([...exemptions]);
  return new Map(
    results.map((result) => [
      path.relative(REPO_ROOT, result.filePath),
      result.messages.filter((message) => message.ruleId === "no-restricted-syntax").length,
    ]),
  );
}

describe("ramp lint coverage: is a new surface covered from day one", () => {
  it("coverage is a deny list and has not gone back to an allow list", () => {
    // This assertion is the heart of the file. The moment a directory list appears
    // here, the "a newly created directory is on no list" hole returns intact.
    expect(rampCoveredGlobs).toEqual(["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"]);
  });

  it("the detector does not spin idle on an empty set, since the ramp selectors exist", () => {
    // If the selector array is empty, every universal assertion below goes green for free.
    expect(rampSelectors.length).toBeGreaterThanOrEqual(20);
    expect(rampSelectors.some((selector) => selector.includes("text-\\[[0-9.]+px"))).toBe(true);
    // Both spellings, since the ramp is `rem`: a selector set that knows only `px` leaves
    // `text-[0.8125rem]` outside every rule.
    expect(rampSelectors.some((selector) => selector.includes("text-\\[[0-9.]+rem"))).toBe(true);
  });

  it("a path that does not exist yet also receives every ramp selector", async () => {
    const uncovered: string[] = [];
    for (const futurePath of FUTURE_PATHS) {
      const config = await eslint.calculateConfigForFile(futurePath);
      const applied = new Set(selectorsFor(config));
      const missing = rampSelectors.filter((selector) => !applied.has(selector));
      if (missing.length > 0) uncovered.push(`  ${futurePath}: ${missing.length} selectors missing`);
    }

    expect(
      uncovered,
      `A path that does not exist yet is outside the ramp rule. This is exactly the defect the 2026-08-04\n` +
        `real-use trial caught: a new screen that received none of the spec.\n` +
        `Do not narrow rampCoveredGlobs in eslint.config.mjs.\n` +
        uncovered.join("\n"),
    ).toEqual([]);
  }, ESLINT_CASE_TIMEOUT_MS);

  it("probe: planting four violations in a new directory turns it red", async () => {
    const [result] = await eslint.lintText(FIELD_TRIAL_VIOLATION, { filePath: PROBE_PATH });
    const ramp = result.messages.filter((message) => message.ruleId === "no-restricted-syntax");
    // text-[13px] · rounded-[5px] · leading-[1.9] · duration-300 — four.
    expect(
      ramp.length,
      `A ramp violation planted in a new directory was not caught. A gate that always passes\n` +
        `cannot be told apart from no gate.`,
    ).toBe(4);
    expect(result.errorCount).toBeGreaterThanOrEqual(4);
  }, ESLINT_CASE_TIMEOUT_MS);

  it("probe: normal ramp values in the same place pass", async () => {
    const [result] = await eslint.lintText(RAMP_CLEAN, { filePath: PROBE_PATH });
    const ramp = result.messages.filter((message) => message.ruleId === "no-restricted-syntax");
    expect(
      ramp.map((message) => message.message),
      "a normal ramp utility is caught as a violation; a false positive is noise and noise drowns the signal.",
    ).toEqual([]);
  }, ESLINT_CASE_TIMEOUT_MS);
});

describe("ramp debt exception ledger", () => {
  it("exceptions are per file, not directory globs", () => {
    // Excluding by directory also excludes **files created inside it later**. That was
    // the allowlist era's hole and must not reopen here.
    const globby = exemptions.filter((entry) => /[*?[\]]/.test(entry));
    expect(
      globby,
      `A glob entered the exemptions. List each indebted **file** one by one, so that\n` +
        `a file created next to them is covered from its first day.\n${globby.join("\n")}`,
    ).toEqual([]);
  });

  it("every exception path exists, since a ghost exception is a ghost budget", () => {
    const missing = exemptions.filter((entry) => !existsSync(path.join(REPO_ROOT, entry)));
    expect(missing, `exceptions remain for files that do not exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("the ledger and the exception list are the same set", () => {
    expect([...exemptions].sort()).toEqual(EXEMPT_DEBT.map(([file]) => file).sort());
  });

  it("when the exception list is empty, \"files that used to be exceptions\" receive every ramp selector", async () => {
    // While exceptions existed the question was "is it an exception in name only".
    // With the list empty the opposite is asked — if the exception was deleted but the
    // path is still uncovered for another reason (a glob typo, block order), only the
    // list is clean while the spec is still absent.
    if (exemptions.length > 0) {
      const config = await eslint.calculateConfigForFile(exemptions[0]);
      const applied = new Set(selectorsFor(config));
      expect(rampSelectors.some((selector) => applied.has(selector))).toBe(false);
      return;
    }
    for (const file of FORMERLY_EXEMPT) {
      const applied = new Set(selectorsFor(await eslint.calculateConfigForFile(file)));
      const missing = rampSelectors.filter((selector) => !applied.has(selector));
      expect(missing, `${file} does not receive the ramp selectors: ${missing.length} kinds`).toEqual([]);
    }
  }, ESLINT_CASE_TIMEOUT_MS);

  it("the debt of exception files does not exceed the ledger, and a file that reached 0 leaves the exceptions", async () => {
    // With an empty list there is nothing to ratchet, so **whether it is really 0** is
    // measured instead — "the exception was deleted" and "there are no violations" are
    // different facts, and only the latter is the spec.
    if (EXEMPT_DEBT.length === 0) {
      const results = await eslint.lintFiles([...FORMERLY_EXEMPT]);
      const left = results
        .map((r) => [
          path.relative(REPO_ROOT, r.filePath),
          r.messages.filter((m) => m.ruleId === "no-restricted-syntax").length,
        ] as const)
        .filter(([, n]) => n > 0);
      expect(left, `the exception was removed but violations remain: ${JSON.stringify(left)}`).toEqual([]);
      return;
    }
    const actual = await measureExemptDebt();
    const grown: string[] = [];
    const cleared: string[] = [];

    for (const [file, budget] of EXEMPT_DEBT) {
      const count = actual.get(file) ?? 0;
      if (count > budget) grown.push(`  ${file}: ${budget} → ${count} (grew)`);
      if (count === 0) cleared.push(`  ${file}: ledger ${budget} → measured 0 (remove from exceptions)`);
    }

    expect(
      [...grown, ...cleared],
      `The ramp exemption ledger is out of step.\n` +
        `- If it grew: these files are only temporarily out of lint because of legacy debt,\n` +
        `  and the ratchet **only goes down**. Use text-caption/label/body/body-lg/\n` +
        `  title/display/hero · rounded-micro/chip/card/panel/sheet · leading-* ·\n` +
        `  --motion-*, and if you need a value the ramp lacks, open a new-token PR first.\n` +
        `- If it reached 0: remove it from rampDebtExemptions in eslint.config.mjs and from this\n` +
        `  file's ledger; exemptions are temporary and lint is the real gate.\n` +
        `${[...grown, ...cleared].join("\n")}`,
    ).toEqual([]);
  }, ESLINT_CASE_TIMEOUT_MS);
});
