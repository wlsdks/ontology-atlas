'use client';

import { forwardRef, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';

import type { AnalysisFinding } from '@/entities/analysis-record';
import { badgeClass } from '@/shared/ui/badge-class';
import { Button, Chip, OntologyMapKindGlyph, RowButton, Textarea, controlClass } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

export type FindingDisposition = 'retain' | 'dismiss';
/** A concept the evidence slug resolves to on the current map, else only the slug. */
export type EvidenceConcept = { slug: string; title: string | null; kind: string | null };

const SECTION_LABEL = 'text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]';

function DispositionBadge({ disposition }: { disposition: FindingDisposition }) {
  const t = useTranslations('analysisWorkbench');
  return <span className={badgeClass({ shape: 'tag', className: 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-secondary)]' })}>{t(`review.${disposition}`)}</span>;
}

/** One finding as one pressable card; every card in the list takes the tallest card's height. */
export const FindingRow = forwardRef<HTMLButtonElement, {
  finding: AnalysisFinding;
  disposition: FindingDisposition | null;
  onOpen: () => void;
}>(function FindingRow({ finding, disposition, onOpen }, ref) {
  const dismissed = disposition === 'dismiss';
  return <button ref={ref} type="button" data-finding-row={finding.id} onClick={onOpen} className={controlClass({
    shape: 'card', size: 'md', hoverBorder: 'strong', hoverInk: 'strong',
    className: 'h-full w-full flex-col items-start gap-1 px-3 py-2.5 text-left',
  })}>
    <span className="flex w-full min-w-0 items-start gap-2">
      <span className={cn('line-clamp-2 min-w-0 flex-1 text-body leading-body font-[var(--font-weight-strong)]', dismissed ? 'text-[color:var(--color-text-tertiary)]' : 'text-[color:var(--color-text-primary)]')}>{finding.title}</span>
      {disposition ? <DispositionBadge disposition={disposition} /> : null}
    </span>
    <span className={cn('line-clamp-2 w-full text-label leading-label', dismissed ? 'text-[color:var(--color-text-quaternary)]' : 'text-[color:var(--color-text-secondary)]')}>{finding.detail}</span>
  </button>;
});

/** Navigation inside the results tab: it replaces the list until the person goes back. */
export function FindingDetail({ finding, disposition, evidence, reason, busy, onBack, onFix, onJudge, onReasonChange, onEvidence }: {
  finding: AnalysisFinding;
  disposition: FindingDisposition | null;
  evidence: readonly EvidenceConcept[];
  reason: string;
  busy: boolean;
  onBack: () => void;
  onFix: (() => void) | null;
  onJudge: ((disposition: FindingDisposition) => void) | null;
  onReasonChange: (reason: string) => void;
  onEvidence: ((slug: string) => void) | null;
}) {
  const t = useTranslations('analysisWorkbench');
  const backRef = useRef<HTMLButtonElement>(null);
  /* The list frame that held focus turns inert in the same commit, so focus must land here before paint. */
  useLayoutEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);
  const goBackOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation(); onBack();
  };
  const paragraphs = finding.detail.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return <div className="flex flex-col gap-4" onKeyDown={goBackOnEscape}>
    <Button ref={backRef} variant="ghost" size="sm" className="-ml-2 self-start" onClick={onBack}><ChevronLeft size={16} aria-hidden />{t('backToList')}</Button>
    <div className="flex flex-col gap-2">
      <h3 className="break-words text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{finding.title}</h3>
      {disposition ? <span className="self-start"><DispositionBadge disposition={disposition} /></span> : null}
      <div className="flex flex-col gap-2 text-body leading-body text-[color:var(--color-text-primary)]">{paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap break-words">{paragraph}</p>)}</div>
    </div>
    {onFix || onJudge ? <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {onFix ? <Chip size="lg" tone="onAccent" onClick={onFix}>{t('haveFixed')}</Chip> : null}
        {onJudge ? <>
          <Chip size="lg" hoverBorder="strong" disabled={busy} onClick={() => onJudge('retain')}>{t('retain')}</Chip>
          <Chip size="lg" hoverBorder="strong" disabled={busy} onClick={() => onJudge('dismiss')}>{t('dismiss')}</Chip>
        </> : null}
      </div>
      {onJudge ? <Textarea label={t('reviewReason')} className="w-full" rows={2} value={reason} onChange={(event) => onReasonChange(event.target.value)} /> : null}
    </div> : null}
    {evidence.length ? <section className="flex flex-col gap-1">
      <h4 className={SECTION_LABEL}>{t('sourceDocuments', { count: evidence.length })}</h4>
      <ul className="flex flex-col">{evidence.map((concept) => {
        const label = <>
          {concept.kind ? <OntologyMapKindGlyph kind={concept.kind} size={12} /> : null}
          <span className="min-w-0 truncate text-[color:var(--color-text-primary)]">{concept.title ?? concept.slug}</span>
          {concept.title ? <span className="min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">{concept.slug}</span> : null}
        </>;
        return <li key={concept.slug}>{onEvidence
          ? <RowButton size="md" hoverSurface="lift" onClick={() => onEvidence(concept.slug)}>{label}</RowButton>
          : <span className="flex min-h-9 items-center gap-2 px-2.5 py-2 text-body">{label}</span>}</li>;
      })}</ul>
    </section> : null}
  </div>;
}
