'use client';

import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDataSourceMode, useLocalVault } from '@/entities/vault-session';
import { withBasePath } from '@/shared/lib/base-path';
import { ChromeTile, Dialog, RouteLoadingFallback, RowButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { growthProgress, growthProjectKey, growthTargets } from '../model/companion-growth';
import { useCompanionGrowth } from '../model/use-companion-growth';
import { useCompanionJournal } from '../model/use-companion-journal';
import { AgentMascotPresence } from './AgentMascotPresence';
import type { GrowthDraft } from './CompanionStudy';
const CompanionGrowth = lazy(() => import('./CompanionGrowth').then(module => ({default: module.CompanionGrowth})));
import type { MemoryDraft } from './CompanionMemories';
import { CompanionRoom } from './CompanionRoom';
import styles from './companion-home.module.css';

/** The existing entry stays put; all new interaction lives inside this home. */
export function CompanionHome({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('companion');
  const locale = useLocale();
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  const journal = useCompanionJournal();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft>({kind:'checked',keepsake:'book',note:''});
  const [growthDraft, setGrowthDraft] = useState<{project: string | null; draft: GrowthDraft}>({project:null,draft:{selectedUid:null,note:'',reflection:'learned'}});
  const docs = mode === 'local' && (vault.status === 'loaded' || vault.isReloadingSameVault) ? vault.manifest?.docs : undefined;
  const project = useMemo(() => open && docs ? growthProjectKey(docs) : null, [open, docs]);
  const targets = useMemo(() => open && docs ? growthTargets(docs, locale) : [], [open, docs, locale]);
  const store = useCompanionGrowth(project);
  const progress = growthProgress(store.growth);
  const projectDoc = docs?.find(doc => doc.frontmatter.kind === 'project');
  const projectDisplay = projectDoc?.frontmatter[`display_${locale}`];
  const projectName = typeof projectDisplay === 'string' ? projectDisplay : projectDoc?.title ?? vault.handle?.name ?? '';
  const latest = journal.journal.memories[0];
  const show = () => setOpen(true);
  const close = () => setOpen(false);
  return <>
    {compact ? (
      // The compact trigger lives in the map's top toolbar, so it wears the toolbar's
      // tile (36px, chrome surface and border) instead of a bare 28px icon button:
      // the one control in that row that did not share the row's box (2026-09-24).
      <ChromeTile
        title={t('open')}
        onClick={show}
        className="relative"
        data-testid="companion-trigger"
        icon={
          <span className={styles.workPose} aria-hidden="true">
            <span className={styles.idle} style={{ backgroundImage: `url(${withBasePath('/brand/mascot-compact.png')})` }} />
            <AgentMascotPresence inline />
          </span>
        }
      />
    ) : (
      <RowButton onClick={show} data-testid="companion-home" className="w-full">
        <span className={styles.homeRow}>
          <CompanionRoom stage={progress.stage} />
          <span className="min-w-0 text-left">
            <span className="block text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{t('home')}</span>
            <span className="mt-1 block truncate text-label text-[color:var(--color-text-secondary)]">{latest ? latest.note : t('emptyHome')}</span>
          </span>
          <ChevronRight size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" />
        </span>
      </RowButton>
    )}
    <Dialog open={open} onClose={close} labelledBy={`${id}-title`} initialFocus="first" size="viewport" testId="companion-journal" className={`my-[var(--chrome-inset)] flex h-[min(var(--dialog-max-h),calc(100dvh-var(--chrome-inset)*2))] max-w-[calc(var(--dialog-w-md)*2)] flex-col overflow-hidden p-0 ${styles.homeDialog}`}>
      <h2 id={`${id}-title`} className="sr-only">{t('title')}</h2>
      <Suspense fallback={<RouteLoadingFallback embedded/>}>
      {open ? <CompanionGrowth key={project ?? 'none'} growth={store.growth} targets={targets} docs={docs ?? []} manifest={vault.manifest} projectKey={project} active={open} projectName={projectName} available={project !== null} unreadable={store.unreadable} failed={store.failed} record={store.record} reset={store.reset} revise={store.revise} close={close} openFolder={() => {close();void vault.open();}} draft={growthDraft.project===project?growthDraft.draft:{selectedUid:null,note:'',reflection:'learned'}} onDraft={draft=>setGrowthDraft({project,draft})} memoryDraft={memoryDraft} onMemoryDraft={setMemoryDraft}/> : null}
      </Suspense>
    </Dialog>
  </>;
}
