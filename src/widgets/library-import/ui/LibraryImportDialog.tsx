'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CloseButton, Dialog } from '@/shared/ui';
import { connectorSecretRef } from '@/shared/lib/connectors/tauri-connector-secrets';
import {
  resolveConnectorRuntimes,
  runtimePath,
} from '@/shared/lib/connectors/tauri-connector-runtimes';
import type { ConnectorSetup, SetupInspection } from '@/shared/lib/connectors/connector-setup';
import type { ImportDestination } from '@/shared/lib/library-import/destination';

import {
  DEFAULT_IMPORT_LIMIT,
  IMPORT_SERVICES,
  buildImportBrief,
  importConnector,
  serviceAsk,
  serviceEntry,
  serviceFolder,
  serviceVariant,
  shouldRecheckSetup,
  type ImportService,
  type ImportServiceId,
  type ImportSetupFailure,
  type ImportStep,
} from '../model/import-flow';
import { ImportChooseStep } from './ImportChooseStep';
import { ImportConnectStep } from './ImportConnectStep';
import { ImportServicePicker } from './ImportServicePicker';

type LibraryImportProps = {
  open: boolean;
  onClose: () => void;
  /** The person closed the dialog without choosing one of its actions; runs once it has left the screen. */
  onDismiss?: () => void;
  setup: ConnectorSetup | null;
  onSetupSaved: () => void;
  onAddFiles: () => void;
  onBrief: (brief: string) => void;
  onOpenAdvanced: () => void;
  /**
   * Whether an in-app conversation can start here; when it cannot (the app may lack a verified
   * coding tool), the last press is not offered and the runtime remedy shows instead.
   */
  canRunAgent: boolean;
  /** The library folder the import lands in. */
  destination?: ImportDestination;
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
  onDismiss,
  setup,
  onSetupSaved,
  onAddFiles,
  onBrief,
  onOpenAdvanced,
  canRunAgent,
  destination = 'sources',
  testIdPrefix = 'library-import',
}: LibraryImportProps) {
  const t = useTranslations('libraryImport');
  const [step, setStep] = useState<ImportStep>('pick');
  const [serviceId, setServiceId] = useState<ImportServiceId | null>(null);
  const [token, setToken] = useState('');
  const [what, setWhat] = useState('');
  const [failed, setFailed] = useState<ImportSetupFailure | null>(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [inspection, setInspection] = useState<SetupInspection | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const [connectedName, setConnectedName] = useState<string | null>(null);

  const serviceButtons = useRef(new Map<ImportServiceId, HTMLButtonElement>());
  const tokenField = useRef<HTMLInputElement>(null);
  const requestField = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const saveStatus = useRef<HTMLParagraphElement>(null);

  const registerServiceButton = useCallback((id: ImportServiceId, button: HTMLButtonElement | null) => {
    if (button) serviceButtons.current.set(id, button);
    else serviceButtons.current.delete(id);
  }, []);

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

  const afterExit = useRef<(() => void) | null>(null);
  const closeThen = useCallback((leave: (() => void) | undefined) => {
    afterExit.current = leave ?? null;
    close();
  }, [close]);
  const dismiss = useCallback(() => closeThen(onDismiss), [closeThen, onDismiss]);
  const leaveAfterExit = useCallback(() => {
    const leave = afterExit.current;
    afterExit.current = null;
    leave?.();
  }, []);

  const pick = useCallback(
    (next: ImportService) => {
      if (next.connect === 'manual') {
        // Closing first means two blocking surfaces never stand at once (`.claude/rules/design.md`).
        closeThen(onOpenAdvanced);
        return;
      }
      setToken('');
      setChecking(true);
      setServiceId(next.id);
      setStep('connect');
      setFailed(null);
    },
    [closeThen, onOpenAdvanced],
  );

  useEffect(() => {
    const attempt = ++generation.current;
    saving.current = false;
    if (!open || step !== 'connect' || !service || !entry || !askName) return;
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
  }, [open, step, service, entry, askName, setup, checkVersion]);

  const back = () => {
    generation.current += 1;
    saving.current = false;
    setPending(false);
    setToken('');
    setStep('pick');
  };
  const connect = async () => {
    if (shouldRecheckSetup({ inspection, failed, checking, pending, token })) { setCheckVersion((version) => version + 1); return; }
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
      destination,
      folder: serviceFolder(service, destination),
      request: { what, limit: DEFAULT_IMPORT_LIMIT },
    });
    onBrief(brief);
    close();
  }, [close, connectedName, destination, onBrief, service, t, what]);

  const addFiles = () => {
    close();
    onAddFiles();
  };

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      size="md"
      labelledBy={`${testIdPrefix}-title`}
      testId={`${testIdPrefix}-dialog`}
      onExited={leaveAfterExit}
      className="max-h-[min(80vh,var(--dialog-max-h))] overflow-y-auto"
    >
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
          onClick={dismiss}
        />
      </div>

      {step === 'pick' ? (
        <ImportServicePicker
          testIdPrefix={testIdPrefix}
          onPick={pick}
          registerServiceButton={registerServiceButton}
        />
      ) : null}

      {step === 'connect' && service && ask ? (
        <ImportConnectStep
          testIdPrefix={testIdPrefix}
          service={service}
          entry={entry}
          ask={ask}
          destination={destination}
          inspection={inspection}
          failed={failed}
          checking={checking}
          pending={pending}
          token={token}
          onTokenChange={setToken}
          tokenField={tokenField}
          saveButton={saveButton}
          saveStatus={saveStatus}
          onBack={back}
          onConnect={() => void connect()}
          onAddFiles={addFiles}
          onOpenAdvanced={() => closeThen(onOpenAdvanced)}
        />
      ) : null}

      {step === 'choose' && service ? (
        <ImportChooseStep
          testIdPrefix={testIdPrefix}
          service={service}
          destination={destination}
          what={what}
          onWhatChange={setWhat}
          requestField={requestField}
          canRunAgent={canRunAgent}
          onBack={() => setStep('connect')}
          onBring={bring}
        />
      ) : null}
    </Dialog>
  );
}
