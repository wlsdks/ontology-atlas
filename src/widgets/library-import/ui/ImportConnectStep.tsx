'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';

import { Button, Chip } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { controlClass } from '@/shared/ui/control-class';
import type { CatalogueEntry } from '@/shared/config/mcp/mcp-catalogue';
import type { SetupInspection } from '@/shared/lib/connectors/connector-setup';
import type { ImportDestination } from '@/shared/lib/library-import/destination';

import {
  connectActionLabelKey,
  isConnectActionDisabled,
  type ImportAsk,
  type ImportService,
  type ImportSetupFailure,
} from '../model/import-flow';

export function ImportConnectStep({
  testIdPrefix,
  service,
  entry,
  ask,
  destination,
  inspection,
  failed,
  checking,
  pending,
  token,
  onTokenChange,
  tokenField,
  saveButton,
  saveStatus,
  onBack,
  onConnect,
  onAddFiles,
  onOpenAdvanced,
}: {
  testIdPrefix: string;
  service: ImportService;
  entry: CatalogueEntry | null;
  ask: ImportAsk;
  destination: ImportDestination;
  inspection: SetupInspection | null;
  failed: ImportSetupFailure | null;
  checking: boolean;
  pending: boolean;
  token: string;
  onTokenChange: (token: string) => void;
  tokenField: RefObject<HTMLInputElement | null>;
  saveButton: RefObject<HTMLButtonElement | null>;
  saveStatus: RefObject<HTMLParagraphElement | null>;
  onBack: () => void;
  onConnect: () => void;
  onAddFiles: () => void;
  onOpenAdvanced: () => void;
}) {
  const t = useTranslations('libraryImport');
  const serviceTitle = t(`service.${service.id}.title` as 'service.notion.title');
  const state = { inspection, failed, checking, pending, token };
  return (
    <>
      <p
        data-testid={`${testIdPrefix}-step`}
        data-step="connect"
        className="mt-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t('stepOf', { step: 1, total: 3 })}
      </p>
      <p className="mt-1 max-w-prose break-keep text-body leading-prose text-[color:var(--color-text-secondary)]">
        {ask.kind === 'browser'
          ? t('connectBrowser', { service: serviceTitle })
          : t(inspection?.hasSecret ? 'resumeSetupBody' : 'connectToken', { service: serviceTitle })}
      </p>
      {/* Says before the press who holds what comes back: the sign-in belongs to the coding agent, and removing the row revokes nothing. */}
      <p className="mt-2 max-w-prose break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-quaternary)]">
        {ask.kind === 'browser' ? t('connectBrowserWho') : t('connectTokenWho')}
        {entry ? (
          <>
            {' '}
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`${testIdPrefix}-revoke`}
              className={controlClass({ shape: 'link', tone: 'accent', className: 'atlas-touch-floor atlas-touch-floor-wide text-label' })}
            >
              <span aria-hidden data-external-link-marker>
                ↗
              </span>
              {t('revokeWhere', { service: serviceTitle })}
            </a>
          </>
        ) : null}
      </p>
      {ask.kind === 'token' && !inspection?.hasSecret ? (
        <>
          <Input
            ref={tokenField}
            label={t('tokenLabel')}
            size="md"
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            value={token}
            data-testid={`${testIdPrefix}-token`}
            onChange={(event) => onTokenChange(event.target.value)}
            className="mt-3 w-full"
          />
          {ask.issueUrl ? (
            <a
              href={ask.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`${testIdPrefix}-token-issue`}
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                className: 'atlas-touch-floor atlas-touch-floor-wide mt-2 text-label',
              })}
            >
              <span aria-hidden data-external-link-marker>
                ↗
              </span>
              {t('tokenWhere')}
            </a>
          ) : null}
        </>
      ) : null}
      {failed ? (
        <p
          role="alert"
          data-testid={`${testIdPrefix}-failed`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-danger)]"
        >
          {t(failed)}
        </p>
      ) : null}
      {checking || pending ? <p ref={saveStatus} tabIndex={-1} role="status" aria-live="polite" data-testid={`${testIdPrefix}-pending`} className="mt-3 text-label leading-prose text-[color:var(--color-text-tertiary)]">{t(checking ? 'checkingSetup' : 'savePendingBody', { service: serviceTitle })}</p> : null}
      {inspection?.existing && !inspection.hasSecret && !failed && !pending ? <p className="mt-3 text-label leading-prose text-[color:var(--color-text-tertiary)]">{t('resumeSetupBody', { service: serviceTitle })}</p> : null}
      {failed === 'setupRuntimeUnavailable' && destination === 'sources' ? <Button className="atlas-touch-floor mt-2" onClick={onAddFiles}>{t('addFiles')}</Button> : null}
      {failed || inspection?.existing ? <Button variant="ghost" className="atlas-touch-floor mt-2" onClick={onOpenAdvanced}>{t('inspectSetup')}</Button> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="atlas-touch-floor" onClick={onBack}>
          {t('back')}
        </Button>
        <Chip
          ref={saveButton}
          size="lg"
          tone="accent"
          data-testid={`${testIdPrefix}-connect`}
          aria-busy={pending}
          disabled={isConnectActionDisabled(state)}
          onClick={onConnect}
          className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
        >
          {t(connectActionLabelKey(state))}
        </Chip>
      </div>
    </>
  );
}
