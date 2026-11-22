'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type WizardStep = 'intro' | 'choose' | 'run';
const WIZARD_STEPS: readonly WizardStep[] = ['intro', 'choose', 'run'];
const WIZARD_KEY = { intro: 'wizard.stepIntro', choose: 'wizard.stepChoose', run: 'wizard.stepRun' } as const;

export function WizardSteps({ at }: { at: WizardStep }) {
  const t = useTranslations('library.questionDesk.meaning');
  const index = WIZARD_STEPS.indexOf(at);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label leading-label" data-testid="meaning-wizard-steps" data-wizard-step={at}>
      {WIZARD_STEPS.map((step, position) => {
        const state = position < index ? 'done' : position === index ? 'now' : 'next';
        return (
          <li key={step} data-step-state={state} aria-current={state === 'now' ? 'step' : undefined} className="flex items-center gap-2">
            {position > 0 ? <span aria-hidden className={cn('h-px w-5', state === 'next' ? 'bg-[color:var(--color-overlay-3)]' : 'bg-[color:var(--color-indigo-line-a40)]')} /> : null}
            <span aria-hidden className={cn(
              'grid size-4 place-items-center rounded-full tabular-nums',
              state === 'done' ? 'bg-[color:var(--color-indigo-a24)] text-[color:var(--color-indigo-pale-a92)]'
                : state === 'now' ? 'bg-[color:var(--color-indigo-accent)] text-[color:var(--color-text-on-accent)]'
                  : 'border border-[color:var(--color-overlay-3)] text-[color:var(--color-text-tertiary)]',
            )}>
              {state === 'done' ? <Check className="size-2.5" strokeWidth={3} /> : position + 1}
            </span>
            <span className={state === 'now' ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-tertiary)]'}>{t(WIZARD_KEY[step])}</span>
          </li>
        );
      })}
    </ol>
  );
}
