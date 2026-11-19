import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { deriveOntologyFromVault, dogfoodManifest, DOGFOOD_AGENT_SLUG_PREFIX } from '@/entities/docs-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';

import { crossings, distanceToRect, grow, inside, overlaps, resample, circleIntoRect, type Pt, type Rect } from './film-geometry';
import { layoutFilmMap, type FilmCopy, type FilmLabel, type FilmMapLayout, type FilmMarkTokens } from './film-map-layout';
import { domainFlows, pickFilmConcept, readFilmVault, type FilmVault } from './film-vault';
import { buildStageGraph } from './stage-graph';

/**
 * The film's map on the bundled vault at the five stage sizes the spec names: the geometry checks
 * a rendered frame cannot answer cheaply. Text widths come from an estimate calibrated on the
 * page's font (a CJK glyph 0.95 em, a Latin one half an em, slightly wider than measured).
 */

const css = readFileSync(path.join(process.cwd(), 'app/styles/map-graph-tokens.css'), 'utf8');
const token = (name: string) => {
  const match = new RegExp(`--map-graph-${name}:\\s*([0-9.]+)`).exec(css);
  if (!match) throw new Error(`missing --map-graph-${name}`);
  return Number(match[1]);
};
const TOKENS: FilmMarkTokens = {
  domainDiscPx: token('domain-disc-px'),
  domainCorePx: token('domain-core-px'),
  domainRimPx: token('domain-rim-px'),
  projectDiscPx: token('project-disc-px'),
  projectCorePx: token('project-core-px'),
  capDiscMinPx: token('cap-disc-min-px'),
  capDiscGainPx: token('cap-disc-gain-px'),
  capDiscMaxPx: token('cap-disc-max-px'),
  capRimPx: token('cap-rim-px'),
  capCoreInsetPx: token('cap-core-inset-px'),
  capCoreMinPx: token('cap-core-min-px'),
  elementDotPx: token('element-dot-px'),
  selectedDiscPx: token('selected-disc-px'),
  selectedRingGapPx: token('selected-ring-gap-px'),
  selectedRingPx: token('selected-ring-px'),
  lineTaperPx: token('line-taper-px'),
  lineTaperGainPx: token('line-taper-gain-px'),
  lineTaperMaxPx: token('line-taper-max-px'),
  lineDotPx: token('line-dot-px'),
  lineDotGapPx: token('line-dot-gap-px'),
  lightAlpha: token('light-alpha'),
  lightReach: token('light-reach'),
  restHue: token('rest-hue'),
  growth: token('film-growth'),
  sink: token('film-sink'),
};

const measure = (text: string, font: string) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 15);
  const mono = font.includes('mono');
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? size * 0.95 : size * (mono ? 0.6 : 0.5);
  return w;
};

const COPY: Record<string, FilmCopy> = {
  en: {
    units: (c, e) => `${c} capabilities · ${e} elements`,
    reach: (n, b) => [{ text: `Depends on ${n} · Used by ${b}`, ink: 'secondary' }],
    agent: 'Claude Code',
    tool: 'get_concept',
  },
  ko: {
    units: (c, e) => `역량 ${c} · 요소 ${e}`,
    reach: (n, b) => [{ text: `의존 ${n}개 · 사용처 ${b}개`, ink: 'secondary' }],
    agent: 'Claude Code',
    tool: 'get_concept',
  },
  ja: {
    units: (c, e) => `ケイパビリティ${c}件 · 要素${e}件`,
    reach: (n, b) => [{ text: `${n}件に依存 · ${b}件が依存`, ink: 'secondary' }],
    agent: 'Claude Code',
    tool: 'get_concept',
  },
  zh: {
    units: (c, e) => `${c} 项能力 · ${e} 个元素`,
    reach: (n, b) => [{ text: `依赖 ${n} 个 · 被 ${b} 个依赖`, ink: 'secondary' }],
    agent: 'Claude Code',
    tool: 'get_concept',
  },
};

/**
 * The section title and the caption block as the static build lays them out at each stage
 * (measured from the page, before the layout's own 16 px and 24 px margins). Geometry is asserted
 * at 1920, where an estimated text width decides no placement; the other sizes assert the data
 * rules here, and their geometry is measured on the page with real text.
 */
