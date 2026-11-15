/** A cluster's radius in cloud units: room for its heart plus the square root of its members. */
const CLUSTER_RADIUS_BASE = 12;
const CLUSTER_RADIUS_GAIN = 15;
/** The empty band left between two neighbouring clusters, in cloud units. */
export const CLUSTER_GAP = 20;
/** The room a cluster's title takes above it at the rest pose, in cloud units. */
export const CLUSTER_TITLE_BAND = 45;
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

/**
 * Cluster centres on horizontal rings round the dome's spin axis, placed for the rest pose:
 * seen from `pitch`, a ring is an ellipse, and its R is the least that keeps every pair of
 * clusters on it `gap` apart where the rest pose draws them, with a title's band more between
 * two that stand one above the other. Turning away from the rest pose may bring two clusters
 * across each other, as any 3D turn does. The first ring also clears a group of `centreRadius`
 * at its centre. Rings share the clusters evenly. O(k²) per ring, k ≤ 12.
 */
export function clusterRingAnchors(
  radii: readonly number[],
  restYaw: number,
  pitch: number,
  centreRadius = 0,
  gap = CLUSTER_GAP,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const rings: number[][] = [];
  const ringCount = Math.ceil(radii.length / CLUSTER_RING_MAX);
  const perRing = Math.ceil(radii.length / Math.max(1, ringCount));
  for (let i = 0; i < radii.length; i += perRing) rings.push(radii.slice(i, i + perRing).map((_, k) => i + k));
  // The least R that draws two shapes apart: `across` clear side by side, a title's band more one above the other.
  const ringNeed = (dx: number, dy: number, across: number) => 1 / Math.hypot(dx / across, dy / (across + CLUSTER_TITLE_BAND));
  const sinPitch = Math.max(0.1, Math.sin(pitch));
  const cosPitch = Math.max(0.1, Math.cos(pitch));
  const ringRadius = rings.map((members, ring) => {
    let need = 0;
    for (let a = 0; a < members.length; a += 1) {
      if (ring === 0 && centreRadius > 0) {
        const pa = restAngle(a, members.length);
        need = Math.max(need, ringNeed(Math.cos(pa), Math.sin(pa) * sinPitch, (radii[members[a]] + centreRadius) * CLUSTER_NEAR_GROWTH + gap));
      }
      for (let b = a + 1; b < members.length; b += 1) {
        const pa = restAngle(a, members.length);
        const pb = restAngle(b, members.length);
        const pair = (radii[members[a]] + radii[members[b]]) * CLUSTER_NEAR_GROWTH + gap;
        need = Math.max(need, ringNeed(Math.cos(pa) - Math.cos(pb), (Math.sin(pa) - Math.sin(pb)) * sinPitch, pair));
      }
    }
    return need;
  });
  const widest = Math.max(...radii, 0);
  let height = 0;
  rings.forEach((members, ring) => {
    if (ring > 0) {
      // The next ring sits below the last one's ellipse and its own, with one cluster and a gap between.
      height -= (sinPitch * (ringRadius[ring - 1] + ringRadius[ring]) + 2 * widest * CLUSTER_NEAR_GROWTH + gap + CLUSTER_TITLE_BAND) / cosPitch;
    }
    members.forEach((index, k) => {
      const angle = restAngle(k, members.length) - restYaw;
      out[index] = { x: Math.cos(angle) * ringRadius[ring], y: height, z: Math.sin(angle) * ringRadius[ring] };
    });
  });
  const middle = height / 2;
  for (const anchor of out) anchor.y -= middle;
  return out;
}
