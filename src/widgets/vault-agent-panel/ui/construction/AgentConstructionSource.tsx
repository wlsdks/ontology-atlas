'use client';

import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { AGENTS_MODELS_HREF } from '@/shared/config/destinations';
import type { LocalEndpointSettings } from '@/shared/lib/llm-connection/local-endpoint';
import { AGENT_DOCK_INSET_SURFACE_CLASS, Chip, Surface } from '@/shared/ui';

import type { ConstructionSourceSelection } from '../../model/construction-source';

/**
 * The entry to building the ontology from a source folder: the action, then a preview a person
 * confirms before anything runs. `held` is the selection kept through the exit animation, so the
 * surface does not collapse around an empty box.
 */
export function AgentConstructionSource({
  bridgeAvailable,
  hasVault,
  busy,
  running,
  selection,
  held,
  localEndpoint,
  providerHost,
  onChoose,
  onCancel,
  onRun,
}: {
  bridgeAvailable: boolean;
  hasVault: boolean;
  /** The agent is running or applying: the action is disabled. */
  busy: boolean;
  running: boolean;
  selection: ConstructionSourceSelection | null;
  held: ConstructionSourceSelection | null;
  localEndpoint: LocalEndpointSettings | null;
  providerHost: string;
  onChoose: () => void;
  onCancel: () => void;
  onRun: () => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  const router = useRouter();
  return (
    <>
      {!bridgeAvailable ? <p className="text-label text-[color:var(--color-text-secondary)]">{t('construction.webUnavailable')}</p> : hasVault ? (
        <>
          <Chip data-testid="construction-action" disabled={busy}
            title={running ? t('stop') : t('construction.action')} onClick={onChoose}>
            {t('construction.action')}
          </Chip>
          <p className="text-label text-[color:var(--color-text-secondary)]">{t('construction.boundary')}</p>
        </>
      ) : null}
      <Surface open={selection !== null} origin="top left" className={`${AGENT_DOCK_INSET_SURFACE_CLASS} space-y-3`} data-testid="construction-preview">
        {held?.status === 'preparing' ? <p role="status" className="text-label">{t('construction.preparing')}</p> : null}
        {held?.status === 'localRequired' ? <>
          <p role="status" className="text-label">{t('construction.localRequired')}</p>
          <Chip onClick={() => router.push(AGENTS_MODELS_HREF)}>{t('construction.modelsAction')}</Chip>
        </> : null}
        {held?.status === 'sourceChanged' ? <p role="alert" className="text-label">{t('construction.sourceChanged')}</p> : null}
        {held?.status === 'preview' && held.preview ? <>
          <h3 className="text-label font-[var(--font-weight-strong)]">{t('construction.previewTitle')}</h3>
          <p className="whitespace-pre-wrap break-all text-label">{t('construction.previewBody', {
            sourcePath: held.preview.sourcePath, destinationPath: held.preview.destinationPath,
            model: localEndpoint?.model ?? '', endpoint: localEndpoint?.baseUrl ?? '', count: held.preview.files.length,
          })}</p>
          <p className="text-label">{t('construction.scope')}</p>
          <p className="text-label">{t('scope.body', { provider: t('provider.local'), host: providerHost })}</p>
          <p className="text-label">{t('scope.consent')}</p>
          {held.preview.limited ? <p className="text-label">{t('construction.inventoryLimited')}</p> : null}
          {held.preview.excluded.length ? <ul className="space-y-1 text-label">{held.preview.excluded.map((reason, index) => <li key={`${index}:${reason}`} className="break-all">{reason}</li>)}</ul> : null}
          {!held.preview.files.length ? <p id="construction-empty" className="text-label">{t('construction.empty')}</p> : null}
          <Chip data-testid="construction-run" tone="onAccent" disabled={!held.preview.files.length}
            aria-describedby={!held.preview.files.length ? 'construction-empty' : undefined}
            title={!held.preview.files.length ? t('construction.empty') : t('construction.run')} onClick={onRun}>{t('construction.run')}</Chip>
        </> : null}
        <div className="flex flex-wrap gap-2">
          {held?.status !== 'preparing' && held?.status !== 'localRequired' ? <Chip data-testid="construction-choose-again" onClick={onChoose}>{t('construction.chooseAgain')}</Chip> : null}
          <Chip data-testid="construction-cancel" onClick={onCancel}>{t('proposal.cancel')}</Chip>
        </div>
      </Surface>
    </>
  );
}
