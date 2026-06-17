export interface RelationLabelGeometryInput {
  badgeWidth: number;
  centerX: number;
  containerWidth: number;
  hitTargetPadX: number;
  minCompactWidth: number;
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
  viewportInset,
}: RelationLabelGeometryInput): RelationLabelGeometry {
  const desiredWidth = badgeWidth + hitTargetPadX * 2;
  const centeredAvailableWidth = Math.max(
    0,
    Math.min(
      containerWidth - viewportInset * 2,
      Math.min(centerX - viewportInset, containerWidth - centerX - viewportInset) * 2,
    ),
  );
  const compactWidthFloor =
    centeredAvailableWidth >= minCompactWidth ? minCompactWidth : centeredAvailableWidth;
  const hitTargetWidth = Math.max(
    compactWidthFloor,
    Math.min(desiredWidth, centeredAvailableWidth),
  );
  const left = centerX - hitTargetWidth / 2;
  const right = left + hitTargetWidth;
  const viewportClampSide =
    Math.abs(left - viewportInset) <= 0.5
      ? 'left'
      : Math.abs(right - (containerWidth - viewportInset)) <= 0.5
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
