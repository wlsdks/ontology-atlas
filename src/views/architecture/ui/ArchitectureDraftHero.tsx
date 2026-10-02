'use client';

import { useState, type ReactNode } from 'react';
import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buildArchitectureDraftPrompt, type ArchitectureHandoffContext } from '@/entities/architecture-profile';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { PAGE_LEDE, PAGE_TITLE } from '@/shared/ui/page-frame';
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
      <div className="@container/draft w-full">
        <div className="grid w-full grid-cols-1 items-start gap-8 @min-[76rem]/draft:grid-cols-[minmax(0,var(--git-setup-measure))_minmax(0,1fr)] @min-[76rem]/draft:gap-14">
          <div className="flex min-w-0 max-w-[var(--git-setup-measure)] flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Title className={cn(PAGE_TITLE, 'text-balance')}>{t('noProfiles')}</Title>
              <p className={PAGE_LEDE}>
                {agentRoute === 'clipboard' ? `${t('noProfilesBody')} ${t('draftNoAgentBody')}` : t('noProfilesBody')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
          </div>
          <div className="hidden min-w-0 @min-[36rem]/draft:block">
            <ArchitectureDraftPreview source={draftSource} still={agentWorking} />
          </div>
        </div>
      </div>
    </main>
  );
}
