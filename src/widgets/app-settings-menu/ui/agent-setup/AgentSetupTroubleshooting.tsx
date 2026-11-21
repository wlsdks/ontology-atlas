'use client';

import { BookOpen, ClipboardCopy, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buildOntologyStarterJsonGateCommand } from '@/features/docs-vault-local';
import { Chip } from '@/shared/ui/controls/controls';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { ATLAS_CLI, shellQuoteForPacket } from '@/shared/config/cli-invocation';
import { AGENT_VERIFY_CLI_PREVIEW } from '../../model/agent-setup/agent-setup-packets';
import type {
  AgentConfigStatus,
  AgentSetupConnection,
  ValidationSummary,
} from '../../model/agent-setup/agent-setup-status';
import type { AgentSetupCopy } from '../../model/agent-setup/use-agent-setup-copy';
import { ACCENT_ACTION_CHIP, NEUTRAL_COPY_CHIP } from './agent-setup-chips';
import { AgentSetupInspection } from './AgentSetupInspection';
import { AgentSetupSectionLabel as SectionLabel } from './AgentSetupSectionLabel';

const DEFINITION_ROW = 'grid grid-cols-[92px_1fr] gap-2';

interface Props {
  agentStatus: AgentConfigStatus;
  connections: readonly AgentSetupConnection[];
  agentSetupReady: boolean;
  vaultLoaded: boolean;
  docCount: number;
  vaultRootPath: string | null | undefined;
  validationSummary: ValidationSummary | null;
  canEditCurrent: boolean;
  repairBusy: boolean;
  onRepair: () => void;
  onOpenWorkflowGuide: () => void;
  copyActions: AgentSetupCopy;
}

/**
 * The "Having trouble?" drawer body: per-file config status, the validation gate, how agents use
 * Atlas, the verify commands and the copy chips for every setup packet. Strings live in the
 * `docsVault` namespace.
 */