const STAGES: { w: number; h: number; title: Rect; caption: Record<string, Rect>; geometry: boolean }[] = [
  {
    w: 1920,
    h: 960,
    title: { l: 200, t: 72, r: 1720, b: 94 },
    caption: {
      en: { l: 200, t: 795, r: 768.6, b: 906 },
      ko: { l: 200, t: 795, r: 659.7, b: 906 },
      ja: { l: 200, t: 793, r: 829.4, b: 906 },
      zh: { l: 200, t: 795, r: 603.6, b: 906 },
    },
    geometry: true,
  },
  {
    w: 1440,
    h: 900,
    title: { l: 200, t: 72, r: 1240, b: 94 },
    caption: { en: { l: 200, t: 744, r: 768.6, b: 855 }, ko: { l: 200, t: 744, r: 659.7, b: 855 } },
    geometry: false,
  },
  {
    w: 1280,
    h: 720,
    title: { l: 148.8, t: 72, r: 1131.2, b: 94 },
    caption: { en: { l: 148.8, t: 573, r: 717.4, b: 684 }, ko: { l: 148.8, t: 573, r: 608.5, b: 684 } },
    geometry: false,
  },
  {
    w: 768,
    h: 960,
    title: { l: 32, t: 72, r: 736, b: 94 },
    caption: { en: { l: 32, t: 797.8, r: 600.6, b: 908.8 }, ko: { l: 32, t: 797.8, r: 491.7, b: 908.8 } },
    geometry: false,
  },
  {
    w: 402,
    h: 874,
    title: { l: 24, t: 72, r: 378, b: 94 },
    caption: {
      en: { l: 24, t: 702.3, r: 294.6, b: 830.3 },
      ko: { l: 24, t: 730.3, r: 335, b: 830.3 },
      ja: { l: 24, t: 702.3, r: 293.9, b: 830.3 },
      zh: { l: 24, t: 730.3, r: 297, b: 830.3 },
    },
    geometry: false,
  },
];

const vaults = new Map<string, FilmVault>();
function vaultFor(locale: string): FilmVault {
  let vault = vaults.get(locale);
  if (!vault) {
    const insight = derivationToInsight(deriveOntologyFromVault(dogfoodManifest), locale, { agentSlugPrefix: DOGFOOD_AGENT_SLUG_PREFIX });
    vault = readFilmVault(buildStageGraph(insight.nodes, insight.edges));
    vaults.set(locale, vault);
  }
  return vault;
}

function layoutAt(stage: (typeof STAGES)[number], locale: string): FilmMapLayout {
  const vault = vaultFor(locale);
  return layoutFilmMap({
    vault,
    pick: pickFilmConcept(vault),
    w: stage.w,
    h: stage.h,
    locale,
    title: stage.title,
    caption: stage.caption[locale]!,
    measure,
    sans: 'sans',
    mono: 'mono',
    tokens: TOKENS,
    copy: COPY[locale]!,
  });
}

/** Rows that read as one block: a domain's name and count, the pick's name and reach, the agent's tag. */
const groupOf = (label: FilmLabel) => {
  if (label.role === 'domain' || label.role === 'units') return `block:${label.id}`;
  if (label.role === 'pick' || label.role === 'reach') return 'pick';
  if (label.role === 'agent' || label.role === 'tool') return 'agent';
  return label.key;
};

interface Frame {
  labels: FilmLabel[];
  boxes: { key: string; group: string; rect: Rect }[];
  marks: { id: string; x: number; y: number; r: number }[];
  lines: Pt[][];
}

function restFrame(map: FilmMapLayout): Frame {
  const S = map.sizes;
  return {
    labels: map.restLabels,
    boxes: [
      ...map.restLabels.map((l) => ({ key: l.key, group: groupOf(l), rect: l.box })),
      ...map.restArcs.map((a) => ({
        key: `numeral:${a.from}`,
        group: `numeral:${a.from}>${a.to}`,
        rect: { l: a.numeral.x - S.numeralR, t: a.numeral.y - S.numeralR, r: a.numeral.x + S.numeralR, b: a.numeral.y + S.numeralR },
      })),
    ],
    marks: [...map.marks.values()].map((m) => ({ id: m.id, x: m.x, y: m.y, r: m.kind === 'project' ? m.r * 1.35 : m.r })),
    lines: map.restArcs.map((a) => a.pts),
  };
}

function litFrame(map: FilmMapLayout): Frame {
  const lit = map.lit!;
  return {
    labels: lit.labels,
    boxes: lit.labels.map((l) => ({ key: l.key, group: groupOf(l), rect: l.box })),
    marks: [...map.marks.values()].map((m) => {
      const dot = lit.ownDots.get(m.id);
      if (dot) return { id: m.id, x: dot.x, y: dot.y, r: m.r };
      return { id: m.id, x: m.x, y: m.y, r: m.id === lit.pick ? lit.agentR : m.kind === 'project' ? m.r * 1.35 : m.r };
    }),
    lines: lit.lines.map((l) => l.pts),
  };
}

