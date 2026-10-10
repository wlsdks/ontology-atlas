import { useEffect, useMemo, useState } from 'react';

import { buildOntologyChangeSet, type OntologyChangeSet } from '@/entities/knowledge-graph';

import type { AcpOntologyRelationPreview, SessionState } from './types';

function relationPreviewForChangeSet(
  changeSet: OntologyChangeSet | null,
  phase: AcpOntologyRelationPreview['phase'],
  itemIndex = 0,
): AcpOntologyRelationPreview | null {
  const item = changeSet?.items[itemIndex];
  const relation = item?.relation;
  // A batch previews only the row selected in the card; drawing all would blur which line is judged.
  if (
    !changeSet ||
    changeSet.operation !== 'relate' ||
    !item?.exact ||
    !relation
  ) {
    return null;
  }
  return {
    sourceSlug: relation.from,
    targetSlug: relation.to,
    relationType: relation.type,
    phase,
  };
}

export function useRelationPreview({
  pending,
  approvedOntologyWrite,
  onOntologyRelationPreviewChange,
}: {
  pending: SessionState['pending'];
  approvedOntologyWrite: SessionState['approvedOntologyWrite'];
  onOntologyRelationPreviewChange?: (preview: AcpOntologyRelationPreview | null) => void;
}) {
  const pendingChangeSet = useMemo(
    () =>
      pending?.request.reviewKind === 'ontology-write' && pending.request.toolName
        ? buildOntologyChangeSet(pending.request.toolName, pending.request.rawInput)
        : null,
    [pending],
  );
  const approvedChangeSet = useMemo(
    () =>
      approvedOntologyWrite?.toolName
        ? buildOntologyChangeSet(approvedOntologyWrite.toolName, approvedOntologyWrite.rawInput)
        : null,
    [approvedOntologyWrite],
  );
  const [previewSelection, setPreviewSelection] = useState<{
    requestKey: string;
    itemIndex: number;
  } | null>(null);
  const previewRequest = approvedOntologyWrite ?? pending?.request ?? null;
  const previewRequestKey = previewRequest?.toolCallId ?? previewRequest?.toolName ?? null;
  const previewChangeSet = approvedOntologyWrite ? approvedChangeSet : pendingChangeSet;
  const requestedPreviewIndex =
    previewRequestKey && previewSelection?.requestKey === previewRequestKey
      ? previewSelection.itemIndex
      : 0;
  const activePreviewIndex = Math.min(
    Math.max(requestedPreviewIndex, 0),
    Math.max(0, (previewChangeSet?.items.length ?? 1) - 1),
  );
  const relationPreview = useMemo(
    () =>
      approvedOntologyWrite
        ? relationPreviewForChangeSet(approvedChangeSet, 'committing', activePreviewIndex)
        : relationPreviewForChangeSet(pendingChangeSet, 'draft', activePreviewIndex),
    [activePreviewIndex, approvedChangeSet, approvedOntologyWrite, pendingChangeSet],
  );
  const previewSourceSlug = relationPreview?.sourceSlug ?? null;
  const previewTargetSlug = relationPreview?.targetSlug ?? null;
  const previewRelationType = relationPreview?.relationType ?? null;
  const previewPhase = relationPreview?.phase ?? null;
  useEffect(() => {
    onOntologyRelationPreviewChange?.(
      previewSourceSlug && previewTargetSlug && previewRelationType && previewPhase
        ? {
            sourceSlug: previewSourceSlug,
            targetSlug: previewTargetSlug,
            relationType: previewRelationType,
            phase: previewPhase,
          }
        : null,
    );
  }, [
    onOntologyRelationPreviewChange,
    previewPhase,
    previewRelationType,
    previewSourceSlug,
    previewTargetSlug,
  ]);
  useEffect(
    () => () => onOntologyRelationPreviewChange?.(null),
    [onOntologyRelationPreviewChange],
  );
  return { previewRequestKey, activePreviewIndex, setPreviewSelection };
}
