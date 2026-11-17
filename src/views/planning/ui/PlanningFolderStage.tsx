'use client';

import { useTranslations } from 'next-intl';
import { CircleHelp, FolderOpen, FolderPlus, LockKeyhole } from 'lucide-react';
import { Button, FeatureStage, GetAppLink, IconButton } from '@/shared/ui';
import { Tooltip } from '@/shared/ui/hints/tooltip';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PlanningSourceArtwork } from './PlanningSourceArtwork';

type PlanningDoor =
  | { kind: 'create'; folder: string; onCreate: () => void; onChoose: (() => void) | null; failed: boolean; creating: boolean }
  | { kind: 'choose'; onChoose: () => void; unavailable: boolean }
  | { kind: 'unsupported'; offersApp: boolean };

const ALERT_CLASS = 'mt-4 text-body text-[color:var(--color-text-primary)]';

export function PlanningFolderStage({ door }: { door: PlanningDoor }) {
  const nav = useTranslations('navRail');
  const t = useTranslations('planning');
  const stage = { 'data-testid': 'planning-stage', artWidth: 'wide' as const, art: (state: Parameters<typeof PlanningSourceArtwork>[0]) => <PlanningSourceArtwork {...state} />, title: t('startTitle') };

  if (door.kind === 'create') return <FeatureStage
    {...stage}
    data-planning-state="no-home"
    body={t('homeStartBody')}
    alert={door.failed ? <p role="alert" className={ALERT_CLASS}>{t('createFailed')}</p> : undefined}
    action={<div className="flex flex-wrap items-center justify-center gap-3">
      <Button size="lg" data-planning-create disabled={door.creating} onClick={door.onCreate}><FolderPlus size={ICON_SIZE.lg} aria-hidden />{t('createHome')}</Button>
      {door.onChoose && <Button size="lg" variant="ghost" data-planning-choose onClick={door.onChoose}><FolderOpen size={ICON_SIZE.lg} aria-hidden />{t('chooseAnother')}</Button>}
    </div>}
    note={<span data-planning-home-note>{t('homeNote', { folder: door.folder })}</span>}
  />;

  const choose = door.kind === 'choose';
  return <FeatureStage
    {...stage}
    data-planning-state={choose ? 'no-folder' : 'unsupported'}
    body={t(choose ? 'startBody' : 'browserUnavailable')}
    alert={choose && door.unavailable ? <p role="alert" className={ALERT_CLASS}>{t('folderUnavailable')}</p> : undefined}
    action={choose
      ? <Button size="lg" data-planning-choose onClick={door.onChoose}><FolderOpen size={ICON_SIZE.lg} aria-hidden />{t('chooseFolder')}</Button>
      : door.offersApp ? <GetAppLink data-testid="planning-get-app">{nav('getApp')}</GetAppLink> : undefined}
    note={<>
      <LockKeyhole size={ICON_SIZE.sm} aria-hidden /><span>{t('readOnly')}</span>
      <Tooltip side="bottom" align="center" toggleOnPress panelClassName="w-72 max-w-[calc(100vw-2rem)] whitespace-normal break-words text-left"
        content={<div className="space-y-2 text-body"><p>{t('chooseBody')}</p><p>{t('limits')}</p></div>}
      ><IconButton label={t('details')} size="md" hoverInk="strong" className="atlas-touch-floor atlas-touch-floor-wide"><CircleHelp size={ICON_SIZE.lg} aria-hidden /></IconButton></Tooltip>
    </>}
  />;
}
