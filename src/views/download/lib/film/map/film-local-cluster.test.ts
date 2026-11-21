import { describe, expect, it } from 'vitest';

import { DEG, angleGap, circleIntoRect } from '../film-geometry';
import { GATE_HALF, dotOffsets, layoutLocalCluster, titleHalfAngle, type LocalClusterInput } from './film-local-cluster';
import { FILM_TEST_TOKENS, eightPixelsPerCharacter, fixtureVault } from './film-map-fixture';
import { filmSizes } from './film-map-sizes';

const wideSizes = filmSizes(1920, 960, FILM_TEST_TOKENS);
const phoneSizes = filmSizes(402, 874, FILM_TEST_TOKENS);
const capRadius = (elements: number) =>
  Math.min(FILM_TEST_TOKENS.capDiscMaxPx, FILM_TEST_TOKENS.capDiscMinPx + FILM_TEST_TOKENS.capDiscGainPx * Math.sqrt(elements)) * wideSizes.K;

const vault = fixtureVault({ a: [0, 0, 1, 2, 3, 5] });
const domain = vault.domains[0]!;

function inputOf(overrides: Partial<LocalClusterInput> = {}): LocalClusterInput {
  return {
    vault,
    pick: null,
    locale: 'en',
    measure: eightPixelsPerCharacter,
    sans: 'sans',
    copy: { units: (capabilities, elements) => `${capabilities} capabilities · ${elements} elements` },
    ...overrides,
  };
}

describe('title keep-out angle', () => {
  it('is widest for English on a wide stage, narrower for other languages, narrowest on a phone', () => {
    expect(titleHalfAngle(wideSizes, 'en')).toBeCloseTo(54 * DEG);
    expect(titleHalfAngle(wideSizes, 'ko')).toBeCloseTo(44 * DEG);
    expect(titleHalfAngle(phoneSizes, 'en')).toBeCloseTo(38 * DEG);
  });
});

describe('dot offsets', () => {
  it('fans the dots around the away direction, every second one a step farther out', () => {
    const offsets = dotOffsets(3, 0, 10, wideSizes);
    const from = 10 + wideSizes.elemGap;
    expect(offsets).toHaveLength(3);
    expect(Math.hypot(offsets[0]!.x, offsets[0]!.y)).toBeCloseTo(from);
    expect(Math.hypot(offsets[1]!.x, offsets[1]!.y)).toBeCloseTo(from + wideSizes.elemAlt);
    expect(offsets[1]!.y).toBeCloseTo(0);
    expect(offsets[0]!.y).toBeLessThan(0);
    expect(offsets[2]!.y).toBeGreaterThan(0);
  });
});

describe('one domain laid out around its own centre', () => {
  const cluster = layoutLocalCluster(inputOf(), wideSizes, domain, capRadius, null);

  it('places every capability of the domain once', () => {
    expect(cluster.items.map((item) => item.id).sort()).toEqual(vault.capabilities.map((c) => c.id).sort());
    expect(cluster.items.every((item) => !item.gate)).toBe(true);
  });

  it('puts the heaviest third on the outer ring, the middle third inside and the lightest between', () => {
    const ringOf = (id: string) => {
      const item = cluster.items.find((candidate) => candidate.id === id)!;
      return wideSizes.rings.findIndex((ring) => Math.abs(item.d / ring - 1) <= 0.06);
    };
    expect([ringOf('capability:a5'), ringOf('capability:a4')]).toEqual([2, 2]);
    expect([ringOf('capability:a3'), ringOf('capability:a2')]).toEqual([0, 0]);
    expect([ringOf('capability:a0'), ringOf('capability:a1')]).toEqual([1, 1]);
  });

  it('keeps every mark and element dot off the domain name block', () => {
    for (const item of cluster.items) {
      const centre = { x: Math.cos(item.a) * item.d, y: Math.sin(item.a) * item.d };
      expect(circleIntoRect(centre, item.r, cluster.nameBlock)).toBe(0);
      for (const offset of dotOffsets(item.elements.length, item.a, item.r, wideSizes)) {
        expect(circleIntoRect({ x: centre.x + offset.x, y: centre.y + offset.y }, wideSizes.elemR, cluster.nameBlock)).toBe(0);
      }
    }
  });

  it('reaches as far as its farthest mark with its dots, and no nearer than its disc', () => {
    expect(cluster.footprint).toBeGreaterThanOrEqual(wideSizes.domainR + 8);
    for (const item of cluster.items) expect(cluster.footprint).toBeGreaterThanOrEqual(item.d + item.r);
  });

  it('writes the domain name above its count row', () => {
    expect(cluster.rows.map((row) => row.key)).toEqual(['domain', 'units']);
    expect(cluster.rows[1]!.text).toBe('6 capabilities · 11 elements');
    expect(cluster.rows[0]!.dy).toBeLessThan(cluster.rows[1]!.dy);
  });
});

describe('the lit pick leaving its domain', () => {
  const pick = 'capability:a3';
  const gate = 0;
  const cluster = layoutLocalCluster(inputOf({ pick }), wideSizes, domain, capRadius, gate);

  it('takes the pick out of the ring and gives it a gate mark pushed outward', () => {
    expect(cluster.items.filter((item) => item.id === pick)).toHaveLength(1);
    const gateItem = cluster.items.find((item) => item.gate)!;
    expect(gateItem.id).toBe(pick);
    expect(gateItem.d).toBeGreaterThan(wideSizes.rings[2]);
  });

  it('keeps the other capabilities clear of the gate direction', () => {
    for (const item of cluster.items.filter((candidate) => !candidate.gate)) {
      expect(angleGap(item.a, gate)).toBeGreaterThan(GATE_HALF - 8 * DEG);
    }
  });

  it('does not count the gate mark in the footprint', () => {
    const gateItem = cluster.items.find((item) => item.gate)!;
    const ring = cluster.items.filter((item) => !item.gate);
    expect(cluster.footprint).toBeLessThan(gateItem.d + gateItem.r + 200);
    expect(Math.max(...ring.map((item) => item.d + item.r))).toBeLessThanOrEqual(cluster.footprint);
  });
});

describe('a phone count row', () => {
  it('breaks at its separator onto two rows when wider than 160px', () => {
    const cluster = layoutLocalCluster(inputOf(), phoneSizes, domain, capRadius, null);
    expect(cluster.rows.map((row) => row.key)).toEqual(['domain', 'units', 'units2']);
    expect(cluster.rows.map((row) => row.text).slice(1)).toEqual(['6 capabilities', '11 elements']);
  });

  it('keeps a short count row whole', () => {
    const cluster = layoutLocalCluster(inputOf({ copy: { units: () => '6 · 11' } }), phoneSizes, domain, capRadius, null);
    expect(cluster.rows.map((row) => row.key)).toEqual(['domain', 'units']);
  });
});
