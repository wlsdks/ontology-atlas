/** A cluster's radius in cloud units: room for its heart plus the square root of its members. */
const CLUSTER_RADIUS_BASE = 60;
const CLUSTER_RADIUS_GAIN = 16;
/** The empty band left between two neighbouring clusters, in cloud units. */
export const CLUSTER_GAP = 70;
/** More clusters than this stack into further rings, one above the other. */
const CLUSTER_RING_MAX = 8;
/** Perspective enlarges a near cluster more than the chord to its neighbour. */
const CLUSTER_NEAR_GROWTH = 1.25;

export function clusterRadius(members: number): number {
  return CLUSTER_RADIUS_BASE + CLUSTER_RADIUS_GAIN * Math.sqrt(Math.max(0, members));
}

/**
 * Cluster centres on horizontal rings round the dome's spin axis, so turning never brings two
 * clusters together: seen from `pitch`, a ring is an ellipse whose shortest projected chord between
 * neighbours is `2R·sin(Δ/2)·sin(pitch)`, and each ring's R is the least that keeps every pair
 * of neighbours `gap` apart. The first ring opens at the rest yaw with a cluster each side. O(k).
 */
export function clusterRingAnchors(
  radii: readonly number[],
  restYaw: number,
  pitch: number,
  gap = CLUSTER_GAP,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const rings: number[][] = [];
  for (let i = 0; i < radii.length; i += CLUSTER_RING_MAX) rings.push(radii.slice(i, i + CLUSTER_RING_MAX).map((_, k) => i + k));
  const sinPitch = Math.max(0.1, Math.sin(pitch));
  const cosPitch = Math.max(0.1, Math.cos(pitch));
  const ringRadius = rings.map((members) => {
    if (members.length < 2) return 0;
    const step = (Math.PI * 2) / members.length;
    let need = 0;
    for (let k = 0; k < members.length; k += 1) {
      const pair = (radii[members[k]] + radii[members[(k + 1) % members.length]]) * CLUSTER_NEAR_GROWTH + gap;
      need = Math.max(need, pair / (2 * Math.sin(step / 2) * sinPitch));
    }
    return need;
  });
  const widest = Math.max(...radii, 0);
  let height = 0;
  rings.forEach((members, ring) => {
    if (ring > 0) {
      // The next ring sits below the last one's ellipse and its own, with one cluster and a gap between.
      height -= (sinPitch * (ringRadius[ring - 1] + ringRadius[ring]) + 2 * widest * CLUSTER_NEAR_GROWTH + gap) / cosPitch;
    }
    const step = (Math.PI * 2) / members.length;
    members.forEach((index, k) => {
      const angle = Math.PI / 2 + step / 2 + k * step - restYaw;
      out[index] = { x: Math.cos(angle) * ringRadius[ring], y: height, z: Math.sin(angle) * ringRadius[ring] };
    });
  });
  const middle = height / 2;
  for (const anchor of out) anchor.y -= middle;
  return out;
}
