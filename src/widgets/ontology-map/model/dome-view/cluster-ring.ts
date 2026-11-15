/** A cluster's radius in cloud units: room for its heart plus the square root of its members. */
const CLUSTER_RADIUS_BASE = 12;
const CLUSTER_RADIUS_GAIN = 15;
/** The empty band left between two neighbouring clusters, in cloud units. */
export const CLUSTER_GAP = 20;
/** A title's height as a share of the cloud's rest-pose height: its 65 px of the 708 a 1440 by 900 window leaves free. */
export const CLUSTER_TITLE_SHARE = 0.092;
/** The band and the height it is a share of settle within 1% in this many passes. */
const TITLE_BAND_PASSES = 3;
/** More clusters than this stack into further rings, one above the other. */
const CLUSTER_RING_MAX = 12;
/** Perspective enlarges a near cluster more than the chord to its neighbour. */
const CLUSTER_NEAR_GROWTH = 1.1;

export function clusterRadius(members: number): number {
  return CLUSTER_RADIUS_BASE + CLUSTER_RADIUS_GAIN * Math.sqrt(Math.max(0, members));
}

/**
 * The camera-frame angle of a ring's k-th of n clusters: an even ring opens with a cluster at
 * each side, an odd one with a cluster nearest the reader, so the rest pose stands symmetric.
 */
function restAngle(k: number, n: number): number {
  return (n % 2 === 0 ? Math.PI : -Math.PI / 2) + (k * Math.PI * 2) / n;
}

/** Cluster indices by ring, each ring within one cluster of the others' size. O(n). */
function evenRings(count: number): number[][] {
  const ringCount = Math.ceil(count / CLUSTER_RING_MAX);
  const rings: number[][] = Array.from({ length: ringCount }, () => []);
  for (let i = 0; i < count; i += 1) rings[Math.floor((i * ringCount) / count)].push(i);
  return rings;
}

/**
 * Rings placed for the rest pose with `titleBand` more between two clusters that stand one above
 * the other than between two side by side, and how tall the rest pose draws them. O(k²) per ring, k ≤ 12.
 */
function placeRings(
  radii: readonly number[],
  rings: readonly number[][],
  restYaw: number,
  pitch: number,
  centreRadius: number,
  gap: number,
  titleBand: number,
): { anchors: { x: number; y: number; z: number }[]; restHeight: number } {
  const sinPitch = Math.max(0.1, Math.sin(pitch));
  const cosPitch = Math.max(0.1, Math.cos(pitch));
  const leastRadiusClearing = (dx: number, dy: number, sideBySide: number) => 1 / Math.hypot(dx / sideBySide, dy / (sideBySide + titleBand));
  const ringRadius = rings.map((members, ring) => {
    let need = 0;
    for (let a = 0; a < members.length; a += 1) {
      const pa = restAngle(a, members.length);
      if (ring === 0 && centreRadius > 0) {
        const fromCentre = Math.hypot(Math.cos(pa), Math.sin(pa) * sinPitch);
        need = Math.max(need, ((radii[members[a]] + centreRadius) * CLUSTER_NEAR_GROWTH + gap) / fromCentre);
      }
      for (let b = a + 1; b < members.length; b += 1) {
        const pb = restAngle(b, members.length);
        const pair = (radii[members[a]] + radii[members[b]]) * CLUSTER_NEAR_GROWTH + gap;
        need = Math.max(need, leastRadiusClearing(Math.cos(pa) - Math.cos(pb), (Math.sin(pa) - Math.sin(pb)) * sinPitch, pair));
      }
    }
    return need;
  });
  const widest = Math.max(...radii, 0);
  const anchors: { x: number; y: number; z: number }[] = [];
  let height = 0;
  let top = -Infinity;
  let bottom = Infinity;
  rings.forEach((members, ring) => {
    if (ring > 0) {
      height -= (sinPitch * (ringRadius[ring - 1] + ringRadius[ring]) + 2 * widest * CLUSTER_NEAR_GROWTH + gap + titleBand) / cosPitch;
    }
    members.forEach((index, k) => {
      const rest = restAngle(k, members.length);
      const drawnY = height * cosPitch + Math.sin(rest) * ringRadius[ring] * sinPitch;
      top = Math.max(top, drawnY + radii[index]);
      bottom = Math.min(bottom, drawnY - radii[index]);
      anchors[index] = { x: Math.cos(rest - restYaw) * ringRadius[ring], y: height, z: Math.sin(rest - restYaw) * ringRadius[ring] };
    });
  });
  const middle = height / 2;
  for (const anchor of anchors) anchor.y -= middle;
  return { anchors, restHeight: top - bottom };
}

/**
 * Cluster centres on horizontal rings round the dome's spin axis, `gap` apart where the rest pose
 * draws them, with room for a title above each. The first ring also clears a group of
 * `centreRadius` at its centre. Turning away from the rest pose may bring two clusters across each other.
 */
export function clusterRingAnchors(
  radii: readonly number[],
  restYaw: number,
  pitch: number,
  centreRadius = 0,
  gap = CLUSTER_GAP,
): { x: number; y: number; z: number }[] {
  if (radii.length === 0) return [];
  const rings = evenRings(radii.length);
  let placed = placeRings(radii, rings, restYaw, pitch, centreRadius, gap, 0);
  for (let pass = 0; pass < TITLE_BAND_PASSES; pass += 1) {
    placed = placeRings(radii, rings, restYaw, pitch, centreRadius, gap, CLUSTER_TITLE_SHARE * placed.restHeight);
  }
  return placed.anchors;
}
