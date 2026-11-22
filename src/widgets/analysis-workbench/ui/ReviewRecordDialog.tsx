'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import type { AnalysisCompatibility, AnalysisRun } from '@/entities/analysis-record';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { CloseButton, Dialog, DialogBody } from '@/shared/ui';

const TITLE_ID = 'review-record-title';
const PRE = 'atlas-scroll-quiet whitespace-pre-wrap break-words text-caption leading-caption text-[color:var(--color-text-secondary)]';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-4">
    <h3 className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{title}</h3>
    {children}
  </section>;
}

export function ReviewRecordDialog({ open, onClose, run, compatibility, answer, problems, actions, decisions }: {
  open: boolean;
  onClose: () => void;
  run: AnalysisRun;
  compatibility: AnalysisCompatibility | null;
  answer: ReactNode;
  problems: readonly string[];
  actions: ReactNode;
  decisions: ReactNode;
}) {
  const t = useTranslations('analysisWorkbench');
  /* Capture phase: focus on the dialog container still reaches the map's Escape, which would close the review too. */
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isImeComposing(event)) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [open, onClose]);
  const cited = [...new Set([...run.evidence.map((item) => item.slug), ...run.findings.flatMap((finding) => finding.evidenceSlugs)])];
  return <Dialog open={open} onClose={onClose} size="lg" labelledBy={TITLE_ID} testId="review-record-dialog">
    <div className="flex shrink-0 items-start justify-between gap-4 pb-3">
      <h2 id={TITLE_ID} className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('recordDetails')}</h2>
      <CloseButton label={t('closeRecord')} onClick={onClose} />
    </div>
    <DialogBody className="flex flex-col gap-4 pr-1 text-body leading-body text-[color:var(--color-text-primary)]">
      <div className="flex flex-col gap-1">
        <h3 className="break-words text-body font-[var(--font-weight-strong)]">{run.scope.targetSlugs.join(', ') || t('wholeProject')}</h3>
        <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t(`outcome.${run.origin.outcome}`)} · {t(`basis.${compatibility?.status ?? 'checking'}`)} · {t(run.qualification.status === 'grounded' ? 'grounded' : 'unverified')}</p>
        <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('readCoverage', { count: run.evidence.length })}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
      <Section title={t('answer')}>
        <div className="flex flex-col gap-3 break-words">{answer}</div>
      </Section>
      {cited.length ? <Section title={t('evidence')}>
        {cited.map((slug) => <div key={slug} className="flex flex-col gap-1">
          <h4 className="break-all text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{slug}</h4>
          <pre className={PRE}>{run.evidence.find((item) => item.slug === slug)?.body ?? t('evidenceMissing')}</pre>
        </div>)}
      </Section> : null}
      {run.observations.map((observation, index) => <Section key={`${observation.toolCallId}:${index}`} title={t('observationDetails')}>
        <pre className={PRE}>{JSON.stringify(observation.result, null, 2)}</pre>
      </Section>)}
      <Section title={t('basisDetails')}>
        <pre className={PRE}>{JSON.stringify({ request: run.request, origin: run.origin, basis: run.basis, sourceAccess: run.sourceAccess, qualification: run.qualification, current: compatibility }, null, 2)}</pre>
      </Section>
      {run.profileSnapshot ? <Section title={t('profileSnapshot')}><pre className={PRE}>{run.profileSnapshot.markdown}</pre></Section> : null}
      {problems.length ? <Section title={t('recordProblems', { count: problems.length })}><pre className={PRE}>{problems.join('\n')}</pre></Section> : null}
      {decisions}
    </DialogBody>
  </Dialog>;
}
