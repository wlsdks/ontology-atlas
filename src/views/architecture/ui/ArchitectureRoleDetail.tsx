'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';

import type { ImportCell } from '../model/import-matrix';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleMembers } from '../model/role-members';

const SECTION_LABEL =
  'text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]';

/**
 * Everything one role carries beside the table: what it may import, what it imports, who imports
 * it, and what is inside it. Props only: it reads no profile or record.
 */
export function ArchitectureRoleDetail({
  roleId,
  index,
  label,
  summary,
  paths,
  mayImport,
  imports,
  importedBy,
  measured,
  maxCount,
  markedRole,
  members,
  concepts,
  roleLabel,
  sourceNote,
}: {
  roleId: string;
  /** 1-based position in profile order: the number the table prints. */
  index: number;
  label: string;
  /** One sentence for what the role is for; `null` for a role written before the field existed. */
  summary: string | null;
  paths: readonly string[];
  /** Role ids the rules let this role import, in profile order. */
  mayImport: readonly string[];
  /** Pairs out of this role with imports or violations, busiest first. */
  imports: readonly ImportCell[];
  /** Pairs into this role, the same way. */
  importedBy: readonly ImportCell[];
  /** Whether a record exists; without one the observed lists wait for a check. */
  measured: boolean;
  maxCount: number;
  /** The other end of the cell last chosen in the table, marked in both lists. */
  markedRole: string | null;
  members: RoleMembers;
  concepts: readonly RoleConcept[];
  roleLabel: (id: string) => string;
  /** Why modules are missing or come from concepts, where this surface cannot list source. */
  sourceNote: ReactNode;
}) {
  const t = useTranslations('architecture');
  return (
    <section className="flex min-w-0 flex-col gap-5" data-testid="architecture-role-detail" data-role={roleId}>
      <header className="min-w-0">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-body tabular-nums text-[color:var(--color-text-quaternary)]">
            {String(index).padStart(2, '0')}
          </span>
          <span className="truncate text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {label}
          </span>
        </h2>
        {summary ? (
          <p
            className="mt-1.5 break-keep text-body text-[color:var(--color-text-tertiary)]"
            data-testid={`architecture-role-summary-${roleId}`}
          >
            {summary}
          </p>
        ) : null}
        <p className="mt-1.5 break-all font-mono text-label text-[color:var(--color-text-quaternary)]">
          {paths.join('  ')}
        </p>
      </header>

      <div>
        <h3 className={SECTION_LABEL}>{t('paneMayImport')}</h3>
        <p className="mt-1 break-keep text-body text-[color:var(--color-text-secondary)]" data-testid={`architecture-reach-${roleId}`}>
          {mayImport.length === 0 ? t('paneNone') : mayImport.map(roleLabel).join(' · ')}
        </p>
      </div>

      <ImportList
        title={t('paneImports')}
        testId={`architecture-imports-${roleId}`}
        entries={imports}
        otherEnd={(cell) => cell.to}
        measured={measured}
        maxCount={maxCount}
        markedRole={markedRole}
        roleLabel={roleLabel}
      />
      <ImportList
        title={t('paneImportedBy')}
        testId={`architecture-imported-by-${roleId}`}
        entries={importedBy}
        otherEnd={(cell) => cell.from}
        measured={measured}
        maxCount={maxCount}
        markedRole={markedRole}
        roleLabel={roleLabel}
      />

      <div data-testid={`architecture-modules-${roleId}`}>
        <h3 className={SECTION_LABEL} data-testid={`architecture-module-count-${roleId}`}>
          {t('moduleCount', { count: members.members.length })}
        </h3>
        {sourceNote}
        {members.members.length > 0 ? (
          <ul className="mt-1.5 flex flex-col">
            {members.members.map((member) => (
              <li
                key={member.path ?? member.name}
                title={member.path ?? undefined}
                className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[color:var(--color-divider)] py-1.5 last:border-b-0"
              >
                <span className="truncate font-mono text-body text-[color:var(--color-text-secondary)]">
                  {member.name}
                </span>
                {member.concepts > 0 ? (
                  <span className="shrink-0 text-label tabular-nums text-[color:var(--color-text-quaternary)]">
                    {t('conceptCount', { count: member.concepts })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {concepts.length > 0 ? (
        <div data-testid={`architecture-concepts-${roleId}`}>
          <h3 className={SECTION_LABEL}>{t('layerConcepts', { count: concepts.length })}</h3>
          <ul className="mt-1.5 flex flex-col">
            {concepts.map((concept) => (
              <li
                key={concept.slug}
                data-concept-slug={concept.slug}
                className="flex min-w-0 flex-col border-b border-[color:var(--color-divider)] py-1.5 last:border-b-0"
              >
                <span className="truncate text-body text-[color:var(--color-text-secondary)]">{concept.title}</span>
                <span className="truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {concept.path}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ImportList({
  title,
  testId,
  entries,
  otherEnd,
  measured,
  maxCount,
  markedRole,
  roleLabel,
}: {
  title: string;
  testId: string;
  entries: readonly ImportCell[];
  otherEnd: (cell: ImportCell) => string;
  measured: boolean;
  maxCount: number;
  markedRole: string | null;
  roleLabel: (id: string) => string;
}) {
  const t = useTranslations('architecture');
  const countFormat = new Intl.NumberFormat(useLocale());
  return (
    <div data-testid={testId}>
      <h3 className={SECTION_LABEL}>{title}</h3>
      {!measured || entries.length === 0 ? (
        <p className="mt-1 text-body text-[color:var(--color-text-quaternary)]">
          {measured ? t('paneNone') : t('paneNotMeasured')}
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {entries.map((cell) => {
            const end = otherEnd(cell);
            const violated = cell.kind === 'violation';
            const count = violated ? cell.violations : cell.count;
            const share = maxCount > 0 ? Math.sqrt(Math.min(1, cell.count / maxCount)) : 0;
            return (
              <li
                key={end}
                data-other-role={end}
                data-violated={violated ? 'true' : undefined}
                data-marked={end === markedRole ? 'true' : undefined}
                className={cn('rounded-micro px-1.5 py-1', end === markedRole && 'bg-[color:var(--color-overlay-2)]')}
              >
                <span className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3">
                  <span
                    className={cn(
                      'truncate text-body',
                      violated ? 'text-[color:var(--color-danger-text)]' : 'text-[color:var(--color-text-secondary)]',
                    )}
                  >
                    {roleLabel(end)}
                  </span>
                  <span aria-hidden className="h-1.5 rounded-full bg-[color:var(--color-overlay-2)]">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        violated ? 'bg-[color:var(--color-danger-a50)]' : 'bg-[color:var(--color-indigo-a40)]',
                      )}
                      style={{ width: `${Math.max(4, share * 100)}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-label tabular-nums',
                      !violated && 'font-mono',
                      violated ? 'text-[color:var(--color-danger-text)]' : 'text-[color:var(--color-text-tertiary)]',
                    )}
                  >
                    {violated ? t('paneViolations', { count }) : countFormat.format(count)}
                  </span>
                </span>
                {violated && cell.evidence.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5 pl-0.5">
                    {cell.evidence.map((line) => (
                      <li
                        key={`${line.from}>${line.to}`}
                        className="break-all font-mono text-caption text-[color:var(--color-text-tertiary)]"
                      >
                        {line.from} → {line.to}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