export function AgentSetupTroubleshooting({
  agentStatus,
  connections,
  agentSetupReady,
  vaultLoaded,
  docCount,
  vaultRootPath,
  validationSummary,
  canEditCurrent,
  repairBusy,
  onRepair,
  onOpenWorkflowGuide,
  copyActions,
}: Props) {
  const t = useTranslations('docsVault');
  const { copy, states } = copyActions;
  const agentDeeperChecks = [
    { key: 'gate', label: t('agentSetup.stepGate') },
    { key: 'mcpVerify', label: t('agentSetup.stepMcpVerify') },
    { key: 'graphProof', label: t('agentSetup.stepGraphProof') },
  ];
  const agentFirstContactProofRows = [
    {
      key: 'configState',
      label: t('agentSetup.proofContractConfigState'),
      value: t('agentSetup.proofContractConfigStateDesc'),
    },
    {
      key: 'mcpVerify',
      label: t('agentSetup.proofContractMcpVerify'),
      value: t('agentSetup.proofContractMcpVerifyDesc'),
    },
    {
      key: 'jsonGate',
      label: t('agentSetup.proofContractJsonGate'),
      value: t('agentSetup.proofContractJsonGateDesc'),
    },
    {
      key: 'graphBriefs',
      label: t('agentSetup.proofContractGraphBriefs'),
      value: t('agentSetup.proofContractGraphBriefsDesc'),
    },
  ] as const;

  const copyPromptLabel = {
    idle: t('agentSetup.copyPrompt'),
    copied: t('agentSetup.copyPromptCopied'),
    failed: t('agentSetup.copyPromptFailed'),
  }[states.verifyPrompt];
  const copyPacketLabel = {
    idle: t('agentSetup.copyPacket'),
    copied: t('agentSetup.copyPacketCopied'),
    failed: t('agentSetup.copyPacketFailed'),
  }[states.setupPacket];
  const copyCliLabel = {
    idle: t('agentSetup.copyCli'),
    copied: t('agentSetup.copyCliCopied'),
    failed: t('agentSetup.copyCliFailed'),
  }[states.verifyCli];
  const copyJsonGateLabel = {
    idle: t('agentSetup.copyJsonGate'),
    copied: t('agentSetup.copyJsonGateCopied'),
    failed: t('agentSetup.copyJsonGateFailed'),
  }[states.jsonGate];
  const copyPostChangeSyncLabel = {
    idle: t('agentSetup.copyPostChangeSync'),
    copied: t('agentSetup.copyPostChangeSyncCopied'),
    failed: t('agentSetup.copyPostChangeSyncFailed'),
  }[states.postChangeSync];
  const copyFirstContactProofLabel = {
    idle: t('agentSetup.copyFirstContactProof'),
    copied: t('agentSetup.copyFirstContactProofCopied'),
    failed: t('agentSetup.copyFirstContactProofFailed'),
  }[states.firstContactProof];
  const copyTemplateLabel = {
    idle: t('agentSetup.copyTemplate'),
    copied: t('agentSetup.copyTemplateCopied'),
    failed: t('agentSetup.copyTemplateFailed'),
  }[states.configTemplate];
  const copySetupCliLabel = {
    idle: t('agentSetup.copySetupCli'),
    copied: t('agentSetup.copySetupCliCopied'),
    failed: t('agentSetup.copySetupCliFailed'),
  }[states.setupCli];
  const copySetupCheckCliLabel = {
    idle: t('agentSetup.copySetupCheckCli'),
    copied: t('agentSetup.copySetupCheckCliCopied'),
    failed: t('agentSetup.copySetupCheckCliFailed'),
  }[states.setupCheckCli];
  const copyCodexTemplateLabel = {
    idle: t('agentSetup.copyCodexTemplate'),
    copied: t('agentSetup.copyCodexTemplateCopied'),
    failed: t('agentSetup.copyCodexTemplateFailed'),
  }[states.codexTemplate];
  const copyCodexCliLabel = {
    idle: t('agentSetup.copyCodexCli'),
    copied: t('agentSetup.copyCodexCliCopied'),
    failed: t('agentSetup.copyCodexCliFailed'),
  }[states.codexMcpAddCommand];
  const agentMcpVerifyPreview = `${ATLAS_CLI} mcp-verify ${
    vaultRootPath ? shellQuoteForPacket(vaultRootPath) : '.'
  } --timeout-ms 15000`;
  const agentJsonGatePreview = buildOntologyStarterJsonGateCommand(vaultRootPath);

  return (
    <>
      <AgentSetupInspection
        agentStatus={agentStatus}
        connections={connections}
        agentSetupReady={agentSetupReady}
        vaultLoaded={vaultLoaded}
        docCount={docCount}
        validationSummary={validationSummary}
        canEditCurrent={canEditCurrent}
        repairBusy={repairBusy}
        onRepair={onRepair}
      />

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('agentSetup.groupHowAgentsUse')}</SectionLabel>
        <p className="break-keep rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">
          <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {t('agentSetup.boundaryTitle')}
          </span>{' '}
          {t('agentSetup.boundaryDesc')}
        </p>
        <dl aria-label={t('agentSetup.modeChooserAriaLabel')} className="grid gap-1">
          {[
            { term: t('agentSetup.modeCliTerm'), desc: t('agentSetup.modeCliDesc') },
            { term: t('agentSetup.modeMcpTerm'), desc: t('agentSetup.modeMcpDesc') },
            { term: t('agentSetup.modeGraphTerm'), desc: t('agentSetup.modeGraphDesc') },
            { term: t('agentSetup.modeGateTerm'), desc: t('agentSetup.modeGateDesc') },
          ].map((mode) => (
            <div key={mode.term} className={DEFINITION_ROW}>
              <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                {mode.term}
              </dt>
              <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {mode.desc}
              </dd>
            </div>
          ))}
        </dl>
        <details className="rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
          <summary className=" select-none text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]">
            {t('agentSetup.nextStepsSummary')}
          </summary>
          <ul aria-label={t('agentSetup.nextStepsAriaLabel')} className="mt-1.5 grid gap-1">
            {agentDeeperChecks.map((step) => (
              <li
                key={step.key}
                className="break-keep text-label text-[color:var(--color-text-secondary)]"
              >
                {step.label}
              </li>
            ))}
          </ul>
          <dl
            aria-label={t('agentSetup.proofContractAriaLabel')}
            className="mt-2 grid gap-1"
          >
            {agentFirstContactProofRows.map((row) => (
              <div key={row.key} className={DEFINITION_ROW}>
                <dt className="text-body text-[color:var(--color-text-quaternary)]">
                  {row.label}
                </dt>
                <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            size="md"
            onClick={onOpenWorkflowGuide}
            title={t('agentSetup.openWorkflowGuideTitle')}
            tone="accent"
            className={ACCENT_ACTION_CHIP}
          >
            <BookOpen size={ICON_SIZE.sm} aria-hidden />
            {t('agentSetup.openWorkflowGuide')}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('setupPacket')}
            title={t('agentSetup.copyPacketTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyPacketLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('verifyPrompt')}
            title={t('agentSetup.copyPromptTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyPromptLabel}
          </Chip>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('agentSetup.verifyGroup')}</SectionLabel>
        <div
          aria-label={t('agentSetup.mcpVerifyPreviewAriaLabel')}
          className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5"
        >
          <div className="text-body text-[color:var(--color-text-quaternary)]">
            {t('agentSetup.mcpVerifyLabel')}
          </div>
          <code className="mt-1 block truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
            {agentMcpVerifyPreview}
          </code>
        </div>
        <div className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
          <div className="text-body text-[color:var(--color-text-quaternary)]">
            {t('agentSetup.jsonGateLabel')}
          </div>
          <code className="mt-1 block truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
            {agentJsonGatePreview}
          </code>
        </div>
        <dl aria-label={t('agentSetup.gateRulesAriaLabel')} className="grid gap-1">
          {[
            { term: t('agentSetup.gateBrokenTerm'), desc: t('agentSetup.gateBrokenDesc') },
            { term: t('agentSetup.gateSlowTerm'), desc: t('agentSetup.gateSlowDesc') },
            { term: t('agentSetup.gateReadyTerm'), desc: t('agentSetup.gateReadyDesc') },
          ].map((rule) => (
            <div key={rule.term} className={DEFINITION_ROW}>
              <dt className="text-body text-[color:var(--color-text-secondary)]">
                {rule.term}
              </dt>
              <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {rule.desc}
              </dd>
            </div>
          ))}
        </dl>
        <ol
          className="grid gap-0.5 rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5"
          aria-label={t('agentSetup.cliPreviewAriaLabel')}
        >
          {AGENT_VERIFY_CLI_PREVIEW.map((command) => (
            <li key={command}>
              <code className="block truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
                {ATLAS_CLI} {command}
              </code>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            size="md"
            onClick={() => void copy('jsonGate')}
            title={t('agentSetup.copyJsonGateTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <Terminal size={ICON_SIZE.sm} aria-hidden />
            {copyJsonGateLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('verifyCli')}
            title={t('agentSetup.copyCliTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <Terminal size={ICON_SIZE.sm} aria-hidden />
            {copyCliLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('firstContactProof')}
            title={t('agentSetup.copyFirstContactProofTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <Terminal size={ICON_SIZE.sm} aria-hidden />
            {copyFirstContactProofLabel}
          </Chip>
        </div>
        <div className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {t('agentSetup.syncAfterChangeTitle')}
          </p>
          <p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">
            {t('agentSetup.syncAfterChangeDesc')}
          </p>
          <Chip
            size="md"
            onClick={() => void copy('postChangeSync')}
            title={t('agentSetup.copyPostChangeSyncTitle')}
            tone="secondary"
            className={`mt-2 ${NEUTRAL_COPY_CHIP}`}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyPostChangeSyncLabel}
          </Chip>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('agentSetup.connectGroup')}</SectionLabel>
        <dl aria-label={t('agentSetup.rootContractAriaLabel')} className="grid gap-1">
          {[
            { term: t('agentSetup.rootVaultTerm'), desc: t('agentSetup.rootVaultDesc') },
            { term: t('agentSetup.rootCodebaseTerm'), desc: t('agentSetup.rootCodebaseDesc') },
          ].map((rootMode) => (
            <div key={rootMode.term} className={DEFINITION_ROW}>
              <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                {rootMode.term}
              </dt>
              <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {rootMode.desc}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            size="md"
            onClick={() => void copy('setupCheckCli')}
            title={t('agentSetup.copySetupCheckCliTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <Terminal size={ICON_SIZE.sm} aria-hidden />
            {copySetupCheckCliLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('setupCli')}
            title={t('agentSetup.copySetupCliTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <Terminal size={ICON_SIZE.sm} aria-hidden />
            {copySetupCliLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('configTemplate')}
            title={t('agentSetup.copyTemplateTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyTemplateLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('codexTemplate')}
            title={t('agentSetup.copyCodexTemplateTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyCodexTemplateLabel}
          </Chip>
          <Chip
            size="md"
            onClick={() => void copy('codexMcpAddCommand')}
            title={t('agentSetup.copyCodexCliTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP}
          >
            <Terminal size={ICON_SIZE.sm} aria-hidden />
            {copyCodexCliLabel}
          </Chip>
        </div>
      </div>
    </>
  );
}
