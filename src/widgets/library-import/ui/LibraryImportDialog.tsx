'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink } from 'lucide-react';

import { Button, Chip, Dialog, ServiceMark, resolveServiceMark } from '@/shared/ui';
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
 * **"Bring documents from a service" — the door in the Library, in the person's words.**
 *
 * Owner, 2026-09-07: *"it has to be really easy to use, or nobody will. Connecting a service is
 * mostly for the Library anyway."* So this surface never says MCP, stdio, npx or environment
 * variable. It says Notion, and it says what will happen next.
 *
 * The technical dialog on `/mcp` is unchanged and is reachable from here as the last tile, for a
 * service this list does not know. Two doors onto one mechanism, because two different people
 * arrive: one who came to configure, and one who came to fetch their own notes.
 *
 * ## What is proven here and what is not
 *
 * Step one is complete: the descriptor is written into the folder and switched on, and the screen
 * says what will open next and who holds what comes back.
 *
 * Steps two and three hand a **bounded brief** to the Library's existing agent turn, which is
 * where the fetching and the picking actually happen, because Atlas is not the MCP client and has
 * no way to call the service's tools or receive their result as data. Every file the agent writes
 * lands through the permission card that already exists. What has **not** been observed end to
 * end is a real service answering — nothing here could reach Notion — so the copy says where the
 * choosing happens rather than promising a list this dialog will draw.
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
  testIdPrefix = 'library-import',
}: {
  open: boolean;
  onClose: () => void;
  onAttach: (connector: ConnectorRecord) => Promise<ConnectorWriteResult | null>;
  onBrief: (brief: string) => void;
  onOpenAdvanced: () => void;
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
        // The escape hatch is not a step of this flow; it is the other door. Closing first means
        // two blocking surfaces never stand at once, which `.claude/rules/design.md` forbids.
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
     * The token goes in **after** the row is on disk, for the same reason the connector dialog
     * does it in that order: a value stored against a row that then failed to write is a value on
     * this machine that nothing on screen points at.
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
      <h2
        id={`${testIdPrefix}-title`}
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t('title')}
      </h2>

      {step === 'pick' ? (
        <>
          <p className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t('pickBody')}
          </p>
          <ul
            data-testid={`${testIdPrefix}-services`}
            /*
             * Equal-height tiles in one grid: `.claude/rules/forbidden.md` refuses repeated cards
             * whose heights differ only because their copy lengths do, and these sentences differ
             * by a line.
             */
            className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
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
            **Who holds what comes back, said before the press.** The sign-in window belongs to the
            coding agent; Atlas neither opens it nor keeps the result, and removing the row later
            does not revoke anything. Leaving that unsaid would be Atlas taking credit for custody
            it does not have (PO steward, 2026-09-07).
          */}
          <p className="mt-2 max-w-prose break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {ask.kind === 'browser' ? t('connectBrowserWho') : t('connectTokenWho')}
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
            ⚠️ **Where the picking happens, said plainly.** Atlas cannot draw the list: it is not
            the MCP client, so it can neither call the service's tools nor receive their result as
            data. The choosing happens in the conversation that opens next, where the results
            actually are — and saying that is better than a screen implying a list will appear
            here and then not producing one.
          */}
          <p className="mt-2 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {t('whatNext', { limit: DEFAULT_IMPORT_LIMIT, folder: service.folder })}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep('connect')}>
              {t('back')}
            </Button>
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
          </div>
        </>
      ) : null}

      {step === 'pick' ? (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={close}>
            {t('close')}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
