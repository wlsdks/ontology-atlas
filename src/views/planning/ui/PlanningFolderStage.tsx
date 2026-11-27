'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CircleHelp, CloudDownload, FilePlus, FileUp, FolderOpen, FolderPlus, LockKeyhole } from 'lucide-react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { Button, FeatureStage, IconButton } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { Tooltip } from '@/shared/ui/hints/tooltip';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PlanningSourceArtwork } from './PlanningSourceArtwork';
import { usePlanningTitle } from './PlanningDraftRow';

type FirstDocumentDoor = {
  kind: 'first-document';
  folder: string;
  creating: boolean;
  failed: boolean;
  onCreate: (title: string) => void;
  onAddFiles: (() => void) | null;
  adding: boolean;
  onImport: () => void;
  readScope: ReactNode;
};

type PlanningDoor =
  | { kind: 'create'; folder: string; onCreate: () => void; onChoose: (() => void) | null; failed: boolean; creating: boolean }
  | FirstDocumentDoor
  | { kind: 'choose'; onChoose: () => void; unavailable: boolean }
  | { kind: 'unsupported' };

const ALERT_CLASS = 'mt-4 text-body text-[color:var(--color-text-primary)]';

const SWAP_IN = 'motion-swap-in';

function useStageGlide(door: string) {
  const reduced = usePrefersReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const drawn = useRef<{ door: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const node = host.current;
    const section = node?.querySelector<HTMLElement>('[data-feature-stage]');
    if (!node || !section) return;
    const previous = drawn.current;
    drawn.current = { door, top: section.offsetTop };
    if (reduced || !previous || previous.door === door || previous.top === section.offsetTop) return;
    node.style.transition = 'none';
    node.style.transform = `translateY(${previous.top - section.offsetTop}px)`;
    void node.offsetHeight;
    node.style.transition = 'transform var(--motion-base) var(--motion-ease)';
    node.style.transform = '';
    const settle = (event: TransitionEvent) => {
      if (event.target !== node || event.propertyName !== 'transform') return;
      node.style.transition = '';
      node.removeEventListener('transitionend', settle);
    };
    node.addEventListener('transitionend', settle);
  });
  useEffect(() => {
    const remeasure = () => {
      const section = host.current?.querySelector<HTMLElement>('[data-feature-stage]');
      if (section && drawn.current) drawn.current = { ...drawn.current, top: section.offsetTop };
    };
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);
  return host;
}

function FirstDocumentAction({ door }: { door: FirstDocumentDoor }) {
  const t = useTranslations('planning');
  const { field, submit, submittable } = usePlanningTitle({ busy: door.creating, failed: door.failed, onSubmit: door.onCreate });
  // Wrapping, not a breakpoint, stacks the field over the button once the stage column is narrower than both.
  return <div className="flex w-full max-w-md flex-col items-center gap-3">
    <div className="flex w-full flex-wrap items-start gap-2">
      <Input {...field} size="lg" data-planning-first-title className="w-64 min-w-0 grow text-left" />
      <Button data-planning-first-create disabled={!submittable} onClick={submit} className="max-sm:grow"><FilePlus size={ICON_SIZE.lg} aria-hidden />{t('createDocument')}</Button>
    </div>
    <div className="flex flex-wrap justify-center gap-1">
      {door.onAddFiles && <Button variant="ghost" data-planning-stage-add disabled={door.adding} onClick={door.onAddFiles}><FileUp size={ICON_SIZE.sm} aria-hidden />{t('addFiles')}</Button>}
      <Button variant="ghost" data-planning-stage-import title={t('importServiceHint')} onClick={door.onImport}><CloudDownload size={ICON_SIZE.sm} aria-hidden />{t('importService')}</Button>
    </div>
  </div>;
}

export function PlanningFolderStage({ door }: { door: PlanningDoor }) {
  const t = useTranslations('planning');
  const host = useStageGlide(door.kind);
  const stage = { 'data-testid': 'planning-stage', artWidth: 'wide' as const, art: (state: Parameters<typeof PlanningSourceArtwork>[0]) => <PlanningSourceArtwork {...state} /> };

  // Every door renders the one FeatureStage below, so a door change keeps the stage and its artwork mounted.
  const parts: { state: string; title: string; body: string; alert?: ReactNode; action?: ReactNode; note?: ReactNode } =
    door.kind === 'create' ? {
      state: 'no-home',
      title: t('startTitle'),
      body: t('homeStartBody'),
      alert: door.failed ? <p role="alert" className={ALERT_CLASS}>{t('createFailed')}</p> : undefined,
      action: <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" data-planning-create disabled={door.creating} onClick={door.onCreate}><FolderPlus size={ICON_SIZE.lg} aria-hidden />{t('createHome')}</Button>
        {door.onChoose && <Button size="lg" variant="ghost" data-planning-choose onClick={door.onChoose}><FolderOpen size={ICON_SIZE.lg} aria-hidden />{t('chooseAnother')}</Button>}
      </div>,
      note: <span data-planning-home-note>{t('homeNote', { folder: door.folder })}</span>,
    }
    : door.kind === 'first-document' ? {
      state: 'empty-home',
      title: t('firstDocumentTitle'),
      body: t('firstDocumentBody'),
      action: <FirstDocumentAction door={door} />,
      note: door.readScope ?? <span data-planning-home-note>{t('firstDocumentNote', { folder: door.folder })}</span>,
    }
    : door.kind === 'choose' ? {
      state: 'no-folder',
      title: t('startTitle'),
      body: t('startBody'),
      alert: door.unavailable ? <p role="alert" className={ALERT_CLASS}>{t('folderUnavailable')}</p> : undefined,
      action: <Button size="lg" data-planning-choose onClick={door.onChoose}><FolderOpen size={ICON_SIZE.lg} aria-hidden />{t('chooseFolder')}</Button>,
    }
    : {
      state: 'unsupported',
      title: t('startTitle'),
      body: t('folderPickerMacOnly'),
    };
  const readOnlyNote = <>
    <LockKeyhole size={ICON_SIZE.sm} aria-hidden /><span>{t('readOnly')}</span>
    <Tooltip side="bottom" align="center" toggleOnPress panelClassName="w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words text-left"
      content={<div className="space-y-2 text-body"><p>{t('chooseBody')}</p><p>{t('limits')}</p></div>}
    ><IconButton label={t('details')} size="md" hoverInk="strong" className="atlas-touch-floor atlas-touch-floor-wide"><CircleHelp size={ICON_SIZE.lg} aria-hidden /></IconButton></Tooltip>
  </>;
  const note = parts.note ?? (door.kind === 'choose' || door.kind === 'unsupported' ? readOnlyNote : undefined);

  return <div ref={host} className="flex flex-1 flex-col">
    <FeatureStage
      {...stage}
      data-planning-state={parts.state}
      title={<span key={door.kind} className={`${SWAP_IN} block`}>{parts.title}</span>}
      body={<span key={door.kind} className={`${SWAP_IN} block`}>{parts.body}</span>}
      alert={parts.alert}
      action={parts.action && <div key={door.kind} className={`${SWAP_IN} flex w-full justify-center`}>{parts.action}</div>}
      note={note && <div key={door.kind} className={`${SWAP_IN} flex flex-wrap items-center justify-center gap-2`}>{note}</div>}
    />
  </div>;
}
