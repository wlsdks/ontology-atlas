'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink, X } from 'lucide-react';

import { Button, Chip, Dialog, IconButton, ServiceMark, resolveServiceMark } from '@/shared/ui';
import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { Input } from '@/shared/ui/input';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { connectorSecretRef, connectorSecretSet } from '@/shared/lib/tauri-connector-secrets';
import {
  resolveConnectorRuntimes,
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/tauri-connector-runtimes';
import type { ConnectorRecord } from '@/shared/lib/connector-record';
import type { ConnectorWriteResult } from '@/shared/lib/connector-store';
import { serviceVariant } from '../model/import-flow';

import {
  DEFAULT_IMPORT_LIMIT,
  IMPORT_SERVICES,
  buildImportBrief,
  importConnector,
  serviceAsk,
  serviceEntry,
  type ImportService,
  type ImportServiceId,
  type ImportStep,
} from '../model/import-flow';

/**
 * The Library's door for bringing documents from a service, in the person's words, never MCP,
 * stdio, npx or environment variable; the technical `/mcp` dialog is the last tile. Step one writes
 * the connector and switches it on; steps two and three hand a bounded brief to the Library's agent
 * turn, where fetching and picking happen because Atlas is not the MCP client.
 */
export function LibraryImportDialog({
  open,
  onClose,
  /** Writes the connector row into the folder. The Library view hands its store's `upsert` in. */
  onAttach,
  /** Hands the finished brief to the Library's agent turn. */
  onBrief,
  /** Opens the technical dialog for a service this list does not know. */
  onOpenAdvanced,
  /**
   * Whether an in-app conversation can start here; when it cannot, the last press is not offered
   * rather than doing nothing.
   */
  canRunAgent,
  /**
   * Why it cannot: a browser starts no program, while the app may simply have no verified coding
   * tool yet; the remedies differ (`/download/` versus the runtimes screen).
   */
  agentGap,
  testIdPrefix = 'library-import',
}: {
  open: boolean;
  onClose: () => void;
  onAttach: (connector: ConnectorRecord) => Promise<ConnectorWriteResult | null>;
  onBrief: (brief: string) => void;
  onOpenAdvanced: () => void;
  canRunAgent: boolean;
  agentGap: 'browser' | 'runtime';
  testIdPrefix?: string;
}) {
  const t = useTranslations('libraryImport');
  const [step, setStep] = useState<ImportStep>('pick');
  const [serviceId, setServiceId] = useState<ImportServiceId | null>(null);
  const [token, setToken] = useState('');
  const [what, setWhat] = useState('');
  const [failed, setFailed] = useState(false);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<ResolvedRuntime[] | null>(null);

  const service = useMemo(
    () => IMPORT_SERVICES.find((candidate) => candidate.id === serviceId) ?? null,
    [serviceId],
  );
  const entry = service ? serviceEntry(service) : null;
  const ask = service ? serviceAsk(service) : null;

  const reset = useCallback(() => {
    setStep('pick');
    setServiceId(null);
    setToken('');
    setWhat('');
    setFailed(false);
    setConnectedName(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const pick = useCallback(
    (next: ImportService) => {
      if (next.connect === 'manual') {
        // The escape hatch is the other door. Closing first means two blocking surfaces never stand
        // at once, which `.claude/rules/design.md` forbids.
        close();
        onOpenAdvanced();
        return;
      }
      setServiceId(next.id);
      setStep('connect');
      setFailed(false);
      // Only a local program needs a path resolved, and only then is it worth asking.
      void resolveConnectorRuntimes().then(setRuntimes);
    },
    [close, onOpenAdvanced],
  );

  const connect = useCallback(async () => {
    if (!service || !entry) return;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `c${Date.now().toString(36)}`;
    const variant = serviceVariant(entry);
    const record = importConnector(service, {
      id,
      runtimePath: variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null,
      secretRef: connectorSecretRef,
    });
    if (!record) return;
    const result = await onAttach(record);
    if (result?.status !== 'saved') {
      setFailed(true);
      return;
    }
    /*
     * The token is stored only after the row is on disk, or a failed write leaves a stored value
     * nothing on screen points at.
     */
    if (ask?.kind === 'token' && token.trim()) {
      await connectorSecretSet(connectorSecretRef(id, ask.name), token.trim()).catch(() => null);
    }
    setToken('');
    setConnectedName(record.name);
    setFailed(false);
    setStep('choose');
  }, [ask, entry, onAttach, runtimes, service, token]);

  const bring = useCallback(() => {
    if (!service) return;
    const brief = buildImportBrief({
      serviceLabel: t(`service.${service.id}.title` as 'service.notion.title'),
      connectorName: connectedName ?? service.id,
      folder: service.folder,
      request: { what, limit: DEFAULT_IMPORT_LIMIT },
    });
    onBrief(brief);
    close();
  }, [close, connectedName, onBrief, service, t, what]);

  return (
    <Dialog
      open={open}
      onClose={close}
      size="md"
      labelledBy={`${testIdPrefix}-title`}
      testId={`${testIdPrefix}-dialog`}
      className="max-h-[min(80vh,var(--dialog-max-h))] overflow-y-auto"
    >
      {/* Close is the corner control, as on every other dialog; Escape and the scrim do the same. */}
      <div className="flex items-start justify-between gap-3">
        <h2
          id={`${testIdPrefix}-title`}
          className="min-w-0 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t('title')}
        </h2>
        <IconButton
          label={t('close')}
          size="sm"
          tone="muted"
          data-testid={`${testIdPrefix}-close`}
          className="-mr-1 -mt-1 shrink-0"
          onClick={close}
        >
          <X size={ICON_SIZE.lg} aria-hidden />
        </IconButton>
      </div>

      {step === 'pick' ? (
        <>
          <p className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t('pickBody')}
          </p>
          <ul
            data-testid={`${testIdPrefix}-services`}
            /*
             * Equal-height tiles: `.claude/rules/forbidden.md` refuses cards whose heights differ
             * only by copy length.
             */
            /*
             * `auto-rows-fr`: one track height for every tile, including a last tile alone on its
             * row (`.claude/rules/forbidden.md`).
             */
            className="mt-3 grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {IMPORT_SERVICES.map((candidate) => (
              <li key={candidate.id} className="min-w-0">
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-service`}
                  data-service={candidate.id}
                  onClick={() => pick(candidate)}
                  className={controlClass({
                    shape: 'card',
                    tone: 'secondary',
                    hoverSurface: 'lift',
                    hoverBorder: 'strong',
                    className: 'h-full w-full flex-col items-start gap-1 px-3 py-2.5 text-left',
                  })}
                >
                  <span className="flex items-center gap-2">
                    <ServiceMark
                      mark={resolveServiceMark(candidate.id, '')}
                      className="text-[color:var(--color-text-tertiary)]"
                    />
                    <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                      {t(`service.${candidate.id}.title` as 'service.notion.title')}
                    </span>
                  </span>
                  <span className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                    {t(`service.${candidate.id}.body` as 'service.notion.body')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/*
           * Google Drive is not a tile: every Drive MCP needs a self-made OAuth client, so this
           * says why and names the path that works.
           */}
          <p
            data-testid={`${testIdPrefix}-absent-note`}
            className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
            {t('absentNote')}
          </p>
        </>
      ) : null}

      {step === 'connect' && service && ask ? (
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
              ? t('connectBrowser', {
                  service: t(`service.${service.id}.title` as 'service.notion.title'),
                })
              : t('connectToken', {
                  service: t(`service.${service.id}.title` as 'service.notion.title'),
                })}
          </p>
          {/*
           * Says before the press who holds what comes back: the sign-in belongs to the coding
           * agent, and removing the row revokes nothing.
           */}
          <p className="mt-2 max-w-prose break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {ask.kind === 'browser' ? t('connectBrowserWho') : t('connectTokenWho')}
            {/* Links the service's own page, where access is actually revoked. */}
            {entry ? (
              <>
                {' '}
                <a
                  href={entry.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`${testIdPrefix}-revoke`}
                  className={controlClass({ shape: 'link', tone: 'accent', className: 'text-label' })}
                >
                  <span aria-hidden data-external-link-marker>
                    ↗
                  </span>
                  {t('revokeWhere', {
                    service: t(`service.${service.id}.title` as 'service.notion.title'),
                  })}
                </a>
              </>
            ) : null}
          </p>
          {ask.kind === 'token' ? (
            <>
              <Input
                label={t('tokenLabel')}
                size="md"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                data-testid={`${testIdPrefix}-token`}
                onChange={(event) => setToken(event.target.value)}
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
                    className: 'mt-2 text-label',
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
              {t('connectFailed')}
            </p>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep('pick')}>
              {t('back')}
            </Button>
            <Chip
              size="lg"
              tone="accentOnTint"
              data-testid={`${testIdPrefix}-connect`}
              disabled={ask.kind === 'token' && !token.trim()}
              onClick={() => void connect()}
              className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
            >
              {t('connectAction')}
            </Chip>
          </div>
        </>
      ) : null}

      {step === 'choose' && service ? (
        <>
          <p
            data-testid={`${testIdPrefix}-step`}
            data-step="choose"
            className="mt-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {t('stepOf', { step: 2, total: 3 })}
          </p>
          <p
            data-testid={`${testIdPrefix}-connected`}
            className="mt-1 flex items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            <Check
              size={ICON_SIZE.sm}
              aria-hidden
              className="text-[color:var(--color-status-success)]"
            />
            {t('connected', {
              service: t(`service.${service.id}.title` as 'service.notion.title'),
            })}
          </p>
          <Input
            label={t('whatLabel')}
            size="md"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={what}
            placeholder={t(`service.${service.id}.example` as 'service.notion.example')}
            data-testid={`${testIdPrefix}-what`}
            onChange={(event) => setWhat(event.target.value)}
            className="mt-3 w-full"
          />
          {/*
           * Atlas cannot draw the result list (it is not the MCP client), so this says the choosing
           * happens in the conversation.
           */}
          {/* Both describe the conversation, so neither is drawn where one cannot start. */}
          {canRunAgent ? (
            <p className="mt-2 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
              {t('whatNext', { limit: DEFAULT_IMPORT_LIMIT, folder: service.folder })}
            </p>
          ) : null}
          {/*
           * `connectorAcpServers` hands connectors only to runtimes with a measured permission path
           * (Claude today); without this line a Codex user's agent silently has no service tools.
           */}
          {canRunAgent ? (
            <p
              data-testid={`${testIdPrefix}-runtime`}
              className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
            >
              {t('whatRuntime')}
            </p>
          ) : null}
          {canRunAgent ? null : (
            /*
             * The degradation contract: why it cannot happen here, and that the connection is saved
             * and on for any coding tool on this folder.
             */
            <div
              role="status"
              data-testid={`${testIdPrefix}-no-agent`}
              className="mt-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
            >
              <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t('noAgentTitle')}
              </p>
              <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                {agentGap === 'browser' ? t('noAgentBodyWeb') : t('noAgentBodyRuntime')}
              </p>
              <Link
                href={agentGap === 'browser' ? '/download/' : DESTINATION_HREF.agents}
                data-testid={`${testIdPrefix}-no-agent-app`}
                className={controlClass({
                  shape: 'link',
                  tone: 'accent',
                  className: 'mt-2 text-label font-[var(--font-weight-signature)]',
                })}
              >
                {agentGap === 'browser' ? t('noAgentGetApp') : t('noAgentSeeRuntimes')}
              </Link>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep('connect')}>
              {t('back')}
            </Button>
            {canRunAgent ? (
              <Chip
                size="lg"
                tone="accentOnTint"
                data-testid={`${testIdPrefix}-bring`}
                onClick={bring}
                className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
              >
                <ExternalLink size={ICON_SIZE.sm} aria-hidden />
                {t('bringAction')}
              </Chip>
            ) : null}
          </div>
        </>
      ) : null}

    </Dialog>
  );
}
