'use client';

import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Checkbox, IconButton, ServiceMark, resolveServiceMark } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import {
  connectorProblems,
  type ConnectorProblem,
  type ConnectorRecord,
} from '@/shared/lib/connectors/connector-record';

import { whatRuns } from '../model/connector-summary';
import type { VaultConnectorsState } from '../model/use-vault-connectors';
import { WaitingHere } from './WaitingHere';

type ProblemKey = `problem.${ConnectorProblem}`;

/** Problem and collision lines stay in the row because they explain a disabled switch. */
export function AttachedList({
  connectors,
  /* Destructure it: left out, `status` resolves to the global `window.status` and the static export throws on the server. */
  status,
  registeredNames,
  storedRefs,
  isOnHere,
  waitingHere,
  changedSinceAllowed,
  onToggle,
  onAllow,
  onOpenDetail,
  testIdPrefix,
  countStatedAbove,
}: {
  connectors: ConnectorRecord[];
  status: VaultConnectorsState['status'];
  registeredNames: Set<string>;
  /** `null` where no keychain could be read: "not asked", not "none". */
  storedRefs: ReadonlySet<string> | null;
  isOnHere: (connector: ConnectorRecord) => boolean;
  waitingHere: ReadonlySet<string>;
  changedSinceAllowed: ReadonlySet<string>;
  onToggle: (id: string, enabled: boolean) => void;
  onAllow: (id: string) => void;
  onOpenDetail: (id: string) => void;
  testIdPrefix: string;
  countStatedAbove?: boolean;
}) {
  const t = useTranslations('connectors');
  /* "Nothing attached yet" cannot be claimed before the first read. */
  if (status === 'loading') {
    return (
      <p
        role="status"
        data-testid={`${testIdPrefix}-loading`}
        className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('loading')}
      </p>
    );
  }
  if (connectors.length === 0) return null;
  const enabled = connectors.filter(isOnHere).length;
  return (
    <>
      {countStatedAbove ? null : (
        <p
          data-testid={`${testIdPrefix}-on-of-total`}
          className="mt-3 text-label leading-label text-[color:var(--color-text-quaternary)]"
        >
          {t('onOfTotal', { on: enabled, total: connectors.length })}
        </p>
      )}
    <ul
      data-testid={`${testIdPrefix}-list`}
      aria-label={t('title')}
      className="mt-2 flex flex-col gap-2"
    >
      {connectors.map((connector) => {
        const problems = connectorProblems(connector, connectors, storedRefs ?? undefined);
        const collides = registeredNames.has(connector.name.trim());
        const runs = whatRuns(connector);
        const on = isOnHere(connector);
        const waiting = waitingHere.has(connector.id);
        return (
          <li
            key={connector.id}
            data-testid={`${testIdPrefix}-item`}
            data-connector-name={connector.name}
            data-connector-enabled={on ? 'true' : 'false'}
            data-connector-waiting={waiting ? 'true' : undefined}
            className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              {/* The service mark matches the name and what runs: a renamed row still runs the same service. */}
              <ServiceMark
                mark={resolveServiceMark(connector.name, runs)}
                className="text-[color:var(--color-text-tertiary)]"
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <p className="shrink-0 truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {connector.name}
                </p>
                {/* What will actually run, before the switch; the only monospace on the row. */}
                <code
                  data-testid={`${testIdPrefix}-item-runs`}
                  className="min-w-0 flex-1 break-all font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
                >
                  {runs}
                </code>
              </div>
              {/* `gap-3`: the more-actions button's 44px `touch-hit-expand` area overhangs 8px each side, and a narrower gap puts the switch label under it. */}
              <div className="flex shrink-0 items-center gap-3">
                <Checkbox
                  data-testid={`${testIdPrefix}-item-toggle`}
                  label={on ? t('on') : t('off')}
                  checked={on}
                  disabled={problems.length > 0}
                  onChange={(event) => onToggle(connector.id, event.target.checked)}
                  /* `atlas-touch-floor-wide`: "On"/"Off" is too short for the 44px floor (`app/globals.css`, coarse-pointer block). */
                  className="atlas-touch-floor-wide justify-center text-label text-[color:var(--color-text-secondary)]"
                />
                <IconButton
                  data-testid={`${testIdPrefix}-item-menu`}
                  label={t('detailOpen', { name: connector.name })}
                  hoverSurface="lift"
                  hoverBorder="strong"
                  onClick={() => onOpenDetail(connector.id)}
                >
                  <MoreHorizontal size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </div>
            </div>

            {problems.length > 0 ? (
              <p
                role="status"
                data-testid={`${testIdPrefix}-item-problem`}
                className="mt-2 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
              >
                {problems.map((problem) => t(`problem.${problem}` as ProblemKey)).join(' ')}
              </p>
            ) : null}

            {collides ? (
              <p
                role="status"
                data-testid={`${testIdPrefix}-item-collision`}
                className="mt-2 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
              >
                {t('collision', { name: connector.name })}
              </p>
            ) : null}

            {waiting ? (
              <WaitingHere
                connector={connector}
                changed={changedSinceAllowed.has(connector.id)}
                onAllow={() => onAllow(connector.id)}
                testIdPrefix={testIdPrefix}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
    </>
  );
}
