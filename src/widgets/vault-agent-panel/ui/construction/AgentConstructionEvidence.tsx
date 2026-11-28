import { useTranslations } from 'use-intl';

import { AGENT_DOCK_INSET_SURFACE_CLASS, Chip } from '@/shared/ui';

import type { useVaultAgent } from '../../model/use-vault-agent';

type Construction = NonNullable<ReturnType<typeof useVaultAgent>['construction']>;

/** What the construction run read and could not accept, so a person can judge it before applying. */
export function AgentConstructionEvidence({
  construction,
  onRunAgain,
}: {
  construction: Construction;
  onRunAgain: () => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  return (
    <div data-testid="construction-evidence" className={`${AGENT_DOCK_INSET_SURFACE_CLASS} space-y-2`}>
      <p className="text-label">{construction.status === 'running' ? t('thinking') : construction.status === 'stopped' ? t('notice.aborted') : t(`construction.${construction.status}`)}</p>
      <p className="break-all text-label">{construction.preview.sourcePath} · {construction.sourceBytes} B</p>
      {construction.reads.map((read, index) => <p key={`${index}:${read.path}:${read.startLine}`} className="break-all text-caption">{read.path}:{read.startLine}-{read.endLine} · {read.bytes} B · {read.fullFileSha256}{!read.fileComplete ? ' …' : ''}</p>)}
      {construction.issues.map((issue, index) => <p key={`${index}:${issue.code}:${issue.target}`} className="break-all text-caption">{issue.target} · {issue.code}</p>)}
      {construction.preview.excluded.map((reason, index) => <p key={`${index}:${reason}`} className="break-all text-caption">{reason}</p>)}
      {construction.status === 'sourceChanged' || construction.status === 'failed' || construction.status === 'incomplete' ? <Chip onClick={onRunAgain}>{t('construction.runAgain')}</Chip> : null}
    </div>
  );
}
