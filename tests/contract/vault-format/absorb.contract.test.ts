import { describe, expect, it } from "vitest";
import {
  SPLIT_CASES,
  CLASSIFY_CASES,
  INJECTION_CASES,
  PLAN_CASES,
} from "../../fixtures/absorb-cases.mjs";
import * as absorbCli from "../../../cli/src/lib/mcp-bridge/absorb.mjs";
import * as absorbMcp from "../../../mcp/src/absorb.mjs";

/**
 * The CLI re-exports `mcp/src/absorb.mjs`, so only `buildAbsorptionPlan` runs through both bindings;
 * later stages run on the canonical module alone (a `cli === mcp` check would compare a function
 * with itself).
 */

const IMPLEMENTATIONS = [{ label: "mcp", mod: absorbMcp }];

/** Entry points the CLI calls directly, so both bindings are worth running. */
const PLAN_IMPLEMENTATIONS = [
  { label: "cli", mod: absorbCli },
  { label: "mcp", mod: absorbMcp },
];

describe("absorb contract — cli & mcp agree", () => {
  describe("splitDocumentSections", () => {
    for (const { label, mod } of IMPLEMENTATIONS) {
      for (const c of SPLIT_CASES) {
        it(`${c.name} (${label})`, () => {
          const result = mod.splitDocumentSections(c.input);
          expect(result.title).toBe(c.expected.title);
          expect(result.intro).toBe(c.expected.intro);
          expect(result.sections.map((s: { heading: string; body: string }) => ({
            heading: s.heading,
            body: s.body,
          }))).toEqual(c.expected.sections);
        });
      }
    }
  });

  describe("classifySection", () => {
    for (const { label, mod } of IMPLEMENTATIONS) {
      for (const c of CLASSIFY_CASES) {
        it(`${c.name} (${label})`, () => {
          const result = mod.classifySection(c.section);
          expect(result.category).toBe(c.expectedCategory);
          expect(result.kind).toBe(c.expectedKind);
          expect(result.role).toBe(c.expectedRole);
          expect(result.confidence).toBeGreaterThanOrEqual(c.minConfidence);
        });
      }
    }
  });

  describe("scanForInjection", () => {
    for (const { label, mod } of IMPLEMENTATIONS) {
      for (const c of INJECTION_CASES) {
        it(`${c.name} (${label})`, () => {
          const result = mod.scanForInjection(c.text);
          expect(result.suspect).toBe(c.expectedSuspect);
          if (c.expectedPattern) {
            expect(result.matches.map((m) => m.pattern)).toContain(c.expectedPattern);
          }
        });
      }
    }
  });

  describe("buildAbsorptionPlan", () => {
    for (const { label, mod } of PLAN_IMPLEMENTATIONS) {
      for (const c of PLAN_CASES) {
        it(`${c.name} (${label})`, () => {
          const existing = new Set(c.existingSlugs || []);
          const plan = mod.buildAbsorptionPlan(c.input, {
            sourceLabel: c.sourceLabel,
            isSlugTaken: (slug) => existing.has(slug),
          });
          for (const [heading, action] of Object.entries(c.expectedActions)) {
            const section = plan.sections.find((s) => s.heading === heading);
            expect(section, `section "${heading}" should exist`).toBeTruthy();
            expect(section?.action, `section "${heading}" action`).toBe(action);
          }
          if (c.expectedInjectionSuspectHeadings) {
            const flagged = plan.sections
              .filter((s) => s.injection.suspect)
              .map((s) => s.heading);
            expect(flagged).toEqual(c.expectedInjectionSuspectHeadings);
          }
          if (c.expectedTargetSlug) {
            for (const [heading, slug] of Object.entries(c.expectedTargetSlug)) {
              const section = plan.sections.find((s) => s.heading === heading);
              expect(section?.targetSlug).toBe(slug);
            }
          }
        });
      }
    }
  });
});
