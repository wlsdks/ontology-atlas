'use client';

import { useTranslations } from 'next-intl';

import type { OntologyChangeSet } from '@/entities/knowledge-graph';

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function OntologyChangeReview({ changeSet }: { changeSet: OntologyChangeSet }) {
  const t = useTranslations('acpChat.permission.changeReview');
  const visibleFields = changeSet.fields.slice(0, 8);
  const hiddenCount = Math.max(0, changeSet.fields.length - visibleFields.length);

  return (
    <div
      data-testid="acp-ontology-change-review"
      data-change-operation={changeSet.operation}
      data-change-exact={String(changeSet.exact)}
      className="grid gap-2"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t(`operation.${changeSet.operation}`)}
        </p>
        {changeSet.itemCount > 1 ? (
          <span className="shrink-0 text-caption text-[color:var(--color-text-quaternary)]">
            {t('itemCount', { count: changeSet.itemCount })}
          </span>
        ) : null}
      </div>

      {changeSet.target ? (
        <p className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">
          {changeSet.target}
        </p>
      ) : null}

      {changeSet.relation ? (
        <dl className="grid gap-1.5 border-t border-[color:var(--color-divider)] pt-2 text-label">
          {([
            ['from', changeSet.relation.from],
            ['relation', changeSet.relation.type],
            ['to', changeSet.relation.to],
          ] as const).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-[color:var(--color-text-quaternary)]">{t(label)}</dt>
              <dd className="break-all font-mono text-[color:var(--color-text-primary)]">{value}</dd>
            </div>
          ))}
          {changeSet.relation.why ? (
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-[color:var(--color-text-quaternary)]">{t('why')}</dt>
              <dd className="break-words text-[color:var(--color-text-secondary)]">
                {changeSet.relation.why}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {visibleFields.length > 0 ? (
        <dl className="grid gap-1.5 border-t border-[color:var(--color-divider)] pt-2 text-label">
          {visibleFields.map((field) => (
            <div key={field.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="break-all font-mono text-[color:var(--color-text-quaternary)]">
                {field.key}
              </dt>
              <dd className="break-all text-[color:var(--color-text-primary)]">
                {formatValue(field.after)}
              </dd>
            </div>
          ))}
          {hiddenCount > 0 ? (
            <p className="text-caption text-[color:var(--color-text-quaternary)]">
              {t('moreFields', { count: hiddenCount })}
            </p>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
