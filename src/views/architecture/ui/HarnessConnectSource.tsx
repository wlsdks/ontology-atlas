'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import type { VaultDoc } from '@/entities/docs-vault';
import { useProjectSourceModel, type ProjectSourceRuntime } from '@/features/project-source-binding';
import { useOntologyInsight } from '@/features/vault-ontology';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { Button, buttonVariants } from '@/shared/ui';

import { HarnessUnreadStage } from './HarnessUnreadStage';

const TOUCH = 'atlas-touch-floor atlas-touch-floor-wide';
const NO_DOCS: readonly VaultDoc[] = [];

function folderName(rootPath: string): string {
  return rootPath.split(/[\\/]+/).filter(Boolean).pop() ?? rootPath;
}

/**
 * The Harness tab with no connected repository: the repository that holds the opened folder is
 * offered for one press, and any other folder is picked here, without leaving for Projects.
 */
export function HarnessConnectSource({ vaultHandle, projectSlug, docs, onConnected, runtime }: {
  vaultHandle: FileSystemDirectoryHandle;
  /** Null when the folder records no project, which a binding needs. */
  projectSlug: string | null;
  docs: readonly VaultDoc[] | undefined;
  onConnected: () => void;
  runtime?: ProjectSourceRuntime;
}) {
  const t = useTranslations('harness');
  const { insight } = useOntologyInsight();
  const source = useProjectSourceModel({
    projectSlug,
    vaultHandle,
    nodes: insight?.nodes ?? [],
    docs: docs ?? NO_DOCS,
    pickerTitle: t('connectPickerTitle'),
    runtime,
  });
  const connected = (source.view?.bindingCardinality ?? 0) > 0;
  useEffect(() => {
    if (connected) onConnected();
  }, [connected, onConnected]);

  const connectsHere = source.canRunSourceAction && source.view?.nextAction.id === 'connect_source';
  if (!connectsHere) {
    return <HarnessUnreadStage
      state="no-source"
      title={t('noSource')}
      body={t('noSourceBody')}
      // The note explains why nothing is read; it only applies when two or more folders are bound.
      note={(source.view?.bindingCardinality ?? 0) > 1 ? t('noSourceNote') : undefined}
      action={<Link href="/projects/" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), TOUCH)}>{t('connectSourceAction')}</Link>}
    />;
  }

  const proposed = source.proposalSettled ? source.proposedRoot : null;
  const pick = () => { void source.runNextAction(); };
  return <HarnessUnreadStage
    state="no-source"
    title={t('noSource')}
    body={proposed ? t('connectFoundBody', { name: folderName(proposed.rootPath) }) : t('noSourceBody')}
    note={source.error
      ? <span role="alert" data-testid="harness-connect-error" data-failure-code={source.error} className="text-[color:var(--color-danger-text)]">{t('connectFailed')}</span>
      : t('connectReadsNote')}
    action={proposed
      ? <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" size="lg" className={TOUCH} disabled={source.busy} data-testid="harness-connect-found"
            onClick={() => { void source.runNextAction({ rootPath: proposed.rootPath }); }}>
            {t('connectFoundAction', { name: folderName(proposed.rootPath) })}
          </Button>
          <Button variant="ghost" size="lg" className={TOUCH} disabled={source.busy} data-testid="harness-connect-pick" onClick={pick}>
            {t('connectOtherAction')}
          </Button>
        </div>
      : <Button variant="primary" size="lg" className={cn(TOUCH, !source.proposalSettled && 'invisible')} disabled={source.busy || !source.proposalSettled} data-testid="harness-connect-pick" onClick={pick}>
          {t('connectPickAction')}
        </Button>}
  />;
}
