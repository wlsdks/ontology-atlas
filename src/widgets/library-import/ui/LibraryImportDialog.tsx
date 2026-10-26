'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink } from 'lucide-react';

import { Button, Chip, CloseButton, Dialog, ServiceMark, resolveServiceMark } from '@/shared/ui';
import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { Input } from '@/shared/ui/fields/input';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { connectorSecretRef, isConnectorSecretBridgeAvailable } from '@/shared/lib/connectors/tauri-connector-secrets';
import {
  resolveConnectorRuntimes,
  runtimePath,
} from '@/shared/lib/connectors/tauri-connector-runtimes';
import type { ConnectorSetup, SetupFailure, SetupInspection } from '@/shared/lib/connectors/connector-setup';
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

type LibraryImportProps = {
  open: boolean;
  onClose: () => void;
  setup: ConnectorSetup | null;
  onSetupSaved: () => void;
  onAddFiles: () => void;
  onBrief: (brief: string) => void;
  onOpenAdvanced: () => void;
  canRunAgent: boolean;
  agentGap: 'browser' | 'runtime';
  testIdPrefix?: string;
};

/** A completed service setup and all sensitive input belong to this captured folder session. */
export function LibraryImportDialog(props: LibraryImportProps) {
  return <LibraryImportFlow key={props.setup?.sessionId ?? 'browser'} {...props} />;
}

