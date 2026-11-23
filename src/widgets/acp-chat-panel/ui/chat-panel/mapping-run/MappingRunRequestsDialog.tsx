'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';

import { CloseButton, Dialog, DialogBody, RowButton } from '@/shared/ui';

/** One request of a run in its list: what it says, and the conversation it opens. */
export interface RunRequestItem {
  key: string;
  label: string;
  /** When it ran, or what it did; null when nothing more is known. */
  detail: string | null;
  sessionId: string;
}

/** Every request of one run, centred over the screen; each opens its own conversation. */
export function MappingRunRequestsDialog({ items, canOpen, onOpen, onClose }: {
  /** The run's requests oldest first; null while the list is closed. */
  items: readonly RunRequestItem[] | null;
  canOpen: boolean;
  onOpen: (sessionId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('acpChat.mapRun');
  const titleId = useId();
  return (
    <Dialog open={items !== null} onClose={onClose} labelledBy={titleId} size="md" testId="mapping-run-requests-dialog">
      <div className="flex items-start gap-3">
        <h2 id={titleId} className="min-w-0 flex-1 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {t('listTitle')}
        </h2>
        <CloseButton label={t('close')} onClick={onClose} className="-mt-1 -mr-1 flex-none" />
      </div>
      <DialogBody className="mt-4">
        <ol className="grid gap-0.5">
          {(items ?? []).map((item) => (
            <li key={item.key}>
              <RowButton
                data-testid="mapping-run-requests-item"
                disabled={!canOpen}
                onClick={() => onOpen(item.sessionId)}
                hoverSurface="lift"
                hoverInk="strong"
                className="w-full"
              >
                <span className="grid min-w-0 flex-1 gap-0.5 text-left">
                  <span className="truncate text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{item.label}</span>
                  {item.detail ? (
                    <span className="truncate text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{item.detail}</span>
                  ) : null}
                </span>
              </RowButton>
            </li>
          ))}
        </ol>
      </DialogBody>
    </Dialog>
  );
}
