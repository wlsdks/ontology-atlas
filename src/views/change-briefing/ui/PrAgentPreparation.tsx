'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Clipboard, GitPullRequest } from 'lucide-react';
import { Button, Disclosure, RowButton, Textarea } from '@/shared/ui';
import { copyText } from '@/shared/lib/clipboard/copy-text';
import { publicPullRepositories, type BriefingReceipt, type PublicPullVersion } from '@/shared/lib/git/tauri-pr-inventory';
import { isIssuedPrAgentPlan, planPrAgentEvidence } from '../model/pr-agent-evidence';
import { MANUAL_INSTRUCTIONS, manualPrAgentPacket } from '../model/pr-agent-manual';

const MANUAL_PART_BYTES = 64 * 1024;

type Props = {
  scope: BriefingReceipt & { repository: string };
  active: boolean;
  versions: readonly PublicPullVersion[];
  evidenceRevision: string;
  preparedRevision: string;
  question: string;
  onQuestion: (question: string) => void;
  originalsOpen: boolean;
  onBack: () => void;
  onOpen: (version: PublicPullVersion) => void;
};

export function PrAgentPreparation({ scope, active, versions, evidenceRevision, preparedRevision, question, onQuestion, originalsOpen, onBack, onOpen }: Props) {
  const t = useTranslations('prBriefing');
  const [feedback, setFeedback] = useState('');
  const [stale, setStale] = useState(false);
  const [copying, setCopying] = useState(false);
  const [observedActive, setObservedActive] = useState(active);
  const copyGeneration = useRef(0);
  useLayoutEffect(() => () => { copyGeneration.current++; }, []);
  useLayoutEffect(() => { if (!active) copyGeneration.current++; }, [active]);
  if (observedActive !== active) {
    setObservedActive(active);
    if (!active && copying) setCopying(false);
  }
  const preparation = useMemo(() => {
    if (evidenceRevision !== preparedRevision) return { plan: null, reason: 'previewStale' as const };
    if (!question.trim() || !versions.length) return { plan: null, reason: 'previewEmpty' as const };
    if (new TextEncoder().encode(question).length > 8192) return { plan: null, reason: 'questionTooLong' as const };
    try { return { plan: planPrAgentEvidence(scope, question, versions, MANUAL_PART_BYTES), reason: null }; } catch { return { plan: null, reason: 'previewStale' as const }; }
  }, [scope, versions, question, evidenceRevision, preparedRevision]);
  const plan = preparation.plan;

  async function copyPart(index: number) {
    if (!active || copying || !plan || !isIssuedPrAgentPlan(plan)) { setStale(true); return; }
    const generation = ++copyGeneration.current;
    setCopying(true);
    setFeedback('');
    try {
      const remotes = await publicPullRepositories(scope);
      if (generation !== copyGeneration.current) return;
      if (!remotes.includes(scope.repository) || !isIssuedPrAgentPlan(plan)) { setStale(true); return; }
      const copied = await copyText(manualPrAgentPacket(plan.parts[index]), { canFallback: () => generation === copyGeneration.current && isIssuedPrAgentPlan(plan) }).catch(() => false);
      if (generation === copyGeneration.current) setFeedback(copied ? (plan.parts.length === 1 ? t('copiedRequest') : t('copiedPart', { number: index + 1 })) : t('copyFailed'));
    } catch {
      if (generation === copyGeneration.current) setStale(true);
    } finally {
      if (generation === copyGeneration.current) setCopying(false);
    }
  }
  function cancelCopy() { copyGeneration.current++; setCopying(false); }

  return <section className="max-w-5xl space-y-5" aria-label={t('prepare')}>
    <Button className="max-[769px]:min-h-11" variant="ghost" size="sm" onClick={() => { cancelCopy(); onBack(); }}><ArrowLeft size={16} aria-hidden />{t('backToSelection')}</Button>
    <div className="space-y-1">
      <h2 className="text-title font-[var(--font-weight-strong)]">{t('prepare')}</h2>
      <p className="text-label text-[color:var(--color-text-secondary)]">{scope.repository}</p>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="min-w-0 lg:col-start-1">
        <Textarea className="w-full" label={t('questionLabel')} value={question} rows={3} maxLength={8192} onChange={event => { cancelCopy(); onQuestion(event.target.value); setFeedback(''); setStale(false); }} />

      </div>
      <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-span-2">
        <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-card bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-strong)]"><Clipboard size={19} aria-hidden /></span><div className="min-w-0 space-y-1"><h3 className="text-body font-[var(--font-weight-strong)]">{t('copyRequestTitle')}</h3><p className="text-label text-[color:var(--color-text-secondary)]">{t('selectedPrs', { count: versions.length })}</p></div></div>
          <p className="mt-4 text-label text-[color:var(--color-text-secondary)]">{t('manualNotice')}</p>
          <p className="mt-2 text-label text-[color:var(--color-text-secondary)]">{t('appAgentUnavailable')}</p>
          {preparation.reason && <p role="status" className="mt-3 text-body text-[color:var(--color-status-warning)]">{t(preparation.reason)}</p>}
          {stale && <p role="status" className="mt-3 text-body text-[color:var(--color-status-warning)]">{t('previewStale')}</p>}
          {plan && <section className="mt-4 space-y-3" aria-label={t('manualParts', { count: plan.parts.length })}>
            {plan.parts.length > 1 && <h4 className="text-body font-[var(--font-weight-strong)]">{t('manualParts', { count: plan.parts.length })}</h4>}
            {plan.omitted.map(item => <p key={`${item.number}:${item.version}`} className="text-body text-[color:var(--color-status-warning)]">{t(item.reason === 'unavailable' ? 'omittedUnavailable' : 'omittedOverlarge', { number: item.number })}</p>)}
            {plan.parts.map((part, index) => <div key={part.sources.map(source => source.version).join(':')} className="min-w-0 space-y-3">
              {plan.parts.length > 1 && <p className="text-label text-[color:var(--color-text-secondary)]">{t('manualPart', { number: index + 1, total: plan.parts.length })} · {part.sources.map(source => `#${source.number}`).join(', ')}</p>}
              <Button className="w-full max-[769px]:min-h-11" variant="primary" size="sm" disabled={stale || copying} onClick={() => void copyPart(index)}><Clipboard size={16} aria-hidden />{copying ? t('checkingSource') : plan.parts.length === 1 ? t('copyRequest') : t('copyPart', { number: index + 1 })}</Button>

            </div>)}
            {feedback && <p role="status" className="text-label text-[color:var(--color-text-secondary)]">{feedback}</p>}
          </section>}
        </div>
      </div>
      <section aria-label={t('selectedOriginals')} className="rounded-panel border border-[color:var(--color-border-soft)] p-4">
          <Disclosure open={originalsOpen} summaryClassName="max-[769px]:min-h-11" summary={`${t('selectedOriginals')} · ${t('selectedPrs', { count: versions.length })}`}><div className="mt-3 divide-y divide-[color:var(--color-border-soft)]">{versions.map(version => <RowButton key={`${version.number}:${version.digest}`} data-pr-source-key={`${version.number}:${version.digest}`} className="rounded-none px-3 py-3" tone="strong" hoverSurface="lift" hoverInk="strong" onClick={() => { cancelCopy(); onOpen(version); }}><GitPullRequest size={16} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" /><span className="min-w-0 break-words text-left">#{version.number} · {version.title} · {version.digest.slice(0, 8)}</span></RowButton>)}</div></Disclosure>
      </section>
    </div>
    {plan && plan.parts.map((part, index) => <section key={`preview:${part.sources.map(source => source.version).join(':')}`} className="rounded-panel border border-[color:var(--color-border-soft)] p-4">
        <Disclosure summaryClassName="max-[769px]:min-h-11" summary={plan.parts.length === 1 ? t('packetText') : `${t('packetText')} · ${t('manualPart', { number: index + 1, total: plan.parts.length })}`}>
          <div className="space-y-4 pt-3 text-body text-[color:var(--color-text-secondary)]">
            <section className="space-y-2"><h4 className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('packetInstructions')}</h4><p className="whitespace-pre-line break-words">{MANUAL_INSTRUCTIONS}</p></section>
            <section className="space-y-2"><h4 className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('questionLabel')}</h4><p className="whitespace-pre-wrap break-words">{question}</p></section>
            {part.sources.map(source => <section key={source.id} className="space-y-3"><h4 className="break-words font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">#{source.number} · {source.title} · {source.version.slice(0, 8)}</h4>{source.passages.map(passage => <div key={passage.id} className="space-y-1"><p className="text-label">{passage.id}</p><p className="whitespace-pre-wrap break-words">{passage.text}</p></div>)}</section>)}
            <Disclosure summaryClassName="max-[769px]:min-h-11" summary={t('packetRaw')}><pre className="max-w-full whitespace-pre-wrap break-words pt-3 text-label">{manualPrAgentPacket(part)}</pre></Disclosure>
          </div>
        </Disclosure>
    </section>)}
  </section>;
}
