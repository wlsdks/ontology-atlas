
import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * The caps micro-label — `font-mono` + `uppercase` + `--tracking-caps-*` — is a Latin
 * typographic device, and all three parts have to stand down in Korean, not just one.
 *
 * The tracking was already zeroed under `:root:is(:lang(ko), :lang(ja), :lang(zh))`. The other two were not, and
 * `font-mono` is the one that actually shows: font fallback is per glyph, so Hangul drops
 * to Pretendard while the space between words is still drawn by JetBrains Mono at a
 * monospace advance. Measured on the installed app's tool-list eyebrow: syllable gaps
 * 2-5px against word gaps 17-18px at 2x. That is why this gate checks the rendered
 * consequence (which declarations exist) rather than the intent.
 *
 * **The selector is the contract.** `.font-mono.uppercase` is the device and nothing else —
 * a path, a slug, or a command carries `font-mono` without `uppercase`, so those keep mono
 * in every locale. Widening this to `.font-mono` would put Korean prose and shell commands
 * in the same bucket.
 */
const CSS = readGlobalCss();
const CJK = String.raw`:root:is\(:lang\(ko\), :lang\(ja\), :lang\(zh\)\)`;
const CAPS_DEVICE = new RegExp(String.raw`${CJK}\s+\.font-mono\.uppercase\s*\{`);
const CAPS_TRACKING = new RegExp(String.raw`${CJK}\s*\{`);
const BARE_MONO = new RegExp(String.raw`:root:[^{]*\.font-mono\s*\{`);

/** The override must sit outside every `@layer`, or a utility layer wins it back. */
function isOutsideLayers(css: string, index: number): boolean {
  let depth = 0;
  let inLayer = false;
  let layerDepth = 0;
  const layerRe = /@layer[^{;]*\{/g;
  const marks: Array<[number, "open" | "close"]> = [];
  for (const m of css.matchAll(layerRe)) marks.push([m.index + m[0].length - 1, "open"]);
  for (let i = 0; i < index; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      depth += 1;
      if (marks.some(([at]) => at === i)) {
        inLayer = true;
        layerDepth = depth;
      }
    } else if (ch === "}") {
      if (inLayer && depth === layerDepth) inLayer = false;
      depth -= 1;
    }
  }
  return !inLayer;
}

describe("caps micro-label is Latin-only", () => {
  it("finds the Korean override for the whole device", () => {
    expect(CSS).toMatch(CAPS_DEVICE);
  });

  it("stands down both remaining parts, not just one", () => {
    const at = CSS.search(CAPS_DEVICE);
    const block = CSS.slice(at, CSS.indexOf("}", at));
    expect(block).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(block).toMatch(/text-transform:\s*none/);
  });

  it("keeps the tracking half of the same device zeroed", () => {
    const at = CSS.search(CAPS_TRACKING);
    const block = CSS.slice(at, CSS.indexOf("}", at));
    for (const step of ["08", "10", "12", "14", "16"]) {
      expect(block).toContain(`--tracking-caps-${step}: 0em`);
    }
  });

  it("sits outside every @layer so a utility cannot win it back", () => {
    const at = CSS.search(CAPS_DEVICE);
    expect(at).toBeGreaterThan(-1);
    expect(isOutsideLayers(CSS, at)).toBe(true);
  });

  it("does not widen to bare .font-mono, which would demote code as well", () => {
    expect(CSS).not.toMatch(BARE_MONO);
  });

  it("still has a device left to govern — the scan is not empty", () => {
    expect(CSS).toContain("--tracking-caps-14");
  });
});