const PAD = 4;

function geometryFaults(map: FilmMapLayout, frame: Frame, label: string): string[] {
  const faults: string[] = [];
  const S = map.sizes;
  const stage: Rect = { l: S.safe, t: S.safe, r: map.w - S.safe, b: map.h - S.safe };
  /* 1: no two label boxes overlap, halo-padded. */
  for (let i = 0; i < frame.boxes.length; i += 1) {
    for (let j = i + 1; j < frame.boxes.length; j += 1) {
      const a = frame.boxes[i]!;
      const b = frame.boxes[j]!;
      if (a.group === b.group) continue;
      if (overlaps(grow(a.rect, PAD), grow(b.rect, PAD))) faults.push(`${label} 1 ${a.key} overlaps ${b.key}`);
    }
  }
  /* 2: no label box covers a mark that is not its own. */
  for (const box of frame.boxes) {
    const own = frame.labels.find((l) => l.key === box.key)?.id;
    for (const m of frame.marks) {
      if (m.id === own) continue;
      if (circleIntoRect(m, m.r, grow(box.rect, PAD)) > 0) faults.push(`${label} 2 ${box.key} covers ${m.id}`);
    }
  }
  /* 3: no mark overlaps a domain name block. */
  for (const c of map.clusters) {
    for (const m of frame.marks) {
      if (m.id === c.id) continue;
      if (circleIntoRect(m, m.r, c.nameBlock) > 0) faults.push(`${label} 3 ${m.id} in ${c.id}'s name block`);
    }
  }
  /* 5 and 6: inside the safe margin, clear of the title and the caption. */
  const out = (r: Rect) => r.l < stage.l || r.r > stage.r || r.t < stage.t || r.b > stage.b;
  const blocked = (r: Rect) => overlaps(r, map.titleBox) || overlaps(r, map.captionBox);
  for (const box of frame.boxes) {
    if (out(box.rect)) faults.push(`${label} 5 ${box.key} outside the safe margin`);
    if (blocked(box.rect)) faults.push(`${label} 6 ${box.key} in the title or caption`);
  }
  for (const m of frame.marks) {
    const r = { l: m.x - m.r, t: m.y - m.r, r: m.x + m.r, b: m.y + m.r };
    if (out(r)) faults.push(`${label} 5 ${m.id} outside the safe margin`);
    if (blocked(r)) faults.push(`${label} 6 ${m.id} in the title or caption`);
  }
  for (const line of frame.lines) {
    for (const p of line) {
      if (!inside(p, stage)) faults.push(`${label} 5 a line leaves the safe margin at ${Math.round(p.x)},${Math.round(p.y)}`);
      if (inside(p, map.titleBox) || inside(p, map.captionBox)) faults.push(`${label} 6 a line enters the title or caption`);
    }
  }
  /* 11: canvas text is never small. */
  for (const l of frame.labels) if (l.size < (S.wide ? 15 : 13)) faults.push(`${label} 11 ${l.key} is ${l.size}px`);
  return [...new Set(faults)];
}

