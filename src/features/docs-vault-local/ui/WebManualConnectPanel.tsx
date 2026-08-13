'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { copyText } from '@/shared/lib/copy-text';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { controlClass, fieldClass, fieldLabel } from '@/shared/ui/control-class';

import { AGENT_CLIENTS, type AgentClientId } from '../lib/agent-clients';
import {
  ATLAS_CLONE_COMMAND,
  manualConnectConfig,
  manualSetupCommand,
  manualVerifyCommand,
  normalizeManualPath,
  type ManualPathIssue,
} from '../lib/manual-connect';

/**
 * **웹에서 그 자리에서 끝나는 연결.**
 *
 * 종전 이 자리에는 「이 화면에서는 연결할 수 없어요」 카드 하나와, 사람을 긴
 * 문서 한가운데로 떨구는 링크가 있었다. 두 가지가 틀렸다 — 문장은 사실이
 * 아니었고(웹 사용자도 연결된다, 자동 설정만 못 한다), 대안은 시트를 잃게
 * 만들었다.
 *
 * 여기서는 사용자가 경로 두 개를 알려 주면 **실행 가능한 설정을 그 자리에서**
 * 만든다. 왜 그것이 정당한지, 무엇을 잡고 무엇을 못 잡는지는
 * `lib/manual-connect.ts` 머리말에 있다.
 *
 * 화면 쪽 계약 넷:
 *
 * 1. **채우기 전에도 무엇을 해야 하는지 보인다.** 자리표시자가 든 진짜 설정이
 *    먼저 그려진다 — 빈 화면에 입력칸만 두지 않는다.
 * 2. **덜 채운 것은 복사되지 않는다.** 붙지 않는 설정을 손에 쥐어 주는 것은
 *    도움이 아니라 함정이다.
 * 3. **모양만 본다고 말한다.** 브라우저는 그 폴더가 실재하는지 확인할 수 없다.
 *    "확인했다"고 말하는 순간 이 화면도 거짓말을 시작한다.
 * 4. **경로는 화면 밖으로 나가지 않는다.** 전송 0 · 저장 0 — 순수 함수와
 *    로컬 상태뿐이다.
 */

export interface WebManualConnectPanelProps {
  /** 시트/설정 패널이 서로 다른 testid 접두사를 쓰지 않도록 한 곳에서 정한다. */
  testIdPrefix?: string;
}

