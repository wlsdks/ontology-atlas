'use client';

import { Bot, CheckCircle2, CircleAlert, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Chip } from '@/shared/ui/controls/controls';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import {
  summarizeAgentSetupFiles,
  validationStateOf,
  validationToneOf,
  type AgentConfigStatus,
  type AgentSetupConnection,
  type ValidationSummary,
} from '../../model/agent-setup/agent-setup-status';
import { ACCENT_ACTION_CHIP } from './agent-setup-chips';
import { AgentSetupSectionLabel as SectionLabel } from './AgentSetupSectionLabel';

interface Props {
  agentStatus: AgentConfigStatus;
  connections: readonly AgentSetupConnection[];
  agentSetupReady: boolean;
  vaultLoaded: boolean;
  docCount: number;
  validationSummary: ValidationSummary | null;
  canEditCurrent: boolean;
  repairBusy: boolean;
  onRepair: () => void;
}

/**
 * The drawer's first group: which config files are ready, the repair action, the validation gate
 * and the proof rows. Strings live in the `docsVault` namespace.
 */
export function AgentSetupInspection({
  agentStatus,
  connections,
  agentSetupReady,
  vaultLoaded,
  docCount,
  validationSummary,
  canEditCurrent,
  repairBusy,
  onRepair,
}: Props) {
  const t = useTranslations('docsVault');
  const { hasMissing: hasMissingAgentConfig, hasInvalid: hasInvalidAgentConfig } =
    summarizeAgentSetupFiles(agentStatus);
  const validationState = validationStateOf(validationSummary);
  const validationGateTone = validationToneOf(validationState);
  const validationGateStatus =
    validationState === 'clean'
      ? t('agentSetup.validationGateReady')
      : validationState === 'error'
        ? t('agentSetup.validationGateBlocked')
        : validationState === 'warning'
          ? t('agentSetup.validationGateReview')
          : t('agentSetup.validationGateUnknown');
  const validationGateSummary =
    validationState === 'clean'
      ? t('agentSetup.validationGateSummaryClean')
      : validationState === 'error'
        ? t('agentSetup.validationGateSummaryIssues', {
            errors: validationSummary?.errorCount ?? 0,
            warnings: validationSummary?.warningCount ?? 0,
          })
        : validationState === 'warning'
          ? t('agentSetup.validationGateSummaryWarnings', {
              warnings: validationSummary?.warningCount ?? 0,
            })
          : t('agentSetup.validationGateSummaryUnknown');
  const validationGateDesc =
    validationState === 'clean'
      ? t('agentSetup.validationGateDescClean')
      : validationState === 'error'
        ? t('agentSetup.validationGateDescBlocked')
        : validationState === 'warning'
          ? t('agentSetup.validationGateDescReview')
          : t('agentSetup.validationGateDescUnknown');
  const agentSetupProofRows = [
    {
      key: 'vault',
      label: t('agentSetup.proofVault'),
      value: t('agentSetup.proofVaultLoaded', { count: docCount }),
      state: vaultLoaded ? 'ready' : 'warning',
      href: null,
    },
    {
      key: 'health',
      label: t('agentSetup.proofHealth'),
      value:
        validationState === 'clean'
          ? t('agentSetup.proofHealthClean')
          : validationState === 'warning'
            ? t('agentSetup.proofHealthWarnings', {
                count: validationSummary?.warningCount ?? 0,
              })
            : validationState === 'error'
              ? t('agentSetup.proofHealthErrors', {
                  count: validationSummary?.errorCount ?? 0,
                })
              : t('agentSetup.proofHealthUnknown'),
      state: validationGateTone,
      // The map INDEX's "docs the checks caught" row counts the same results and opens the same place.
      href:
        validationState === 'error' || validationState === 'warning'
          ? DESTINATION_HREF.docs
          : null,
    },
    {
      // No ready/total row: the always-visible header summary already states that count.
      key: 'agentRoot',
      label: t('agentSetup.proofAgentRoot'),
      value: agentSetupReady
        ? t('agentSetup.proofAgentRootReady')
        : t('agentSetup.proofAgentRootNeedsTemplate'),
      state: agentSetupReady ? 'manual' : 'warning',
      href: null,
    },
  ] as const;

  return (
    <div data-testid="agent-setup-inspection" className="flex flex-col gap-2">
      <SectionLabel>{t('agentSetup.groupFiles')}</SectionLabel>
      <ul aria-label={t('agentSetup.connectionStatusHeading')} className="grid gap-1">
        {connections.map(({ key, file, label }) => {
          const present = Boolean(agentStatus[file.key]);
          const ready = present && agentStatus[file.validKey] !== false;
          return (
            <li
              key={key}
              className="grid grid-cols-[14px_1fr] gap-1.5 rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5"
            >
              {ready ? (
                <CheckCircle2
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                />
              ) : (
                <CircleAlert
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
                />
              )}
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-body text-[color:var(--color-text-secondary)]">
                  {label}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-quaternary)]">
                  {file.path}
                </code>
                <span
                  className={`shrink-0 text-label ${
                    ready
                      ? 'text-[color:var(--color-success-text-a92)]'
                      : 'text-[color:var(--color-amber-source-text-a95)]'
                  }`}
                >
                  {ready
                    ? t('agentSetup.connectionReady')
                    : present
                      ? t('agentSetup.needsReview')
                      : t('agentSetup.connectionNeedsReview')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {hasMissingAgentConfig && canEditCurrent ? (
        <Chip
          size="md"
          onClick={() => onRepair()}
          disabled={repairBusy}
          title={t('agentSetup.repairTitle')}
          tone="accent"
          className={`self-start ${ACCENT_ACTION_CHIP}`}
        >
          <Bot size={ICON_SIZE.sm} aria-hidden />
          {repairBusy ? t('agentSetup.repairing') : t('agentSetup.repair')}
        </Chip>
      ) : null}
      {hasInvalidAgentConfig ? (
        <p className="break-keep rounded-micro border border-[color:var(--color-amber-source-a14)] bg-[color:var(--color-amber-source-a08)] px-2 py-1.5 text-label text-[color:var(--color-amber-source-text-a95)]">
          {t('agentSetup.invalidRepairHint')}
        </p>
      ) : null}
      <p className="break-keep text-body text-[color:var(--color-text-quaternary)]">
        {t('agentSetup.connectionHint')}
      </p>

      {/*
        Validation errors block nothing but `git_snapshot({confirm:true})`; MCP writes have no
        such gate, so this box must not claim the agent is blocked.
      */}
      <div
        role="status"
        aria-label={t('agentSetup.validationGateAriaLabel')}
        className={`grid grid-cols-[14px_1fr] gap-1.5 rounded-micro border px-2 py-1.5 ${
          validationGateTone === 'ready'
            ? 'border-[color:var(--color-success-a20)] bg-[color:var(--color-success-a055)]'
            : validationGateTone === 'blocked'
              ? 'border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)]'
              : 'border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a07)]'
        }`}
      >
        {validationGateTone === 'ready' ? (
          <CheckCircle2
            size={ICON_SIZE.sm}
            aria-hidden
            className="mt-0.5 text-[color:var(--color-success-text-a90)]"
          />
        ) : (
          <CircleAlert
            size={ICON_SIZE.sm}
            aria-hidden
            className={`mt-0.5 ${
              validationGateTone === 'blocked'
                ? 'text-[color:var(--color-status-danger)]'
                : 'text-[color:var(--color-amber-source-text-a95)]'
            }`}
          />
        )}
        <span className="min-w-0">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t('agentSetup.validationGateTitle')}
            </span>
            <span
              className={`shrink-0 text-label ${
                validationGateTone === 'ready'
                  ? 'text-[color:var(--color-success-text-a92)]'
                  : validationGateTone === 'blocked'
                    ? 'text-[color:var(--color-status-danger)]'
                    : 'text-[color:var(--color-amber-source-text-a95)]'
              }`}
            >
              {validationGateStatus}
            </span>
          </span>
          <span className="mt-0.5 block text-body leading-body text-[color:var(--color-text-secondary)]">
            {validationGateSummary}
          </span>
          <span className="mt-0.5 block break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
            {validationGateDesc}
          </span>
        </span>
      </div>
      <dl aria-label={t('agentSetup.proofAriaLabel')} className="grid gap-1">
        {agentSetupProofRows.map((row) => (
          <div
            key={row.key}
            data-testid={`agent-setup-proof-${row.key}`}
            className="grid grid-cols-[14px_72px_1fr] items-start gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-1.5 py-1"
          >
            {row.state === 'ready' ? (
              <CheckCircle2
                size={ICON_SIZE.sm}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-success-text-a90)]"
              />
            ) : row.state === 'blocked' ? (
              <CircleAlert
                size={ICON_SIZE.sm}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-status-danger)]"
              />
            ) : row.state === 'manual' ? (
              <Terminal
                size={ICON_SIZE.sm}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-success-text-a90)]"
              />
            ) : (
              <CircleAlert
                size={ICON_SIZE.sm}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
              />
            )}
            <dt className="truncate text-body text-[color:var(--color-text-quaternary)]">
              {row.label}
            </dt>
            <dd className="break-keep text-label text-[color:var(--color-text-secondary)]">
              {row.value}
              {row.href ? (
                <>
                  {' '}
                  <Link
                    href={row.href}
                    data-testid={`agent-setup-proof-${row.key}-link`}
                    className={controlClass({
                      shape: 'link',
                      className: 'hover:text-[color:var(--color-text-primary)]',
                    })}
                  >
                    {t('proofHealthOpenQueue')}
                  </Link>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
