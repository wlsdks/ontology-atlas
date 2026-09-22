'use client';

import type { ReactNode } from 'react';
import { FileText, FolderCode, ListChecks, OctagonMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { RelationshipPreview } from './RelationshipPreview';

export function GuidanceRelationshipPreview({ footer }: { footer: ReactNode }) {
  const t = useTranslations('ontologyPages.insights.harnessTab.preview');
  const roles = [
    { id: 'instructions', Icon: FileText },
    { id: 'gates', Icon: OctagonMinus },
    { id: 'checks', Icon: ListChecks },
  ] as const;
  return <RelationshipPreview title={t('title')} description={t('body')} exampleLabel={t('exampleLabel')} pauseLabel={t('pauseAnimation')} resumeLabel={t('resumeAnimation')} footer={footer}
    anchor={<div className="rounded-panel border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-canvas)] p-[var(--card-pad)] shadow-[var(--shadow-elevation-1)]">
      <FolderCode size={ICON_SIZE.lg} className="mb-4 text-[color:var(--color-indigo-accent)]" aria-hidden />
      <p className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('area.title')}</p>
      <code className="mt-2 block break-all text-body text-[color:var(--color-text-tertiary)]">src/payments/</code>
    </div>}
    items={roles.map(({ id, Icon }) => ({id, title:t(`roles.${id}.title`),caption:id==='instructions'?'AGENTS.md':t(`roles.${id}.example`),label:t(`roles.${id}.buttonLabel`),explanation:t(`roles.${id}.setup`),visual:<span data-relationship-port className="flex h-full w-full items-center justify-center"><Icon size={ICON_SIZE.md} strokeWidth={1.5} /></span>}))} />;
}
