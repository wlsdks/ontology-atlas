'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/shared/ui';

const gitExamples = ['checkout', 'refund', 'handoff'] as const;

export function WebGitExample() {
  const t = useTranslations('webExamples');
  const [selected, setSelected] = useState(0);
  return <div data-testid="web-git-example" className="grid min-h-0 w-full max-w-6xl gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.1fr)]">
    <section className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
      <p className="text-label text-[color:var(--color-indigo-text-soft)]">{t('sampleBadge')}</p>
      <h1 className="mt-2 text-display font-[var(--font-weight-signature)]">{t('gitTitle')}</h1>
      <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('gitIntro')}</p>
      <div className="mt-5 flex flex-col gap-2">
        {gitExamples.map((item, index) => <Button key={item} variant={index === selected ? 'outline' : 'ghost'} onClick={() => setSelected(index)} className="w-full justify-start text-left whitespace-normal" data-testid={`web-git-row-${index}`}>
          {t(`gitExamples.${item}.title`)}
        </Button>)}
      </div>
    </section>
    <section className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]" aria-live="polite">
      <p className="text-label text-[color:var(--color-text-tertiary)]">{t('gitDetailLabel')}</p>
      <h2 className="mt-2 text-title font-[var(--font-weight-strong)]">{t(`gitExamples.${gitExamples[selected]}.node`)}</h2>
      <p className="mt-4 text-body text-[color:var(--color-text-secondary)]">{t(`gitExamples.${gitExamples[selected]}.detail`)}</p>
      <p className="mt-6 text-label text-[color:var(--color-text-tertiary)]">{t('noRealCommits')}</p>
    </section>
  </div>;
}

export function WebAgentsExample() {
  const t = useTranslations('webExamples');
  const [selected, setSelected] = useState<'tools' | 'handoff'>('tools');
  return <section data-testid="web-agents-example" className="max-w-3xl rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
    <p className="text-label text-[color:var(--color-indigo-text-soft)]">{t('sampleBadge')}</p>
    <h2 className="mt-2 text-title font-[var(--font-weight-strong)]">{t('agentsTitle')}</h2>
    <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('agentsIntro')}</p>
    <div className="mt-5 flex gap-2">
      <Button variant={selected === 'tools' ? 'outline' : 'ghost'} onClick={() => setSelected('tools')}>{t('tools')}</Button>
      <Button variant={selected === 'handoff' ? 'outline' : 'ghost'} onClick={() => setSelected('handoff')}>{t('handoff')}</Button>
    </div>
    {selected === 'tools' ? <div className="mt-4 flex flex-col gap-2 text-body text-[color:var(--color-text-secondary)]">
      <p>{t('toolExampleOne')}</p><p>{t('toolExampleTwo')}</p>
    </div> : <div className="mt-4 text-body text-[color:var(--color-text-secondary)]">
      <p>{t('handoffExample')}</p>
      <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('noAgentRun')}</p>
    </div>}
  </section>;
}

export function WebAutomationExample({ lane }: { lane: 'ontology' | 'documents' }) {
  const t = useTranslations('webExamples');
  const [expanded, setExpanded] = useState(false);
  return <section data-testid="web-automation-example" className="max-w-3xl rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
    <p className="text-label text-[color:var(--color-indigo-text-soft)]">{t('sampleBadge')}</p>
    <h2 className="mt-2 text-title font-[var(--font-weight-strong)]">{lane === 'ontology' ? t('ontologySchedule') : t('documentSchedule')}</h2>
    <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{lane === 'ontology' ? t('ontologyScheduleSummary') : t('documentScheduleSummary')}</p>
    <Button variant="outline" onClick={() => setExpanded((value) => !value)} className="mt-5">{expanded ? t('hideSteps') : t('showSteps')}</Button>
    {expanded && <ol className="mt-4 list-decimal space-y-2 pl-5 text-body text-[color:var(--color-text-secondary)]">
      {(lane === 'ontology' ? [t('ontologyStep1'), t('ontologyStep2'), t('ontologyStep3')] : [t('documentStep1'), t('documentStep2'), t('documentStep3')]).map((step) => <li key={step}>{step}</li>)}
    </ol>}
    <p className="mt-5 text-label text-[color:var(--color-text-tertiary)]">{t('noAutomationRun')}</p>
  </section>;
}
