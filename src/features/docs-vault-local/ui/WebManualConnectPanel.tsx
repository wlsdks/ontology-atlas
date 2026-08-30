'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { copyText } from '@/shared/lib/copy-text';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { controlClass, fieldClass, fieldLabel } from '@/shared/ui/control-class';
import { Checkbox } from '@/shared/ui';

import { AGENT_CLIENTS, type AgentClientId } from '@/entities/vault-session';
import {
  ATLAS_CLONE_COMMAND,
  manualConnectConfig,
  manualSetupCommand,
  manualVerifyCommand,
  normalizeManualPath,
  type ManualPathIssue,
} from '../lib/manual-connect';

/**
 * **Connecting from the web, finished in place.**
 *
 * This slot used to hold one card saying "you cannot connect from this screen" plus a link dropping
 * the reader into the middle of a long document. Both were wrong — the sentence was untrue (a web
 * user can connect; only automatic configuration is impossible) and the alternative made them lose
 * the sheet.
 *
 * Here the user supplies two paths and **a runnable config is built on the spot**. Why that is
 * legitimate, and what is and is not validated, is in the `lib/manual-connect.ts` preamble.
 *
 * Four contracts on the screen side:
 *
 * 1. **What to do is visible before anything is filled in.** A real config with placeholders is
 *    drawn first — not an empty screen with input boxes.
 * 2. **A partially filled config is not copyable.** Handing someone a config that will not connect
 *    is a trap, not help.
 * 3. **It says it checks shape only.** A browser cannot confirm the folder exists, and the moment it
 *    claims to have, this screen starts lying too.
 * 4. **Paths never leave the screen.** Nothing transmitted, nothing stored — pure functions and
 *    local state only.
 */

export interface WebManualConnectPanelProps {
  /** Decided in one place so the sheet and the settings panel do not use different testid prefixes. */
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
 * The copy chip's **hover**. The value layer deliberately emits no hover colour (hover frequency
 * eats the motion budget, so the consumer decides). The three slots in this file share the string,
 * so it is kept as one.
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

  // A field not yet filled is drawn as **a real config carrying a placeholder**. `<…>` is not used:
  // next-intl parses angle brackets as rich-text tags and the whole thing disappears from the screen
  // (measured, recorded in `shared/config/cli-invocation.ts`).
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
        {/* For someone with no checkout yet — stuck here, they can never fill the field above. */}
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

      {/* The one line separating what the browser confirmed from what it could not. */}
      <p
        data-testid={`${testIdPrefix}-shape-only`}
        className="text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t('manualShapeOnlyNote')}
      </p>
      <Checkbox
        checked={pathConfirmed}
        disabled={!vault.ok || !checkout.ok}
        onChange={(event) => setPathConfirmed(event.target.checked)}
        data-testid={`${testIdPrefix}-path-confirmation`}
        label={<span>{t('manualPathConfirmation')}</span>}
      />

      {/* Tool selection — the config file location differs per tool. Same structure as the global scope panel. */}
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
          {/* With nothing to do after saving, the user waits without knowing whether it connected.
              The installed app's step ② (restart) is not drawn on the web, so it is said here. */}
          <p
            data-testid={ready ? `${testIdPrefix}-restart` : `${testIdPrefix}-not-ready`}
            className="mt-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {ready ? t('manualRestartNote') : t('manualNotReadyNote')}
          </p>
        </div>
      </div>

      {/* For someone who does not want to create files by hand — the same result in one CLI line. */}
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
