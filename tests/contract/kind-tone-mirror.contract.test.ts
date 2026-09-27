import { describe, expect, it } from "vitest";
import {
  ONTOLOGY_KIND_PAINT,
  ONTOLOGY_KIND_TONE,
  ONTOLOGY_VISUAL_KINDS,
} from "@/entities/ontology-class/model/tone";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * **Kind tone lives in `app/globals.css`; `tone.ts` carries a copy for paint.**
 *
 * The five qualitative hues (one per ontology kind, the only data-mark colour the design
 * system permits) were rgba literals in a `.ts` model until 2026-09-08, invisible to every
 * colour gate. Now the token is the source — `--color-kind-<kind>-rgb` plus the four alpha
 * steps — and the DOM reads `var(...)`. A canvas or a contrast measurement cannot read a
 * variable, so `ONTOLOGY_KIND_PAINT` copies the triplet; this test is what makes that copy a
 * mirror rather than a second source: change one side and it turns red.
 */
const CSS = readGlobalCss();

function cssTriplet(kind: string): readonly [number, number, number] | null {
  const m = CSS.match(new RegExp(`--color-kind-${kind}-rgb:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

describe("kind tone — the CSS token and the paint copy agree", () => {
  it("declares every kind's triplet in globals.css", () => {
    for (const kind of ONTOLOGY_VISUAL_KINDS) expect(cssTriplet(kind), kind).not.toBeNull();
  });

  it("copies the same triplet into the paint table", () => {
    for (const kind of ONTOLOGY_VISUAL_KINDS) {
      expect(ONTOLOGY_KIND_PAINT[kind].rgb, kind).toEqual(cssTriplet(kind));
      expect(ONTOLOGY_KIND_PAINT[kind].fill).toBe(`rgba(${ONTOLOGY_KIND_PAINT[kind].rgb.join(", ")}, 0.94)`);
    }
  });

  it("DOM consumers reference the token, never a literal", () => {
    for (const kind of ONTOLOGY_VISUAL_KINDS) {
      const tone = ONTOLOGY_KIND_TONE[kind];
      for (const value of [tone.fill, tone.border, tone.chipBg, tone.chipBorder]) {
        expect(value).toMatch(/^var\(--color-kind-[a-z]+-[a-z-]+\)$/);
      }
    }
  });

  it("each token the table references exists with one of the four alpha steps", () => {
    for (const kind of ONTOLOGY_VISUAL_KINDS) {
      for (const step of ["fill", "border", "chip-bg", "chip-border"]) {
        const m = CSS.match(new RegExp(`--color-kind-${kind}-${step}:\\s*rgb\\(var\\(--color-kind-${kind}-rgb\\) / (0\\.\\d+)\\);`));
        expect(m, `${kind} ${step}`).not.toBeNull();
        // Chips stay quiet: a tint, not a block (the tone contract's own ceiling).
        if (step === "chip-bg") expect(Number(m![1])).toBeLessThanOrEqual(0.12);
        if (step === "chip-border") expect(Number(m![1])).toBeLessThanOrEqual(0.46);
      }
    }
  });
});
