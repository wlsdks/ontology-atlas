import type { ComponentProps, Dispatch, SetStateAction } from 'react';

import { Button } from '@/shared/ui/button';
import { Surface } from '@/shared/ui';

import { AcpPermissionCard } from '../AcpPermissionCard';
import type { AcpChatPanelProps, ChatT, SessionState } from './types';
import type { usePermissionReview } from './use-permission-review';

type CardProps = ComponentProps<typeof AcpPermissionCard>;
type PermissionReview = ReturnType<typeof usePermissionReview>;

interface PermissionSlotProps {
  t: ChatT;
  vaultRoot: string | null;
  pending: SessionState['pending'];
  review: Pick<
    PermissionReview,
    'pendingHeld' | 'pendingForCard' | 'pendingHeldChangeSet' | 'permissionDeferred' | 'answerHold' | 'livePendingRef' | 'requestCorrection'
  >;
  setDeferredPermission: Dispatch<SetStateAction<SessionState['pending']>>;
  taskReview: CardProps['taskReview'];
  judgeWrite: AcpChatPanelProps['judgeWrite'];
  previewRequestKey: string | null;
  activePreviewIndex: number;
  onActiveItemChange: (requestKey: string, itemIndex: number) => void;
}

export function PermissionSlot({
  t,
  vaultRoot,
  pending,
  review,
  setDeferredPermission,
  taskReview,
  judgeWrite,
  previewRequestKey,
  activePreviewIndex,
  onActiveItemChange,
}: PermissionSlotProps) {
  const { pendingHeld, pendingForCard, pendingHeldChangeSet, permissionDeferred, answerHold, livePendingRef, requestCorrection } = review;
  return (
    <Surface
      open={Boolean(pending) || answerHold > 0}
      origin="bottom center"
      motion="overlay"
      className="max-h-[70%] shrink-0 [@media(max-height:800px)]:max-h-[50%]"
    >
      {permissionDeferred ? (
        <div className="ai-row-swap flex items-center gap-3 rounded-panel border border-[color:var(--color-divider)] p-[var(--card-pad)]" data-testid="acp-permission-deferred">
          <p className="min-w-0 flex-1 text-label leading-label text-[color:var(--color-text-secondary)]">{t('permission.deferredNotice')}</p>
          <Button variant="outline" size="sm" onClick={() => setDeferredPermission(null)}>
            {t('permission.resumeReview')}
          </Button>
        </div>
      ) : pendingHeld ? (
        <AcpPermissionCard
          key={`${pendingHeld.request.toolCallId ?? ''}:${String(pendingHeld.request.requestId)}`}
          vaultPath={vaultRoot}
          pending={pendingForCard ?? pendingHeld}
          taskReview={taskReview}
          onRequestCorrection={pendingHeld.request.reviewKind === 'ontology-write' ? requestCorrection : undefined}
          onDefer={pendingHeld.request.reviewKind === 'ontology-write' ? () => {
            if (livePendingRef.current === pendingHeld) setDeferredPermission(pendingHeld);
          } : undefined}
          writeVerdict={judgeWrite ? judgeWrite(pendingHeld.request) : null}
          changeSet={pendingHeldChangeSet}
          activeItemIndex={
            (pendingHeld.request.toolCallId ?? pendingHeld.request.toolName) === previewRequestKey
              ? activePreviewIndex
              : 0
          }
          onActiveItemChange={(itemIndex) => {
            const requestKey =
              pendingHeld.request.toolCallId ?? pendingHeld.request.toolName ?? 'ontology-write';
            onActiveItemChange(requestKey, itemIndex);
          }}
        />
      ) : null}
    </Surface>
  );
}
