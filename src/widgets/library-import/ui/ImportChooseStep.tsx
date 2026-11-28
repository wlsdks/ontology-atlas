import type { RefObject } from 'react';
import { useTranslations } from 'use-intl';
import { Check, ExternalLink } from 'lucide-react';

import { Button, Chip } from '@/shared/ui';
import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { Input } from '@/shared/ui/fields/input';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { ImportDestination } from '@/shared/lib/library-import/destination';

import { DEFAULT_IMPORT_LIMIT, serviceFolder, type ImportService } from '../model/import-flow';

export function ImportChooseStep({
  testIdPrefix,
  service,
  destination,
  what,
  onWhatChange,
  requestField,
  canRunAgent,
  onBack,
  onBring,
}: {
  testIdPrefix: string;
  service: ImportService;
  destination: ImportDestination;
  what: string;
  onWhatChange: (what: string) => void;
  requestField: RefObject<HTMLInputElement | null>;
  canRunAgent: boolean;
  onBack: () => void;
  onBring: () => void;
}) {
  const t = useTranslations('libraryImport');
  return (
    <>
      <p
        data-testid={`${testIdPrefix}-step`}
        data-step="choose"
        className="mt-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t('stepOf', { step: 2, total: 3 })}
      </p>
      <p
        data-testid={`${testIdPrefix}-connected`}
        className="mt-1 flex items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]"
      >
        <Check
          size={ICON_SIZE.sm}
          aria-hidden
          className="text-[color:var(--color-status-success)]"
        />
        {t('connected', {
          service: t(`service.${service.id}.title` as 'service.notion.title'),
        })}
      </p>
      <Input
        ref={requestField}
        label={t('whatLabel')}
        size="md"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={what}
        placeholder={t(`service.${service.id}.example` as 'service.notion.example')}
        data-testid={`${testIdPrefix}-what`}
        onChange={(event) => onWhatChange(event.target.value)}
        className="mt-3 w-full"
      />
      {canRunAgent ? (
        <p className="mt-2 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
          {t('whatNext', { limit: DEFAULT_IMPORT_LIMIT, folder: serviceFolder(service, destination) })}
        </p>
      ) : null}
      {/* Connectors reach only runtimes with a measured permission path; without this line another runtime's agent silently has no service tools. */}
      {canRunAgent ? (
        <p
          data-testid={`${testIdPrefix}-runtime`}
          className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('whatRuntime')}
        </p>
      ) : null}
      {canRunAgent ? null : (
        <div
          role="status"
          data-testid={`${testIdPrefix}-no-agent`}
          className="mt-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
        >
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t('noAgentTitle')}
          </p>
          <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t('noAgentBodyRuntime')}
          </p>
          <Link
            href={DESTINATION_HREF.agents}
            data-testid={`${testIdPrefix}-no-agent-app`}
            className={controlClass({
              shape: 'link',
              tone: 'accent',
              className: 'atlas-touch-floor atlas-touch-floor-wide mt-2 text-label font-[var(--font-weight-signature)]',
            })}
          >
            {t('noAgentSeeRuntimes')}
          </Link>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" className="atlas-touch-floor" onClick={onBack}>
          {t('back')}
        </Button>
        {canRunAgent ? (
          <Chip
            size="lg"
            tone="accent"
            data-testid={`${testIdPrefix}-bring`}
            onClick={onBring}
            className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
          >
            <ExternalLink size={ICON_SIZE.sm} aria-hidden />
            {t('bringAction')}
          </Chip>
        ) : null}
      </div>
    </>
  );
}
