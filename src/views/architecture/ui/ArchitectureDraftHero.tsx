'use client';

import { useState, type ReactNode } from 'react';
import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buildArchitectureDraftPrompt, type ArchitectureHandoffContext } from '@/entities/architecture-profile';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PAGE_LEDE, PAGE_TITLE } from '@/shared/ui/tokens/page-frame';
import type { ArchitectureAgentRequest, ArchitectureAgentRoute } from '../model/architecture-agent';
import type { DraftPreviewSource } from '../model/draft-preview';
import { ArchitectureDraftPreview } from './ArchitectureDraftPreview';
import { HARNESS_GUTTER_X } from './harness-frame';

type CopyState = 'idle' | 'pending' | 'copied' | 'error';

export function ArchitectureDraftHero({
  embedded,
  notices,
  agentRoute,
  agentLabel,
  onAgentRequest,
  draftHandoffContext,
  draftSource,
  agentWorking,
}: {
  embedded: boolean;
  agentWorking: boolean;
  notices: ReactNode;
  agentRoute: ArchitectureAgentRoute;
  agentLabel: string | null;
  onAgentRequest?: (request: ArchitectureAgentRequest) => void;
  draftHandoffContext: ArchitectureHandoffContext | null;
  draftSource: DraftPreviewSource | null;
}) {
  const t = useTranslations('architecture');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const Title = embedded ? 'h2' : 'h1';
  const copyLabel =
    copyState === 'pending'
      ? t('copyingHandoff')
      : copyState === 'copied'
        ? t('copiedHandoff')
        : copyState === 'error'
          ? t('copyHandoffError')
          : t('copyHandoff');

  return (
    <main
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] pt-5 md:pt-10 lg:pb-[var(--page-bottom-breath)]',
        embedded ? HARNESS_GUTTER_X : 'px-5 md:px-10',
      )}
      data-testid="architecture-draft-hero"
    >
      {notices}
      {/* One centred column, as every empty destination: the preview of what a draft becomes, then the ask. */}
      <div className="@container/draft mx-auto my-auto flex w-full max-w-[var(--architecture-draft-stage-max)] flex-col items-center gap-8 py-6 text-center">
          <div className="hidden w-full min-w-0 text-left @min-[36rem]/draft:block">
            <ArchitectureDraftPreview source={draftSource} still={agentWorking} />
          </div>
          <div className="flex min-w-0 max-w-[var(--measure-stage-column)] flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <Title className={cn(PAGE_TITLE, 'text-balance')}>{t('noProfiles')}</Title>
              <p className={cn(PAGE_LEDE, 'text-balance')}>
                {t('noProfilesBody')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {agentRoute === 'agent' ? (
                <Button
                  variant="primary"
                  size="md"
                  className="atlas-touch-floor"
                  disabled={!onAgentRequest}
                  data-testid="architecture-draft-with-agent"
                  onClick={() =>
                    onAgentRequest?.({ kind: 'draft', prompt: buildArchitectureDraftPrompt(draftHandoffContext) })
                  }
                >
                  <Bot size={ICON_SIZE.sm} aria-hidden />
                  {t('draftWithAgent', { agent: agentLabel ?? t('connectedAgent') })}
                </Button>
              ) : agentRoute === 'checking' ? (
                <Button className="atlas-touch-floor" variant="primary" size="md" disabled data-testid="architecture-agent-checking">
                  <Bot size={ICON_SIZE.sm} aria-hidden />
                  {t('checkingAgent')}
                </Button>
              ) : null}
              <Button
                variant={agentRoute === 'clipboard' ? 'primary' : 'outline'}
                size="md"
                className="atlas-touch-floor"
                disabled={copyState === 'pending'}
                data-testid="architecture-copy-draft-handoff"
                data-architecture-draft-copy-state={copyState}
                onClick={() => {
                  setCopyState('pending');
                  navigator.clipboard
                    .writeText(buildArchitectureDraftPrompt(draftHandoffContext))
                    .then(() => setCopyState('copied'))
                    .catch(() => setCopyState('error'));
                }}
              >
                {copyLabel}
              </Button>
              <span className="sr-only" role="status" aria-live="polite">
                {copyState === 'copied' ? t('copiedHandoff') : copyState === 'error' ? t('copyHandoffError') : ''}
              </span>
            </div>
            {agentRoute === 'clipboard' ? (
              <p className="text-body text-[color:var(--color-text-tertiary)]">{t('draftNoAgentBody')}</p>
            ) : null}
          </div>
      </div>
    </main>
  );
}