describe('the film map on the bundled vault', () => {
  const vault = vaultFor('en');
  const pick = pickFilmConcept(vault)!;

  it('picks the capability whose relations reach the most other domains', () => {
    expect(pick).toBe('capability:vault-graph-query');
  });

  for (const stage of STAGES) {
    for (const locale of Object.keys(stage.caption)) {
      const name = `${stage.w}x${stage.h} ${locale}`;
      describe(name, () => {
        const map = layoutAt(stage, locale);
        const rest = restFrame(map);
        const lit = litFrame(map);
        /* Every rule is asserted where the film meets it; elsewhere the data rules only. */
        const geo = stage.geometry ? it : () => undefined;

        geo('draws the rest frame with no name over a name, a mark or the caption', () => {
          expect(geometryFaults(map, rest, `rest ${name}`)).toEqual([]);
        });

        geo('draws the lit frame with no name over a name, a mark or the caption', () => {
          expect(geometryFaults(map, lit, `lit ${name}`)).toEqual([]);
        });

        it('rests on one arc per domain pair, each carrying its real count', () => {
          const flows = domainFlows(vaultFor(locale));
          expect(map.restArcs.length).toBeLessThanOrEqual(6);
          expect(map.restArcs.length).toBe(Math.min(6, flows.length));
          const crossing = vaultFor(locale).dependencies.filter(([a, b]) => {
            const da = vaultFor(locale).byId.get(a)!.domain;
            const db = vaultFor(locale).byId.get(b)!.domain;
            return da !== db;
          }).length;
          expect(map.restArcs.reduce((sum, a) => sum + a.count, 0)).toBe(crossing);
          for (const arc of map.restArcs) {
            expect(arc.count).toBe(flows.find((f) => f.from === arc.from && f.to === arc.to)!.count);
          }
        });

        geo('routes rest arcs clear of other clusters, every mark and every name, crossing at most once', () => {
          let crossed = 0;
          map.restArcs.forEach((arc, i) => {
            for (const p of resample(arc.pts, 4)) {
              for (const c of map.clusters) {
                if (c.id === arc.from || c.id === arc.to) continue;
                expect(Math.hypot(p.x - c.x, p.y - c.y), `${arc.from}>${arc.to} enters ${c.id}`).toBeGreaterThanOrEqual(c.footprint);
              }
              for (const m of rest.marks) expect(Math.hypot(p.x - m.x, p.y - m.y), `${arc.from}>${arc.to} touches ${m.id}`).toBeGreaterThan(m.r);
              for (const box of rest.boxes) {
                if (box.key.startsWith('numeral:')) continue;
                expect(inside(p, box.rect), `${arc.from}>${arc.to} crosses ${box.key}`).toBe(false);
              }
            }
            for (const other of map.restArcs.slice(i + 1)) crossed += crossings(arc.pts, other.pts);
          });
          expect(crossed).toBeLessThanOrEqual(1);
        });

        it('lights exactly the pick\'s relations, in the inks the reach row counts', () => {
          const litMap = map.lit!;
          expect(litMap.lines).toHaveLength(litMap.reach.needs.length + litMap.reach.neededBy.length + litMap.reach.relates.length);
          expect(litMap.lines.filter((l) => l.kind === 'needs' || l.kind === 'own')).toHaveLength(litMap.reach.needs.length);
          expect(litMap.lines.filter((l) => l.kind === 'neededBy')).toHaveLength(litMap.reach.neededBy.length);
        });

        geo('keeps lit lines off every name, the caption and the pick\'s own name', () => {
          const litMap = map.lit!;
          const pickBlock = litMap.labels.filter((l) => l.role === 'pick' || l.role === 'reach').map((l) => l.box);
          for (const line of litMap.lines) {
            for (const p of resample(line.pts, 2)) {
              for (const box of lit.boxes) expect(inside(p, box.rect), `${line.end} line crosses ${box.key}`).toBe(false);
              for (const c of map.clusters) expect(inside(p, c.nameBlock), `${line.end} line crosses ${c.id}'s name`).toBe(false);
              expect(inside(p, map.captionBox)).toBe(false);
              for (const b of pickBlock) expect(distanceToRect(p, b), `${line.end} line near the pick's name`).toBeGreaterThanOrEqual(12);
            }
          }
        });

        geo(map.sizes.wide ? 'names every lit end' : 'docks the two-row readout', () => {
          const litMap = map.lit!;
          if (map.sizes.wide) {
            const named = new Set(litMap.labels.filter((l) => l.role === 'end').map((l) => l.id));
            const ends = litMap.lines.filter((l) => l.kind !== 'own').map((l) => l.end);
            expect(ends.filter((e) => !named.has(e))).toEqual([]);
            expect(litMap.labels.some((l) => l.role === 'agent')).toBe(true);
          } else {
            expect(litMap.labels.map((l) => l.role).filter((r) => r === 'pick' || r === 'reach' || r === 'agent' || r === 'tool')).toEqual(['pick', 'reach', 'agent', 'tool']);
            expect(litMap.keys).toHaveLength(2);
          }
        });

        geo('uses the stage', () => {
          const xs = rest.marks.map((m) => [m.x - m.r, m.x + m.r]).flat();
          const ys = rest.marks.map((m) => [m.y - m.r, m.y + m.r]).flat();
          const width = Math.max(...xs) - Math.min(...xs);
          const height = Math.max(...ys) - Math.min(...ys);
          if (map.sizes.wide) {
            expect(height / map.h).toBeGreaterThanOrEqual(0.6);
            expect(width / map.w).toBeGreaterThanOrEqual(0.7);
          } else {
            expect(height / (map.captionBox.t - map.titleBox.b)).toBeGreaterThanOrEqual(0.6);
          }
        });

        it('sizes capabilities by their elements', () => {
          const caps = vaultFor(locale).capabilities.map((c) => ({ e: c.elements.length, r: map.marks.get(c.id)!.r }));
          expect(new Set(caps.map((c) => c.r.toFixed(3))).size).toBeGreaterThanOrEqual(5);
          for (const a of caps) for (const b of caps) if (a.e < b.e) expect(a.r).toBeLessThan(b.r);
        });
      });
    }
  }
});
