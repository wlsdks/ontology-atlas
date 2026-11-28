import { useTranslations } from 'use-intl';

import { Button, Dialog } from '@/shared/ui';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import { ownedSecretNames } from '../model/connector-secrets';

/** Confirms removal because forgetting tokens (`connector_secret_delete`) cannot be undone, unlike the retypeable row. `role="alertdialog"` so the body is read on open; `initialFocus="container"` keeps the caret off the destructive button. */
export function RemoveConfirmDialog({
  connector,
  onCancel,
  onConfirm,
  testIdPrefix,
}: {
  connector: ConnectorRecord | null;
  onCancel: () => void;
  onConfirm: (connector: ConnectorRecord) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const keys = connector ? ownedSecretNames(connector) : [];
  return (
    <Dialog
      open={connector !== null}
      onClose={onCancel}
      role="alertdialog"
      labelledBy={`${testIdPrefix}-remove-title`}
      testId={`${testIdPrefix}-item-remove-confirm`}
      initialFocus="container"
    >
      {connector ? (
        <>
          <h2
            id={`${testIdPrefix}-remove-title`}
            className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
          >
            {t('removeConfirmTitle', { name: connector.name })}
          </h2>
          <p className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-secondary)]">
            {/* With keys, the irreversible half is named with them; without, "and its tokens" would invent a loss. */}
            {keys.length > 0
              ? t('removeConfirmBodyKeys', { keys: keys.join(', ') })
              : t('removeConfirmBody')}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" data-testid={`${testIdPrefix}-remove-cancel`} onClick={onCancel}>
              {t('removeCancel')}
            </Button>
            <Button
              variant="primary"
              data-testid={`${testIdPrefix}-remove-confirm`}
              onClick={() => onConfirm(connector)}
            >
              {t('remove')}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
