'use client';

import { useTranslations } from 'next-intl';
import { CircleHelp, FolderOpen, LockKeyhole } from 'lucide-react';
import { Button, FeatureStage, GetAppLink, IconButton } from '@/shared/ui';
import { Tooltip } from '@/shared/ui/hints/tooltip';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PlanningSourceArtwork } from './PlanningSourceArtwork';

type PlanningDoor =
  | { kind: 'choose'; onChoose: () => void; unavailable: boolean }
  | { kind: 'unsupported'; offersApp: boolean };

export function PlanningFolderStage({ door }: { door: PlanningDoor }) {
  const nav = useTranslations('navRail');
  const t = useTranslations('planning');
  const choose = door.kind === 'choose';

  return <FeatureStage
    data-testid="planning-stage"
    data-planning-state={choose ? 'no-folder' : 'unsupported'}
    art={({ engaged, reduced }) => <PlanningSourceArtwork active={engaged} reduced={reduced} imageLabel={t('designImages')} />}
    title={t('startTitle')}
    body={t(choose ? 'startBody' : 'browserUnavailable')}
    alert={choose && door.unavailable ? <p role="alert" className="mt-4 text-body text-[color:var(--color-text-primary)]">{t('folderUnavailable')}</p> : undefined}
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
