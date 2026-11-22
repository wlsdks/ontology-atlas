'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { CloseButton, Dialog, ServiceMark, resolveServiceMark } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import { connectorDestination, whatRuns } from '../model/connector-summary';
import { VariableFields } from './VariableFields';

/** A blocking `Dialog` because it holds credential fields and only it owns focus trap, Escape and restoration (`.claude/rules/design.md`). */
export function ConnectorDetailDialog({
  connector,
  on,
  canStoreSecrets,
  storedRefs,
  onClose,
  onUpsert,
  onRemove,
  testIdPrefix,
}: {
  connector: ConnectorRecord | null;
  on: boolean;
  canStoreSecrets: boolean;
  storedRefs: ReadonlySet<string> | null;
  onClose: () => void;
  onUpsert: (connector: ConnectorRecord) => void;
  /** The whole record, not an id: what must be forgotten is written on it. */
  onRemove: (connector: ConnectorRecord) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  return (
    <Dialog
      open={connector !== null}
      onClose={onClose}
      size="md"
      labelledBy={`${testIdPrefix}-detail-title`}
      testId={`${testIdPrefix}-item-dialog`}
      /* Focus lands on the container, not in a keychain password field nobody chose to fill. */
      initialFocus="container"
    >
      {connector ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <ServiceMark
                mark={resolveServiceMark(connector.name, whatRuns(connector))}
                className="shrink-0 text-[color:var(--color-text-tertiary)]"
              />
              <h2
                id={`${testIdPrefix}-detail-title`}
                className="min-w-0 truncate text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
              >
                {connector.name}
              </h2>
              <span
                data-testid={`${testIdPrefix}-detail-state`}
                data-enabled={on ? 'true' : 'false'}
                className={badgeClass({
                  shape: 'micro',
                  className: on
                    ? 'border border-[color:var(--color-indigo-a46)] text-[color:var(--color-text-secondary)]'
                    : 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]',
                })}
              >
                {on ? t('on') : t('off')}
              </span>
            </div>
            <CloseButton
              label={t('close')}
              data-testid={`${testIdPrefix}-item-close`}
              className="-mr-2 -mt-1 shrink-0"
              onClick={onClose}
            />
          </div>

          <div className="mt-4 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5">
            <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
              {t('whatRunsLabel')}
            </p>
            <code className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-primary)]">
              {whatRuns(connector)}
            </code>
            <p className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {connector.transport === 'http'
                ? t('rowTransfer', { destination: connectorDestination(connector) })
                : t('rowTransferStdio')}
            </p>
          </div>

          <VariableFields
            connector={connector}
            canStoreSecrets={canStoreSecrets}
            storedRefs={storedRefs}
            onUpsert={onUpsert}
            testIdPrefix={testIdPrefix}
          />

          <p
            data-testid={`${testIdPrefix}-runtime`}
            className="mt-4 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
            {t('runtimeNarrowing')}{' '}
            <Link
              href={DESTINATION_HREF.agents}
              data-testid={`${testIdPrefix}-runtime-agents`}
              className={controlClass({ shape: 'link', tone: 'accent', className: 'text-label' })}
            >
              {t('runtimeAgentsLink')}
            </Link>
          </p>

          <div className="mt-4 flex items-center justify-start gap-2 border-t border-[color:var(--color-border-soft)] pt-3">
            <button
              type="button"
              data-testid={`${testIdPrefix}-item-remove`}
              onClick={() => onRemove(connector)}
              /* No hand-written hover: `hoverInk` has no danger option and inventing one is reserved to the design-systems seat (`.claude/rules/design.md`). */
              className={controlClass({
                shape: 'link',
                tone: 'secondary',
                hoverInk: 'strong',
                className: 'text-label',
              })}
            >
              {t('remove')}
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
