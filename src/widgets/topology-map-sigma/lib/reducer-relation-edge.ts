import type { SigmaEdgeAttrs } from './graph-build';

const RELATION_EDGE_TONE = {
  strong: {
    color: 'rgba(139, 151, 255, 0.28)',
    size: 1.05,
    zIndex: 2,
  },
  supported: {
    color: 'rgba(72, 184, 203, 0.18)',
    size: 0.75,
    zIndex: 1,
  },
  weak: {
    color: 'rgba(217, 161, 65, 0.16)',
    size: 0.58,
    zIndex: 0,
  },
  review: {
    color: 'rgba(226, 105, 105, 0.16)',
    size: 0.7,
    zIndex: 1,
  },
} as const satisfies Record<
  NonNullable<SigmaEdgeAttrs['relationQuality']>,
  { color: string; size: number; zIndex: number }
>;

export function applyRelationEdgeSemantics(
  attrs: SigmaEdgeAttrs,
  options: { cameraRatio: number },
): SigmaEdgeAttrs {
  if (attrs.kind === 'contains') return attrs;
  const quality = attrs.relationQuality ?? 'supported';
  const tone = RELATION_EDGE_TONE[quality];
  const evidenceBoost = (attrs.evidenceCount ?? 0) > 0 || attrs.authored ? 0.12 : 0;
  const reviewPenalty = quality === 'review' ? -0.12 : 0;
  const zoomFade =
    options.cameraRatio > 1
      ? Math.max(0.42, 1 - (options.cameraRatio - 1) * 0.32)
      : 1;

  return {
    ...attrs,
    color: tone.color,
    size: Math.max(0.35, (tone.size + evidenceBoost + reviewPenalty) * zoomFade),
    zIndex: tone.zIndex,
  };
}