function PathField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
  issueMessage,
  testId,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  issueMessage: string | null;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={fieldLabel({ className: "font-[var(--font-weight-signature)]" })}>
        {label}
      </label>
      {hint ? (
        <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">{hint}</p>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode="text"
        spellCheck={false}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        aria-invalid={issueMessage ? true : undefined}
        className={fieldClass({ size: "md", className: "w-full font-mono text-label" })}
      />
      {issueMessage ? (
        <p
          role="status"
          data-testid={`${testId}-issue`}
          className="text-label leading-label text-[color:var(--color-status-warning)]"
        >
          {issueMessage}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 복사 칩의 **호버.** 값 층은 호버 색을 일부러 안 낸다(호버 빈도가 모션 예산을
 * 깎으므로 소비처가 정한다). 이 파일의 세 자리가 같은 문자열이라 한 벌로 둔다.
 */
const COPY_CHIP_SKIN =
  'font-[var(--font-weight-signature)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]';

function CommandRow({
  label,
  value,
  ready,
  testId,
}: {
  label: string;
  value: string;
  ready: boolean;
  testId: string;
}) {
  const t = useTranslations('agentConnect');
  const { state, copy } = useCopyFeedback(1600);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-[color:var(--color-text-quaternary)]">{label}</p>
      <pre
        data-testid={`${testId}-body`}
        className="whitespace-pre-wrap break-all rounded-micro border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
      >
        {value.trimEnd()}
      </pre>
      <button
        type="button"
        disabled={!ready}
        data-testid={testId}
        onClick={() => void copy(value)}
        className={controlClass({
          shape: 'chip',
          tone: 'secondary',
          className: `w-fit ${COPY_CHIP_SKIN}`,
        })}
      >
        {state === 'copied' ? (
          <Check size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-success)]" />
        ) : (
          <Copy size={ICON_SIZE.sm} aria-hidden />
        )}
        {state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : t('copy')}
      </button>
    </div>
  );
}

export function WebManualConnectPanel({
  testIdPrefix = 'web-manual-connect',
}: WebManualConnectPanelProps) {
  const t = useTranslations('agentConnect');
  const [vaultRaw, setVaultRaw] = useState('');
  const [checkoutRaw, setCheckoutRaw] = useState('');
  const [pathConfirmed, setPathConfirmed] = useState(false);
  const [client, setClient] = useState<AgentClientId>(AGENT_CLIENTS[0].id);
  const [cloneCopied, setCloneCopied] = useState(false);
  const { state: configCopyState, copy: copyConfig } = useCopyFeedback(1600);

  const vault = useMemo(() => normalizeManualPath(vaultRaw), [vaultRaw]);
  const checkout = useMemo(() => normalizeManualPath(checkoutRaw), [checkoutRaw]);
  const ready = vault.ok && checkout.ok && pathConfirmed;

  // 아직 안 채운 칸은 **자리표시자가 든 진짜 설정**으로 그린다. `<…>` 를 쓰지
  // 않는 이유: next-intl 이 꺾쇠를 리치텍스트 태그로 파싱해 화면에서 통째로
  // 사라진다(`shared/config/cli-invocation.ts` 에 기록된 실측).
  const input = {
    vaultAbsolute: vault.ok ? vault.value : t('manualVaultPlaceholderPath'),
    checkoutAbsolute: checkout.ok ? checkout.value : t('manualCheckoutPlaceholderPath'),
  };

  const active = AGENT_CLIENTS.find((entry) => entry.id === client) ?? AGENT_CLIENTS[0];
  const config = manualConnectConfig(active.id, input);

  const issueMessage = (result: { ok: boolean; issue: ManualPathIssue | null }) =>
    result.ok || result.issue === 'empty' || result.issue === null
      ? null
      : t(
          result.issue === 'tilde'
            ? 'manualIssueTilde'
            : result.issue === 'multiline'
              ? 'manualIssueMultiline'
              : 'manualIssueRelative',
        );

  return (
    <div className="flex flex-col gap-3" data-testid={testIdPrefix}>
      <div className="flex flex-col gap-3">
        <PathField
          id={`${testIdPrefix}-vault`}
          label={t('manualVaultLabel')}
          placeholder={t('manualVaultPlaceholderPath')}
          value={vaultRaw}
          onChange={(next) => {
            setVaultRaw(next);
            setPathConfirmed(false);
          }}
          issueMessage={issueMessage(vault)}
          testId={`${testIdPrefix}-vault-input`}
        />
        <PathField
          id={`${testIdPrefix}-checkout`}
          label={t('manualCheckoutLabel')}
          hint={t('manualCheckoutHint')}
          placeholder={t('manualCheckoutPlaceholderPath')}
          value={checkoutRaw}
          onChange={(next) => {
            setCheckoutRaw(next);
            setPathConfirmed(false);
          }}
          issueMessage={issueMessage(checkout)}
          testId={`${testIdPrefix}-checkout-input`}
        />
        {/* 체크아웃이 아직 없는 사람 — 여기서 막히면 위 칸을 영원히 못 채운다. */}
        <button
          type="button"
          data-testid={`${testIdPrefix}-clone`}
          onClick={async () => {
            if (await copyText(ATLAS_CLONE_COMMAND)) setCloneCopied(true);
          }}
          className={controlClass({
            shape: 'chip',
            size: 'sm',
            className:
              'w-fit self-start hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
          })}
        >
          {cloneCopied ? (
            <Check size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-success)]" />
          ) : (
            <Copy size={ICON_SIZE.sm} aria-hidden />
          )}
          {cloneCopied ? t('manualCloneCopied') : t('manualCloneCta')}
        </button>
      </div>

      {/* 브라우저가 확인한 것과 확인하지 못한 것을 가르는 한 줄. */}
      <p
        data-testid={`${testIdPrefix}-shape-only`}
        className="text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t('manualShapeOnlyNote')}
      </p>
      <label className={fieldLabel({ row: true })}>
        <input
          type="checkbox"
          checked={pathConfirmed}
          disabled={!vault.ok || !checkout.ok}
          onChange={(event) => setPathConfirmed(event.target.checked)}
          data-testid={`${testIdPrefix}-path-confirmation`}
          className="size-4 shrink-0"
        />
        <span>{t('manualPathConfirmation')}</span>
      </label>

      {/* 도구 고르기 — 설정 파일 위치가 도구마다 다르다. 전역 스코프 패널과 같은 구조. */}
      <div className="flex flex-col gap-2">
        <div
          role="tablist"
          aria-label={t('scopeGlobalToolLabel')}
          data-testid={`${testIdPrefix}-tools`}
          className="flex flex-wrap gap-1"
        >
          {AGENT_CLIENTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === active.id}
              onClick={() => setClient(entry.id)}
              data-testid={`${testIdPrefix}-tool-${entry.id}`}
              className={controlClass({
                shape: 'chip',
                active: entry.id === active.id,
                className: 'font-[var(--font-weight-signature)] hover:text-[color:var(--color-text-primary)]',
              })}
            >
              {entry.name}
            </button>
          ))}
        </div>

        <div
          data-testid={`${testIdPrefix}-config-${active.id}`}
          className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          <p className="font-mono text-body text-[color:var(--color-text-quaternary)]">
            {config.file}
          </p>
          <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('manualFileHint', { file: config.file })}
          </p>
          <pre
            data-testid={`${testIdPrefix}-config-body`}
            className="mt-1.5 whitespace-pre-wrap break-all rounded-micro border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-2 py-1.5 font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            {config.body.trimEnd()}
          </pre>
          <button
            type="button"
            disabled={!ready}
            data-testid={`${testIdPrefix}-copy-config`}
            onClick={() => void copyConfig(config.body)}
            className={controlClass({
              shape: 'chip',
              tone: 'secondary',
              className: `mt-1.5 ${COPY_CHIP_SKIN}`,
            })}
          >
            {configCopyState === 'copied' ? (
              <Check size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-success)]" />
            ) : (
              <Copy size={ICON_SIZE.sm} aria-hidden />
            )}
            {configCopyState === 'copied'
              ? t('copied')
              : configCopyState === 'failed'
                ? t('copyFailed')
                : t('manualCopyConfig')}
          </button>
          {/* 저장 다음에 할 일이 없으면 사용자는 붙었는지 모른 채로 기다린다.
              설치 앱의 단계 ②(재시작)가 웹에서는 그려지지 않으므로 여기서 말한다. */}
          <p
            data-testid={ready ? `${testIdPrefix}-restart` : `${testIdPrefix}-not-ready`}
            className="mt-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {ready ? t('manualRestartNote') : t('manualNotReadyNote')}
          </p>
        </div>
      </div>

      {/* 파일을 손으로 만들기 싫은 사람 — 같은 결과를 CLI 한 줄로. */}
      <div className="flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] pt-3">
        <CommandRow
          label={t('manualCliLabel')}
          value={manualSetupCommand(input)}
          ready={ready}
          testId={`${testIdPrefix}-copy-cli`}
        />
        <CommandRow
          label={t('manualVerifyLabel')}
          value={manualVerifyCommand(input)}
          ready={ready}
          testId={`${testIdPrefix}-copy-verify`}
        />
      </div>
    </div>
  );
}