/** Save local service setup before asking an agent for a bounded document import. */
function LibraryImportFlow({
  open,
  onClose,
  setup,
  onSetupSaved,
  onAddFiles,
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
}: LibraryImportProps) {
  const t = useTranslations('libraryImport');
  const [step, setStep] = useState<ImportStep>('pick');
  const [serviceId, setServiceId] = useState<ImportServiceId | null>(null);
  const [token, setToken] = useState('');
  const [what, setWhat] = useState('');
  const [failed, setFailed] = useState<SetupFailure | 'setupRuntimeUnavailable' | null>(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [inspection, setInspection] = useState<SetupInspection | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const native = isConnectorSecretBridgeAvailable();
  const [connectedName, setConnectedName] = useState<string | null>(null);

  const serviceButtons = useRef(new Map<ImportServiceId, HTMLButtonElement>());
  const tokenField = useRef<HTMLInputElement>(null);
  const requestField = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const saveStatus = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    const target = step === 'connect' ? pending ? saveStatus.current : inspection?.hasSecret ? saveButton.current : tokenField.current
      : step === 'choose' ? requestField.current
        : serviceId ? serviceButtons.current.get(serviceId) : null;
    target?.focus({ preventScroll: true });
  }, [open, step, serviceId, pending, checking, inspection?.hasSecret]);

  const service = useMemo(
    () => IMPORT_SERVICES.find((candidate) => candidate.id === serviceId) ?? null,
    [serviceId],
  );
  const entry = service ? serviceEntry(service) : null;
  const ask = service ? serviceAsk(service) : null;
  const askName = ask?.kind === 'token' ? ask.name : null;

  const reset = useCallback(() => {
    generation.current += 1;
    saving.current = false;
    setPending(false);
    setChecking(false);
    setInspection(null);
    setStep('pick');
    setServiceId(null);
    setToken('');
    setWhat('');
    setFailed(null);
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
      setToken('');
      setChecking(true);
      setServiceId(next.id);
      setStep('connect');
      setFailed(null);

    },
    [close, onOpenAdvanced],
  );

  useEffect(() => {
    const attempt = ++generation.current;
    saving.current = false;
    if (!open || step !== 'connect' || !service || !entry || !askName || !native) return;
    const live = () => generation.current === attempt;
    void (async () => {
      await Promise.resolve();
      if (!live()) return;
      setPending(false);
      setInspection(null);
      setFailed(null);
      setChecking(true);
      if (!setup) { setFailed('setupFolderUnavailable'); setChecking(false); return; }
      const variant = serviceVariant(entry);
      const runtimes = variant.kind === 'local' ? await resolveConnectorRuntimes() : null;
      if (!live()) return;
      const path = variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null;
      if (variant.kind === 'local' && !path?.startsWith('/')) {
        setFailed('setupRuntimeUnavailable'); setChecking(false); return;
      }
      const result = await setup.inspect((id) => importConnector(service, {
        id, runtimePath: path, secretRef: connectorSecretRef,
      })!, askName, live);
      if (!live()) return;
      if (typeof result === 'string') setFailed(result);
      else setInspection(result);
      setChecking(false);
    })().catch(() => {
      if (live()) { setFailed('setupFolderUnavailable'); setChecking(false); }
    });
    return () => { generation.current += 1; };
  }, [open, step, service, entry, askName, native, setup, checkVersion]);

  const back = () => {
    generation.current += 1;
    saving.current = false;
    setPending(false);
    setToken('');
    setStep('pick');
  };
  const connect = async () => {
    if (!inspection && !checking && failed && failed !== 'setupConflict' && failed !== 'setupStopped' && failed !== 'setupRuntimeUnavailable') { setCheckVersion((version) => version + 1); return; }
    if (!setup || !inspection || ask?.kind !== 'token' || saving.current || checking) return;
    saving.current = true; // Synchronous admission, before React renders disabled.
    setPending(true);
    setFailed(null);
    const attempt = generation.current;
    const live = () => generation.current === attempt;
    const result = await setup.save(inspection, ask.name, token, live, () => { if (live()) setToken(''); });
    if (!live()) return;
    saving.current = false;
    setPending(false);
    if (!result.ok) { setFailed(result.error); return; }
    setConnectedName(result.record.name);
    onSetupSaved();
    setStep('choose');
  };

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
        <CloseButton
          label={t('close')}
          data-testid={`${testIdPrefix}-close`}
          className="-mr-2 -mt-1 shrink-0"
          onClick={close}
        />
      </div>

      {step === 'pick' ? (
        <>
          <p className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t('pickBody')}
          </p>
          <ul
            data-testid={`${testIdPrefix}-services`}
            className="mt-3 grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {IMPORT_SERVICES.map((candidate, index) => (
              <li
                key={candidate.id}
                className={cn('min-w-0', index === IMPORT_SERVICES.length - 1 && index % 2 === 0 && 'sm:col-span-2')}
              >
                <button
                  ref={(node) => {
                    if (node) serviceButtons.current.set(candidate.id, node);
                    else serviceButtons.current.delete(candidate.id);
                  }}
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
          {/* State this surface's limit and the file-import path, without claims about every provider. */}
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
          {!native ? (
            <div data-testid={`${testIdPrefix}-web-setup`} className="mt-3">
              <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t('webSetupTitle')}</p>
              <p className="mt-2 text-label leading-prose text-[color:var(--color-text-tertiary)]">{t('webSetupBody', { service: t(`service.${service.id}.title` as 'service.notion.title') })}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/download/" data-testid={`${testIdPrefix}-no-agent-app`} className={controlClass({ shape: 'link', tone: 'accent', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide' })}>{t('noAgentGetApp')}</Link>
                <Button className="atlas-touch-floor" onClick={() => { close(); onAddFiles(); }} data-testid={`${testIdPrefix}-add-files`}>{t('addFiles')}</Button>
              </div>
            </div>
          ) : <>
          <p className="mt-1 max-w-prose break-keep text-body leading-prose text-[color:var(--color-text-secondary)]">
            {ask.kind === 'browser'
              ? t('connectBrowser', {
                  service: t(`service.${service.id}.title` as 'service.notion.title'),
                })
              : t(inspection?.hasSecret ? 'resumeSetupBody' : 'connectToken', {
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
                  className={controlClass({ shape: 'link', tone: 'accent', className: 'atlas-touch-floor atlas-touch-floor-wide text-label' })}
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
          {checking || pending ? <p ref={saveStatus} tabIndex={-1} role="status" aria-live="polite" data-testid={`${testIdPrefix}-pending`} className="mt-3 text-label leading-prose text-[color:var(--color-text-tertiary)]">{t(checking ? 'checkingSetup' : 'savePendingBody', { service: t(`service.${service.id}.title` as 'service.notion.title') })}</p> : null}
          {inspection?.existing && !inspection.hasSecret && !failed && !pending ? <p className="mt-3 text-label leading-prose text-[color:var(--color-text-tertiary)]">{t('resumeSetupBody', { service: t(`service.${service.id}.title` as 'service.notion.title') })}</p> : null}
          {failed === 'setupRuntimeUnavailable' ? <Button className="atlas-touch-floor mt-2" onClick={() => { close(); onAddFiles(); }}>{t('addFiles')}</Button> : null}
          {failed || inspection?.existing ? <Button variant="ghost" className="atlas-touch-floor mt-2" onClick={() => { close(); onOpenAdvanced(); }}>{t('inspectSetup')}</Button> : null}
          </>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" className="atlas-touch-floor" onClick={back}>
              {t('back')}
            </Button>
            {native ? <Chip
              ref={saveButton}
              size="lg"
              tone="accentOnTint"
              data-testid={`${testIdPrefix}-connect`}
              aria-busy={pending}
              disabled={pending || checking || failed === 'setupConflict' || failed === 'setupStopped' || failed === 'setupRuntimeUnavailable' || (!inspection && !failed) || (!!inspection && !inspection.hasSecret && !token.trim())}
              onClick={() => void connect()}
              className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
            >
              {t(pending ? 'savePending' : failed ? 'retrySave' : inspection?.existing ? 'resumeSetup' : 'connectAction')}
            </Chip> : null}
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
            ref={requestField}
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
           * The helper `connectorAcpServers` hands connectors only to runtimes with a measured
           * permission path
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
             * A saved local setup is not proof of remote service access or a ready coding tool.
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
                  className: 'atlas-touch-floor atlas-touch-floor-wide mt-2 text-label font-[var(--font-weight-signature)]',
                })}
              >
                {agentGap === 'browser' ? t('noAgentGetApp') : t('noAgentSeeRuntimes')}
              </Link>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" className="atlas-touch-floor" onClick={() => setStep('connect')}>
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
