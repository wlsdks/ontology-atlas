import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readGlobalCss } from "../../../scripts/lib/design/global-css.mjs";

const COMPOSITOR = new Set(["transform", "translate", "scale", "rotate", "opacity", "filter", "clip-path"]);

const PAINT_LICENSED: Record<string, string> = {
  acpWorkingShimmer: "the shimmer band is a text-clipped gradient, and only background-position moves it across the glyphs",
  atlasWaitingStep: "the waiting mark is a pixel sprite sheet stepped by background-position-x",
};

const RUNS_ONLY_DURING_WORK: Record<string, string> = {
  "agent-pending-dot": "agent transcript pending dot, mounted only while the turn is running or sending",
  "acp-working-shimmer": "working ink on the brief and chat counters, applied only while work is still arriving",
  "architecture-observation-scan": "architecture evidence plane and rail scan line, mounted only while observation is active",
  "motion-work-spin": "work glyph arc, mounted only while indeterminate work runs",
  "motion-work-sweep": "work progress sweep, shown only while indeterminate work runs",
};

const KEYWORDS = new Set([
  "infinite", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "both",
  "forwards", "backwards", "none", "normal", "reverse", "alternate", "alternate-reverse", "running", "paused",
]);

type Rule = { selector: string; body: string };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return text.length;
}

function keyframeProperties(css: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    const body = css.slice(open + 1, matchBrace(css, open));
    const props = out.get(m[1]!) ?? new Set<string>();
    for (const p of body.matchAll(/(?:^|[{;\s])(-{0,2}[a-z][a-z-]*)\s*:/g)) {
      if (p[1] !== "animation-timing-function") props.add(p[1]!);
    }
    out.set(m[1]!, props);
  }
  return out;
}

function rulesOf(css: string): Rule[] {
  return css
    .split("}")
    .map((chunk) => {
      const open = chunk.lastIndexOf("{");
      if (open === -1) return null;
      const before = chunk.slice(0, open);
      return { selector: before.slice(before.lastIndexOf("{") + 1).trim(), body: chunk.slice(open + 1) };
    })
    .filter((rule): rule is Rule => rule !== null);
}

function topLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") depth += 1;
    else if (value[i] === ")") depth -= 1;
    else if (value[i] === "," && depth === 0) {
      parts.push(value.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(value.slice(from));
  return parts;
}

function animationName(segment: string): string | null {
  const bare = segment.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ");
  for (const token of bare.trim().split(/\s+/)) {
    if (/^[A-Za-z_][\w-]*$/.test(token) && !KEYWORDS.has(token)) return token;
  }
  return null;
}

type Loop = { name: string; subject: string; selector: string };

function infiniteLoops(rules: Rule[]): Loop[] {
  const loops: Loop[] = [];
  for (const rule of rules) {
    const subject = rule.selector.match(/\.([\w-]+)/)?.[1] ?? rule.selector;
    const longhandName = rule.body.match(/animation-name\s*:\s*([\w-]+)/)?.[1];
    if (longhandName && /animation-iteration-count\s*:[^;]*\binfinite\b/.test(rule.body)) {
      loops.push({ name: longhandName, subject, selector: rule.selector });
    }
    const animation = rule.body.match(/(?:^|[;\s])animation\s*:([^;]*)/)?.[1];
    if (!animation || !/\binfinite\b/.test(animation)) continue;
    for (const segment of topLevelCommas(animation)) {
      if (!/\binfinite\b/.test(segment)) continue;
      loops.push({ name: animationName(segment) ?? "(no keyframe)", subject, selector: rule.selector });
    }
  }
  return loops;
}

function isPaused(rules: Rule[], subject: string): boolean {
  const mentions = (rule: Rule) => new RegExp(`\\.${subject}(?![\\w-])`).test(rule.selector);
  const paused = rules.some((rule) => mentions(rule) && /animation-play-state\s*:\s*paused/.test(rule.body));
  const resumed = rules.some(
    (rule) =>
      mentions(rule) &&
      /\[data-[\w-]*motion=['"]running['"]\]/.test(rule.selector) &&
      /animation-play-state\s*:\s*running/.test(rule.body),
  );
  return paused && resumed;
}

function offendersOf(css: string): string[] {
  const clean = stripComments(css);
  const frames = keyframeProperties(clean);
  const rules = rulesOf(clean);
  const offenders: string[] = [];
  for (const loop of infiniteLoops(rules)) {
    const props = frames.get(loop.name);
    if (!props) {
      offenders.push(`${loop.selector}: keyframe ${loop.name} is not defined`);
      continue;
    }
    for (const prop of props) {
      if (COMPOSITOR.has(prop)) continue;
      if (/^background-position(?:-[xy])?$/.test(prop) && loop.name in PAINT_LICENSED) continue;
      offenders.push(`${loop.selector}: ${loop.name} animates ${prop} in a loop`);
    }
    if (!(loop.subject in RUNS_ONLY_DURING_WORK) && !isPaused(rules, loop.subject)) {
      offenders.push(`${loop.selector}: runs at rest; pause it until a data-*-motion='running' selector or list it as work-only`);
    }
  }
  return offenders;
}

const REPO = path.join(import.meta.dirname, "..", "..", "..");

function trackedFiles(pattern: RegExp): string[] {
  return execFileSync("git", ["ls-files", "src", "app"], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter((file) => pattern.test(file));
}

const SOURCE_LOOP = /\brepeat\s*:\s*Infinity\b|\biterations\s*:\s*Infinity\b|animate-\[[^\]]*infinite/;

const SCRIPTED_LOOPS: Record<string, string> = {};

function scriptedLoops(files: readonly string[], read: (file: string) => string): string[] {
  return files.filter((file) => SOURCE_LOOP.test(read(file)) && !(file in SCRIPTED_LOOPS));
}

const CSS = [
  readGlobalCss(),
  ...trackedFiles(/\.module\.css$/).map((file) => readFileSync(path.join(REPO, file), "utf8")),
].join("\n");

describe("infinite motion: loops are compositor-only, defined, and paused or tied to work", () => {
  it("every infinite CSS animation in the stylesheet passes", () => {
    expect(offendersOf(CSS)).toEqual([]);
  });

  it("the census finds the loops, and no allowlist entry is dead", () => {
    const loops = infiniteLoops(rulesOf(stripComments(CSS)));
    expect(loops.length).toBeGreaterThanOrEqual(6);
    const subjects = new Set(loops.map((loop) => loop.subject));
    const names = new Set(loops.map((loop) => loop.name));
    expect(Object.keys(RUNS_ONLY_DURING_WORK).filter((key) => !subjects.has(key))).toEqual([]);
    expect(Object.keys(PAINT_LICENSED).filter((key) => !names.has(key))).toEqual([]);
  });

  it("a layout keyframe that runs at rest is refused twice", () => {
    expect(offendersOf(".p{animation:pGrow var(--motion-base) linear infinite}@keyframes pGrow{to{width:10px}}")).toHaveLength(2);
  });

  it("a paused compositor loop resumed by a running selector passes", () => {
    const css =
      ".q{animation:qSpin var(--motion-base) linear infinite;animation-play-state:paused}" +
      ".h[data-q-motion='running'] .q{animation-play-state:running}" +
      "@keyframes qSpin{to{transform:rotate(1turn)}}";
    expect(offendersOf(css)).toEqual([]);
  });

  it("an undefined keyframe is refused", () => {
    expect(offendersOf(".r{animation:missing var(--motion-base) steps(1) infinite}")).toHaveLength(1);
  });

  it("a custom-property keyframe in a paused loop is refused", () => {
    const css =
      ".g{animation:gSpin var(--motion-expressive) linear infinite;animation-play-state:paused}" +
      ".h[data-g-motion='running'] .g{animation-play-state:running}" +
      "@keyframes gSpin{to{--glow-angle:360deg}}";
    expect(offendersOf(css)).toHaveLength(1);
  });

  it("a longhand infinite loop is read and refused when it paints", () => {
    const css =
      ".l{animation-name:lPulse;animation-iteration-count:infinite;animation-duration:var(--motion-slow)}" +
      "@keyframes lPulse{50%{box-shadow:0 0 8px red}}";
    expect(offendersOf(css)).toHaveLength(2);
  });

  it("scripted and utility infinite loops in source are listed or absent", () => {
    const files = trackedFiles(/\.tsx?$/).filter((file) => !/\.(?:test|spec)\.tsx?$/.test(file));
    expect(files.length).toBeGreaterThan(100);
    expect(scriptedLoops(files, (file) => readFileSync(path.join(REPO, file), "utf8"))).toEqual([]);
    expect(scriptedLoops(["a.ts", "b.tsx", "c.ts"], (file) => ({ "a.ts": "x({ repeat: Infinity })", "b.tsx": "<i className=\"animate-[spin_1s_linear_infinite]\" />", "c.ts": "const repeat = 1" })[file]!)).toEqual(["a.ts", "b.tsx"]);
  });
});
