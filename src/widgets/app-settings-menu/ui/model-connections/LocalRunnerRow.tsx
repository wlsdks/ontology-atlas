import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import {
  secretErrorMessage,
  secretVerify,
  sourceModelVerify,
  LOCAL_PROVIDER,
} from '@/shared/lib/llm-connection/tauri-secrets';
import { useNativeErrorLookup } from '@/shared/lib/desktop-shell/use-native-error-lookup';
import {
  clearLocalEndpoint,
  hostOfBaseUrl,
  isEmbeddingOnlyModel,
  isLocalEndpointReady,
  readLocalEndpoint,
  readLocalVerdict,
  writeLocalEndpoint,
  type LocalEndpointSettings,
} from '@/shared/lib/llm-connection/local-endpoint';
import { fieldClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls/controls';
import { Select } from '@/shared/ui/fields/select';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import {
  LOCAL_RUNNERS,
  runnerForBaseUrl,
  type LocalRunner,
  type LocalRunnerId,
} from '../../model/local-runners';
import { LocalCaption } from './LocalCaption';
import { localHeaderTone, sameAddress, type LocalVerifyState } from './local-runner-rules';
import {
  COMMIT_CHIP,
  ModelRow,
  OpenChip,
  ROW_CHIP,
  RowStatus,
  refocusIfLost,
  type Announce,
  type RowKey,
} from './ModelRow';

/**
 * One runner row. There is one saved runner (`local-endpoint.ts`); a row is the one in use when
 * the saved address is its address and a model is picked. A check result belongs to the address
 * it asked: the header shows it only for the row's own address, and the open detail only for the
 * address in the field, so an abandoned check of another port never sticks to the row.
 */
export function LocalRunnerRow({
  runner,
  local,
  activeRunner,
  vaultRootPath,
  expanded,
  onExpand,
  onCollapse,
  onSettings,
  onVerified,
  announce,
}: {
  runner: LocalRunner;
  local: LocalEndpointSettings;
  activeRunner: LocalRunnerId | null;
  vaultRootPath: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onSettings: (next: LocalEndpointSettings) => void;
  onVerified: () => void;
  announce: Announce;
}) {
  const t = useTranslations('agents.models');
  const nativeErrors = useNativeErrorLookup();
  const active = activeRunner === runner.id;
  const savedHere = runnerForBaseUrl(local.baseUrl) === runner.id;
  const address = runner.id === 'custom' ? (savedHere ? local.baseUrl : '') : runner.defaultBaseUrl;
  const [draftUrl, setDraftUrl] = useState(() => address || runner.defaultBaseUrl);
  const addressRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (expanded) addressRef.current?.focus({ preventScroll: true });
  }, [expanded]);
  const [verify, setVerify] = useState<LocalVerifyState>({ kind: 'idle' });
  const headerCheckRef = useRef<HTMLButtonElement | null>(null);
  const detailCheckRef = useRef<HTMLButtonElement | null>(null);
  const label = t(runner.labelKey);
  const rowKey: RowKey = `local:${runner.id}`;

  // Opening starts from the row's own address, not from whatever was typed and abandoned last
  // time. Adjusted during render (React's shape for "reset state when a prop changes").
  const [seenExpanded, setSeenExpanded] = useState(expanded);
  if (expanded !== seenExpanded) {
    setSeenExpanded(expanded);
    if (expanded) setDraftUrl(address || runner.defaultBaseUrl);
  }

  const headerVerify: LocalVerifyState =
    verify.kind !== 'idle' && address && sameAddress(verify.url, address) ? verify : { kind: 'idle' };
  const detailVerify: LocalVerifyState =
    verify.kind !== 'idle' && draftUrl.trim() && sameAddress(verify.url, draftUrl) ? verify : { kind: 'idle' };
  const models = detailVerify.kind === 'done' ? detailVerify.models : [];

  const statusWord = (state: LocalVerifyState): string => {
    if (state.kind === 'checking') return t('verifying');
    if (state.kind === 'done') {
      if (state.reason === 'ok') {
        const count = t('statusModelCount', { count: state.models.length });
        return active ? `${t('statusConnected')} · ${count}` : count;
      }
      if (state.reason === 'unreachable') return t('statusUnreachable');
      if (state.reason === 'no-models') return t('statusNoModels');
      if (state.reason === 'not-compatible') return t('statusNotCompatible');
      return t('statusFailed');
    }
    return active ? t('statusSaved') : t('statusNotConnected');
  };

  const runVerify = async (url: string, ref: RefObject<HTMLButtonElement | null>) => {
    const target = url.trim();
    if (verify.kind === 'checking' || !target) return;
    setVerify({ kind: 'checking', url: target });
    try {
      const result = await (vaultRootPath ? secretVerify(LOCAL_PROVIDER, vaultRootPath, target) : sourceModelVerify(target));
      if (!result) return;
      const verdict = readLocalVerdict(result);
      const done: LocalVerifyState = { kind: 'done', url: target, ...verdict };
      setVerify(done);
      // Only a re-check of **the saved address** touches what is saved: it keeps the model if the
      // runner still has it and drops it if not. Any other address saves nothing until a model is
      // picked there, so looking never breaks the runner the conversation is using.
      if (verdict.reason === 'ok' && isLocalEndpointReady(local) && sameAddress(target, local.baseUrl)) {
        const model = verdict.models.includes(local.model) ? local.model : '';
        if (model !== local.model) {
          const next = { baseUrl: local.baseUrl, model };
          onSettings(next);
          writeLocalEndpoint(next);
        }
      }
      announce(`${label} · ${statusWord(done)}`);
    } catch (err) {
      setVerify({ kind: 'done', url: target, reason: 'failed', models: [], detail: secretErrorMessage(err, nativeErrors) });
      announce(`${label} · ${t('statusFailed')}`);
    } finally {
      // Success or failure, this call was logged — so the count moves immediately.
      onVerified();
      refocusIfLost(ref);
    }
  };

  const pickModel = (model: string) => {
    if (!model) return;
    const next = { baseUrl: draftUrl.trim(), model };
    onSettings(next);
    writeLocalEndpoint(next);
    announce(`${label} · ${t('localSaved')}`);
    onCollapse();
  };

  const disconnect = () => {
    clearLocalEndpoint();
    onSettings(readLocalEndpoint());
    setVerify({ kind: 'idle' });
    announce(`${label} · ${t('localDisconnected')}`);
    onCollapse();
  };

  const headerTone = localHeaderTone(headerVerify, active);

  const otherActive = activeRunner !== null && activeRunner !== runner.id;
  const detailIsSaved = active && sameAddress(draftUrl, local.baseUrl);

  return (
    <ModelRow
      testId={runner.rowTestId}
      name={label}
      caption={
        active ? (
          // The runner in use names the model the conversation calls, beside its address — the
          // one line that says what "in use" means here.
          <span data-testid="ai-local-connected" className="font-mono">
            {address} · {local.model}
          </span>
        ) : address ? (
          <span className="font-mono">{address}</span>
        ) : (
          t('runnerCustomAddress')
        )
      }
      status={
        <RowStatus tone={headerTone} testId={`ai-local-status-${runner.id}`}>
          {statusWord(headerVerify)}
        </RowStatus>
      }
      actions={
        <>
          {/* The header check asks the saved address, so it stands only while the row is closed:
              an open row has one check, the one beside the address being typed. */}
          {active && !expanded ? (
            <Chip
              ref={headerCheckRef}
              size="lg"
              tone="secondary"
              hoverInk="strong"
              hoverBorder="strong"
              data-testid={`ai-check-local-${runner.id}`}
              onClick={() => void runVerify(local.baseUrl, headerCheckRef)}
              disabled={verify.kind === 'checking'}
              className={ROW_CHIP}
            >
              {t('actionCheck')}
            </Chip>
          ) : null}
          <OpenChip
            testId={active ? `ai-change-local-${runner.id}` : `ai-register-local-${runner.id}`}
            rowKey={rowKey}
            open={expanded}
            onOpen={onExpand}
            onClose={onCollapse}
          >
            {active ? t('actionReplace') : t('actionConnect')}
          </OpenChip>
        </>
      }
      detailOpen={expanded}
      detailTestId={`ai-detail-local-${runner.id}`}
      detail={
        <>
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={addressRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draftUrl}
              aria-label={t('localBaseUrlLabel')}
              placeholder={runner.defaultBaseUrl || t('localBaseUrlPlaceholder')}
              data-testid="ai-local-url"
              onChange={(event) => setDraftUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isImeComposing(event)) void runVerify(draftUrl, detailCheckRef);
              }}
              className={fieldClass({ size: 'md', className: 'min-w-0 flex-1 font-mono placeholder:font-sans' })}
            />
            <Chip
              size="lg"
              tone="secondary"
              hoverInk="strong"
              hoverBorder="strong"
              data-testid="ai-cancel-local"
              onClick={onCollapse}
              className={ROW_CHIP}
            >
              {t('cancel')}
            </Chip>
            <Chip
              ref={detailCheckRef}
              size="lg"
              tone="accent"
              data-testid="ai-verify-local"
              onClick={() => void runVerify(draftUrl, detailCheckRef)}
              disabled={verify.kind === 'checking' || !draftUrl.trim()}
              className={COMMIT_CHIP}
            >
              {verify.kind === 'checking' ? t('verifying') : t('actionCheck')}
            </Chip>
          </div>

          {/* The model field appears only once there is something to choose. */}
          {models.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2" data-testid="ai-local-model-row">
              <Select
                size="md"
                value={detailIsSaved ? local.model : ''}
                onChange={pickModel}
                options={models.map((model) => ({
                  value: model,
                  label: model,
                  // Annotated, not removed: the name alone cannot say it cannot chat.
                  description: isEmbeddingOnlyModel(model) ? t('localModelEmbeddingOnly') : undefined,
                }))}
                placeholder={t('localModelPlaceholder')}
                ariaLabel={t('localModelLabel')}
                className="min-w-0 flex-1"
                data-testid="ai-local-model"
              />
              {active ? (
                <Chip
                  size="lg"
                  tone="secondary"
                  hoverInk="strong"
                  hoverBorder="strong"
                  data-testid="ai-local-disconnect"
                  onClick={disconnect}
                  className={ROW_CHIP}
                >
                  {t('localDisconnect')}
                </Chip>
              ) : null}
            </div>
          ) : active ? (
            <div className="flex min-w-0 items-center justify-end gap-2">
              <Chip
                size="lg"
                tone="secondary"
                hoverInk="strong"
                hoverBorder="strong"
                data-testid="ai-local-disconnect"
                onClick={disconnect}
                className={ROW_CHIP}
              >
                {t('localDisconnect')}
              </Chip>
            </div>
          ) : null}

          <LocalCaption
            verify={detailVerify}
            host={hostOfBaseUrl(draftUrl || address)}
            vaultKnown={vaultRootPath !== null}
          />
          {otherActive ? (
            <p
              data-testid="ai-local-one-at-a-time"
              className="text-body leading-body text-[color:var(--color-text-tertiary)]"
            >
              {t('localOneAtATime', {
                current: t(LOCAL_RUNNERS.find((candidate) => candidate.id === activeRunner)?.labelKey ?? 'runnerCustom'),
              })}
            </p>
          ) : null}
        </>
      }
    />
  );
}
