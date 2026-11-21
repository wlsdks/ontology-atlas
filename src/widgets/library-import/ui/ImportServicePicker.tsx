'use client';

import { useTranslations } from 'next-intl';

import { ServiceMark, resolveServiceMark } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';

import { IMPORT_SERVICES, type ImportService, type ImportServiceId } from '../model/import-flow';

export function ImportServicePicker({
  testIdPrefix,
  onPick,
  registerServiceButton,
}: {
  testIdPrefix: string;
  onPick: (service: ImportService) => void;
  registerServiceButton: (id: ImportServiceId, button: HTMLButtonElement | null) => void;
}) {
  const t = useTranslations('libraryImport');
  return (
    <>
      <p className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t('pickBody')}
      </p>
      <ul
        data-testid={`${testIdPrefix}-services`}
        className="mt-3 grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {IMPORT_SERVICES.map((candidate, index) => (
          <li
            key={candidate.id}
            className={cn('min-w-0', index === IMPORT_SERVICES.length - 1 && index % 2 === 0 && 'sm:col-span-2')}
          >
            <button
              ref={(node) => registerServiceButton(candidate.id, node)}
              type="button"
              data-testid={`${testIdPrefix}-service`}
              data-service={candidate.id}
              onClick={() => onPick(candidate)}
              className={controlClass({
                shape: 'card',
                tone: 'secondary',
                hoverSurface: 'lift',
                hoverBorder: 'strong',
                className: 'h-full w-full flex-col items-start gap-1 px-3 py-2.5 text-left',
              })}
            >
              <span className="flex items-center gap-2">
                <ServiceMark
                  mark={resolveServiceMark(candidate.id, '')}
                  className="text-[color:var(--color-text-tertiary)]"
                />
                <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t(`service.${candidate.id}.title` as 'service.notion.title')}
                </span>
              </span>
              <span className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                {t(`service.${candidate.id}.body` as 'service.notion.body')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p
        data-testid={`${testIdPrefix}-absent-note`}
        className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('absentNote')}
      </p>
    </>
  );
}
