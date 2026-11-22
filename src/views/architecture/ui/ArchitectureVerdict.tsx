'use client';

import { useLocale, useTranslations } from 'next-intl';

import type { ArchitectureRecord, ArchitectureRecordStatus } from '@/entities/architecture-record';
import { cn } from '@/shared/lib/cn';

type Conformance = ArchitectureRecord['brief']['conformance'];
type VerdictState = ArchitectureRecordStatus | 'loading' | 'missing';

export function ArchitectureVerdict({
  conformance,
  loading,
  crossRoleImports,
  layers,
  modules,
  stamp,
  rule,
  roleLabel,
}: {
  conformance: Conformance | null;
  loading: boolean;
  crossRoleImports: number;
  layers: number;
  modules: number | null;
  stamp: string | null;
  rule: string;
  roleLabel: (id: string) => string;
}) {
  const t = useTranslations('architecture');
  const state: VerdictState = conformance?.status ?? (loading ? 'loading' : 'missing');
  const format = new Intl.NumberFormat(useLocale());
  const figures = [
    ...(conformance ? [{ key: 'imports', value: crossRoleImports, label: t('figureCrossImports') }] : []),
    { key: 'layers', value: layers, label: t('figureLayers') },
    ...(modules === null ? [] : [{ key: 'modules', value: modules, label: t('figureModules') }]),
  ];
  const unknown = conformance?.status === 'unknown' ? conformance.unknown : undefined;
  const reasons = [
    unknown?.unruledEdges ? t('unknownReasons.unruled', { count: unknown.unruledEdges }) : null,
    unknown?.unmappedEdges ? t('unknownReasons.unmapped', { count: unknown.unmappedEdges }) : null,
    unknown?.emptyRoles?.length
      ? t('unknownReasons.emptyRoles', { roles: unknown.emptyRoles.map(roleLabel).join(', ') })
      : null,
    unknown?.coverageIncomplete ? t('unknownReasons.coverage') : null,
  ].filter((reason): reason is string => reason !== null);

  return (
    <section className="shrink-0" data-testid="architecture-verdict" data-architecture-status={state}>
      <div className="flex min-w-0 flex-wrap items-end gap-x-10 gap-y-3">
        {conformance ? (
          <div className="min-w-0">
            <p
              className={cn(
                'text-hero-lg font-[var(--font-weight-strong)] tabular-nums',
                conformance.violationCount > 0
                  ? 'text-[color:var(--color-danger-text)]'
                  : 'text-[color:var(--color-text-primary)]',
              )}
              data-testid="architecture-violation-count"
            >
              {format.format(conformance.violationCount)}
            </p>
            <p className="flex items-center gap-2 text-body text-[color:var(--color-text-secondary)]" data-testid="architecture-status">
              {conformance.status === 'conforms' ? (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-status-success)]" />
              ) : null}
              {t('verdictLabel')}
            </p>
          </div>
        ) : loading ? null : (
          <div className="min-w-0 max-w-[28rem]">
            <p className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" data-testid="architecture-status">
              {t('noRecordTitle')}
            </p>
            <p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('noRecordBody')}</p>
          </div>
        )}
        <dl className="flex items-end gap-x-8 pb-0.5">
          {figures.map((figure) => (
            <div key={figure.key} className="flex flex-col-reverse" data-testid={`architecture-figure-${figure.key}`}>
              <dt className="text-label text-[color:var(--color-text-tertiary)]">{figure.label}</dt>
              <dd className="text-title font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-secondary)]">
                {format.format(figure.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {reasons.length > 0 ? (
        <p className="mt-1.5 break-keep text-body text-[color:var(--color-text-secondary)]" data-testid="architecture-unknown-reasons">
          {t('verdictUnknown', { reasons: reasons.join(' · ') })}
        </p>
      ) : null}
      <p className="mt-1.5 break-keep text-label text-[color:var(--color-text-tertiary)]" data-testid="architecture-record-stamp">
        {stamp ? `${stamp} · ${rule}` : rule}
      </p>
    </section>
  );
}
