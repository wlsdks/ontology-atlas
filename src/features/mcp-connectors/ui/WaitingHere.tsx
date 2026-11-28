import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import { connectorPasses } from '../model/connector-summary';

/** The row shows what runs, whole; this adds what it would pass, the rest of what the press allows. */
export function WaitingHere({
  connector,
  changed,
  onAllow,
  testIdPrefix,
}: {
  connector: ConnectorRecord;
  changed: boolean;
  onAllow: () => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const passes = connectorPasses(connector, (name) => t('waitingFromKeychain', { name }));
  return (
    <div
      data-testid={`${testIdPrefix}-item-waiting`}
      data-waiting-changed={changed ? 'true' : 'false'}
      className="mt-2 border-t border-[color:var(--color-border-soft)] pt-2"
    >
      <p role="status" className="text-label leading-prose text-[color:var(--color-status-warning)]">
        {changed ? t('waitingChanged') : t('waitingHere')}
      </p>
      {passes.length > 0 ? (
        <p
          data-testid={`${testIdPrefix}-item-waiting-passes`}
          className="mt-1 break-all text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {t('waitingPasses')}{' '}
          <code className="font-mono text-[color:var(--color-text-secondary)]">{passes.join(', ')}</code>
        </p>
      ) : null}
      <Chip
        data-testid={`${testIdPrefix}-item-allow`}
        hoverSurface="lift"
        className="mt-2"
        onClick={onAllow}
      >
        <ShieldCheck size={ICON_SIZE.sm} aria-hidden />
        {t('allowHere')}
      </Chip>
    </div>
  );
}
