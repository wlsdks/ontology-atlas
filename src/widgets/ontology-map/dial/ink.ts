import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { DialMarks, DialTokens } from "./types";

export interface DialInks {
  bg: string;
  flow: string;
  flowReceded: string;
  needs: string;
  usedBy: string;
  relates: string;
  numeral: string;
  domainLabel: string;
  domainLabelReceded: string;
  domainLabelAttended: string;
  units: string;
  capabilityLabel: string;
  projectLabel: string;
  rail: string;
  railReceded: string;
  capabilityFill: string;
  capabilityRim: string;
  capabilityReceded: string;
  elementFill: string;
  element: string;
  elementReceded: string;
  holeFill: string;
  stale: string;
  unknownRim: string;
}

let cached: { map: OntologyMapTokens; dial: DialTokens; inks: DialInks } | null = null;

function parseColor(value: string): [number, number, number, number] {
  const v = value.trim();
  if (v.startsWith("#")) {
    const hex = v.length === 4 || v.length === 5 ? v.slice(1).split("").map((c) => c + c).join("") : v.slice(1);
    const alpha = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), alpha];
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1]!.split(/[\s,/]+/).filter(Boolean).map((p) => Number.parseFloat(p));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }
  throw new Error(`dial ink: unsupported colour "${value}"`);
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function mixOver(fg: string, bg: string, share = 1): string {
  const [fr, fgG, fb, fa] = parseColor(fg);
  const [br, bgG, bb] = parseColor(bg);
  const t = Math.min(1, Math.max(0, share * fa));
  return toHex(br + (fr - br) * t, bgG + (fgG - bgG) * t, bb + (fb - bb) * t);
}

export function crossfadeInk(from: string, to: string, t: number): string {
  if (t >= 1) return mixOver(to, to);
  if (t <= 0) return mixOver(from, from);
  const [fr, fg, fb] = parseColor(mixOver(from, from));
  const [tr, tg, tb] = parseColor(mixOver(to, to));
  return toHex(fr + (tr - fr) * t, fg + (tg - fg) * t, fb + (tb - fb) * t);
}

export function resolveDialInks(map: OntologyMapTokens, dial: DialTokens): DialInks {
  if (cached && cached.map === map && cached.dial === dial) return cached.inks;
  const bg = mixOver(map.canvasBgNear, map.canvasBgNear);
  const recede = (c: string) => mixOver(c, bg, map.egoRestAlpha);
  const opaque = (c: string) => mixOver(c, bg);
  const inks: DialInks = {
    bg,
    flow: opaque(map.edgeDepends),
    flowReceded: recede(map.edgeDepends),
    needs: opaque(map.indigoBright),
    usedBy: opaque(map.edgeSelected),
    relates: opaque(map.edgeDepends),
    numeral: opaque(map.labelDomain),
    domainLabel: opaque(map.labelDomain),
    domainLabelReceded: recede(map.labelDomain),
    domainLabelAttended: opaque(dial.attendedNameInk),
    units: opaque(map.labelElement),
    capabilityLabel: opaque(map.labelCapability),
    projectLabel: opaque(map.labelProject),
    rail: opaque(map.edgeContainsL2),
    railReceded: recede(map.edgeContainsL2),
    capabilityFill: opaque(map.nodeFillCapability),
    capabilityRim: opaque(map.nodeStrokeCapability),
    capabilityReceded: recede(map.nodeStrokeCapability),
    elementFill: opaque(map.nodeFillElement),
    element: opaque(map.nodeStrokeElement),
    elementReceded: recede(map.nodeStrokeElement),
    holeFill: opaque(map.nodeHoleFill),
    stale: opaque(map.statusWarning),
    unknownRim: opaque(map.nodeStrokeDim),
  };
  cached = { map, dial, inks };
  return inks;
}

const inkSlots = new WeakMap<string[], Map<string, number>>();

export function inkIndex(marks: Pick<DialMarks, "inks">, color: string): number {
  let slots = inkSlots.get(marks.inks);
  if (!slots) {
    slots = new Map(marks.inks.map((c, i) => [c, i]));
    inkSlots.set(marks.inks, slots);
  }
  const found = slots.get(color);
  if (found !== undefined && marks.inks[found] === color) return found;
  const next = marks.inks.length;
  marks.inks.push(color);
  slots.set(color, next);
  return next;
}
