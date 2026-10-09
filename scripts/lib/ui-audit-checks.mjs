import { composite, judgeText, parseColor } from "./contrast.mjs";

export const CHECKS = ["overflow", "occluded", "overlap", "target", "off-ramp", "contrast", "regularity", "scroll-end"];
const FAILING_CHECKS = new Set(["overflow", "occluded", "contrast", "scroll-end"]);
const RAMP_PREFIXES = { text: "--text-", leading: "--leading-", radius: "--radius-", shadow: "--shadow-", elevation: "--elevation-" };
const SKIP_SUFFIX = /--(letter-spacing|font-weight|font-feature-settings|font-variation-settings)$/;

export function parseRampNames(cssText) {
  const names = { text: new Set(), leading: new Set(), radius: new Set(), shadow: new Set() };
  const stripped = String(cssText).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
    const name = m[1];
    if (SKIP_SUFFIX.test(name)) continue;
    if (name.startsWith(RAMP_PREFIXES.text)) {
      (name.endsWith("--line-height") ? names.leading : names.text).add(name);
    } else if (name.startsWith(RAMP_PREFIXES.leading)) names.leading.add(name);
    else if (name.startsWith(RAMP_PREFIXES.radius)) names.radius.add(name);
    else if (name.startsWith(RAMP_PREFIXES.shadow) || name.startsWith(RAMP_PREFIXES.elevation)) names.shadow.add(name);
  }
  return Object.fromEntries(Object.entries(names).map(([k, v]) => [k, [...v].sort()]));
}

export function selectorPath(chain) {
  return chain
    .slice(0, 4)
    .reverse()
    .map(({ tag, id, classes = [] }) => `${tag}${id ? `#${id}` : ""}${classes.slice(0, 2).map((c) => `.${c}`).join("")}`)
    .join(" > ");
}

export function resolveContrast({ fg, bgStack, canvas, fontSizePx, fontWeight }) {
  const fore = parseColor(fg);
  let base = parseColor(canvas) ?? [0, 0, 0, 1];
  if (base[3] < 1) base = composite(base, [0, 0, 0, 1]);
  for (let i = bgStack.length - 1; i >= 0; i -= 1) {
    const layer = parseColor(bgStack[i]);
    if (!layer) return { unmeasured: true };
    base = composite(layer, base);
  }
  if (!fore) return { unmeasured: true };
  const fgSolid = composite(fore, base);
  const rgb = (c) => `rgb(${c.slice(0, 3).map((v) => Math.round(v)).join(", ")})`;
  return judgeText({ fg: rgb(fgSolid), bg: rgb(base), fontSizePx, fontWeight });
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const PILL_PX = 9999;

export function visibleShadow(value) {
  if (!value || value === "none") return "none";
  const layers = value
    .split(/,(?![^(]*\))/)
    .map((layer) => layer.trim())
    .filter((layer) => {
      const color = /rgba?\([^)]*\)/.exec(layer);
      return color === null || parseColor(color[0])?.[3] !== 0;
    });
  return layers.length ? layers.join(", ") : "none";
}

export function offRampFindings(samples, ramps) {
  const px = (list) => list.map(parseFloat).filter(Number.isFinite);
  const textPx = px(ramps.text);
  const leadingPx = px(ramps.leading.filter((v) => /px$/.test(v)));
  const leadingRatio = ramps.leading.filter((v) => /^[\d.]+$/.test(v)).map(Number);
  const radiusPx = px(ramps.radius);
  const shadows = new Set(ramps.shadow.map(visibleShadow));
  const out = [];
  const seen = new Set();
  const push = (f) => {
    const key = `${f.selector}|${f.property}|${f.value}`;
    if (!seen.has(key)) out.push(f);
    seen.add(key);
  };
  for (const s of samples) {
    if (s.fontSize !== undefined) {
      const fs = parseFloat(s.fontSize);
      if (!textPx.some((v) => near(v, fs, 0.05))) push({ selector: s.selector, property: "font-size", value: s.fontSize });
      if (s.lineHeight !== "normal") {
        const lh = parseFloat(s.lineHeight);
        const ok = leadingPx.some((v) => near(v, lh, 0.5)) || leadingRatio.some((r) => near(r * fs, lh, 0.5));
        if (!ok) push({ selector: s.selector, property: "line-height", value: s.lineHeight });
      }
    }
    for (const r of s.radii ?? []) {
      const v = parseFloat(r);
      if (v === 0 || v >= PILL_PX || !Number.isFinite(v) || r.includes("%")) continue;
      if (!radiusPx.some((x) => near(x, v, 0.05))) {
        push({ selector: s.selector, property: "border-radius", value: r });
        break;
      }
    }
    const shadow = visibleShadow(s.boxShadow);
    if (shadow !== "none" && !shadows.has(shadow)) {
      push({ selector: s.selector, property: "box-shadow", value: shadow });
    }
  }
  return out;
}

export function regularityFindings(siblingSets) {
  const out = [];
  for (const set of siblingSets) {
    const groups = new Map();
    for (const item of set) {
      if (!item.classes) continue;
      const key = `${item.classes}|${Math.round(item.top)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const items of groups.values()) {
      if (items.length < 3) continue;
      const heights = items.map((i) => i.height);
      const spread = Math.max(...heights) - Math.min(...heights);
      if (spread > 1) {
        out.push({ selector: items[0].selector, count: items.length, heights: heights.map((h) => Math.round(h * 10) / 10), spread: Math.round(spread * 10) / 10 });
      }
    }
  }
  return out;
}

const isChain = (v) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && "tag" in v[0];
const named = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, isChain(v) ? selectorPath(v) : v]));

export function judgeRaw(input, { width }) {
  const raw = {
    ...input,
    ...Object.fromEntries(
      ["overflow", "occluded", "overlap", "targets", "styled", "texts", "scrollEnd"].map((k) => [k, input[k].map(named)]),
    ),
    siblingSets: input.siblingSets.map((set) => set.map(named)),
  };
  const contrast = [];
  let unmeasured = 0;
  for (const t of raw.texts) {
    const r = resolveContrast({ ...t, canvas: raw.canvas });
    if (r.unmeasured || r.ratio === undefined) {
      unmeasured += 1;
      continue;
    }
    if (!r.passes) contrast.push({ selector: t.selector, ratio: r.ratio, required: r.required, fg: t.fg, sample: t.sample });
  }
  contrast.sort((a, b) => a.ratio - b.ratio);
  const findings = {
    overflow: raw.overflow,
    occluded: raw.occluded,
    overlap: raw.overlap,
    target: width <= 768 ? raw.targets : [],
    "off-ramp": offRampFindings(raw.styled, raw.ramps),
    contrast,
    regularity: regularityFindings(raw.siblingSets),
    "scroll-end": raw.scrollEnd,
  };
  return { findings, unmeasured };
}

export function formatSummary(route, width, findings) {
  return `${route} @${width}: ${CHECKS.map((c) => `${c} ${findings[c].length}`).join(" · ")}`;
}

export function formatFinding(check, f) {
  const { selector, ...rest } = f;
  const detail = Object.entries(rest)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : typeof v === "string" ? JSON.stringify(v.slice(0, 60)) : v}`)
    .join(" ");
  return `    ${check}: ${selector ?? ""} ${detail}`.trimEnd();
}

export function shouldFail(results) {
  return results.some((r) => [...FAILING_CHECKS].some((c) => r.findings[c].length > 0));
}
