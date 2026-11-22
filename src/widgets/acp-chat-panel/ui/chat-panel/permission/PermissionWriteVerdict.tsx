'use client';

import { useTranslations } from 'next-intl';

import { describeWikiProblem, type WikiTemplateProblem } from '@/features/library';

const VERDICT_ROWS = 4;

/** Whether the page the agent wants to write keeps its template: a short line, or the first problems. */
export function PermissionWriteVerdict({
  verdict,
}: {
  verdict: { ok: boolean; problems: ReadonlyArray<WikiTemplateProblem> };
}) {
  const t = useTranslations('acpChat.permission');
  const libraryT = useTranslations('library');
  return (
    <div
      data-testid="acp-permission-page-verdict"
      data-ok={verdict.ok ? 'true' : 'false'}
      className={
        verdict.ok
          ? 'px-1 text-label leading-label text-[color:var(--color-text-tertiary)]'
          : 'rounded-chip border border-[color:var(--color-border-strong)] px-2.5 py-1.5 text-label leading-label text-[color:var(--color-text-secondary)]'
      }
    >
      {verdict.ok ? (
        t('pageFits')
      ) : (
        <>
          <p>{t('pageFails', { count: verdict.problems.length })}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {verdict.problems.slice(0, VERDICT_ROWS).map((problem, index) => (
              <li key={`${problem.code}-${problem.line ?? index}`} className="flex min-w-0 flex-col">
                <span className="min-w-0 text-[color:var(--color-text-primary)]">
                  {describeWikiProblem(problem, libraryT).sentence}
                </span>
                <code className="min-w-0 break-all font-mono text-[color:var(--color-text-tertiary)]">
                  {problem.code}
                  {problem.line ? `:${problem.line}` : ''}
                </code>
              </li>
            ))}
          </ul>
          {verdict.problems.length > VERDICT_ROWS ? (
            <p className="mt-1 text-[color:var(--color-text-tertiary)]">
              {t('pageFailsRest', { count: verdict.problems.length - VERDICT_ROWS })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
