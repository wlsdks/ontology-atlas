export interface RelationLabelGeometryInput {
  badgeWidth: number;
  centerX: number;
  containerWidth: number;
  hitTargetPadX: number;
  minCompactWidth: number;
  rightBoundary?: number;
  viewportInset: number;
}

export interface RelationLabelGeometry {
  centeredAvailableWidth: number;
  compact: boolean;
  desiredWidth: number;
  hitTargetWidth: number;
  left: number;
  right: number;
  viewportClampContract: 'centered-within-viewport' | 'compacted-to-viewport-edge';
  viewportClampSide: 'left' | 'right' | 'none';
  viewportInset: number;
}

export function resolveRelationLabelGeometry({
  badgeWidth,
  centerX,
  containerWidth,
  hitTargetPadX,
  minCompactWidth,
  rightBoundary,
  viewportInset,
}: RelationLabelGeometryInput): RelationLabelGeometry {
  const desiredWidth = badgeWidth + hitTargetPadX * 2;
  const rightLimit =
    typeof rightBoundary === 'number' && Number.isFinite(rightBoundary)
      ? Math.min(containerWidth - viewportInset, Math.max(viewportInset, rightBoundary))
      : containerWidth - viewportInset;
  const availableWidth = Math.max(0, rightLimit - viewportInset);
  const centeredWidth = Math.max(
    0,
    Math.min(
      availableWidth,
      Math.min(centerX - viewportInset, rightLimit - centerX) * 2,
    ),
  );
  const centeredAvailableWidth = Math.max(
    0,
    centeredWidth > 0 ? centeredWidth : availableWidth,
  );
  const compactWidthFloor =
    centeredAvailableWidth >= minCompactWidth ? minCompactWidth : centeredAvailableWidth;
  const hitTargetWidth = Math.max(
    compactWidthFloor,
    Math.min(desiredWidth, centeredAvailableWidth),
  );
  const centeredLeft = centerX - hitTargetWidth / 2;
  const left = Math.min(
    Math.max(centeredLeft, viewportInset),
    Math.max(viewportInset, rightLimit - hitTargetWidth),
  );
  const right = left + hitTargetWidth;
  const viewportClampSide =
    Math.abs(left - viewportInset) <= 0.5
      ? 'left'
      : Math.abs(right - rightLimit) <= 0.5
        ? 'right'
        : 'none';

  return {
    centeredAvailableWidth,
    compact: hitTargetWidth + 0.5 < desiredWidth,
    desiredWidth,
    hitTargetWidth,
    left,
    right,
    viewportClampContract:
      viewportClampSide === 'none' ? 'centered-within-viewport' : 'compacted-to-viewport-edge',
    viewportClampSide,
    viewportInset,
  };
}
