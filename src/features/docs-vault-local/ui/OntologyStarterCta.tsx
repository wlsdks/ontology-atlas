'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCopy, Sparkles } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';
import { copyText } from '@/shared/lib/copy-text';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import type { FailureCopy } from '@/shared/lib/use-failure-sentence';
import { ATLAS_CLI } from '@/shared/config/cli-invocation';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The neutral chip's face and hover; `controlClass` leaves background tint and hover to the
 * consumer because hover frequency eats the motion budget.
 */
const NEUTRAL_CHIP_SKIN =
  'bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** The indigo-filled primary action, shared for the same reason. */
const INDIGO_SOLID_SKIN =
  'border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a18)] hover:bg-[color:var(--color-indigo-a28)]';

export const ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT =
  [
    'Use the ontology-atlas MCP server to run validate_vault, then query_ontology({ "operation": "workspace_brief" }), then query_ontology({ "operation": "agent_brief" }).',
    'Tell me whether this vault is readable and the write tools are available before proposing changes.',
    `If the MCP connector is unavailable, run this terminal setup gate from the vault folder instead: ${ATLAS_CLI} agent-brief . --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4.`,
    'Parse ok separately from performanceOk: ok=false means setup or fallback execution is broken; performanceOk=false with ok=true means the graph fallback works but local latency needs attention.',
    'After any non-trivial code change, sync docs/ontology before finishing when the change introduces or renames a domain, capability, element, or relation. Skip sync for typos, comments, one-line style, lint config, or fixture-only changes.',
    'Do not write to the ontology until one of those read-first checks succeeds.',
  ].join(' ');

export const ONTOLOGY_STARTER_CLI_VERIFY_COMMANDS = [
  `${ATLAS_CLI} validate .`,
  `${ATLAS_CLI} workspace-brief .`,
  `${ATLAS_CLI} agent-brief . --prompt`,
  `${ATLAS_CLI} agent-brief . --graph-db-pack`,
  `${ATLAS_CLI} agent-brief . --verify-fallbacks`,
  `${ATLAS_CLI} mcp-verify . --timeout-ms 15000`,
].join('\n');

export const ONTOLOGY_STARTER_JSON_GATE_COMMAND =
  `${ATLAS_CLI} agent-brief . --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`;

export const ONTOLOGY_POST_CHANGE_SYNC_LINES = [
  'Post-change ontology sync:',
  '- If a code change introduces or renames a domain, capability, element, or relation, sync docs/ontology before finishing.',
  '- Use MCP write tools when connected; otherwise update the markdown vault deliberately and run health/validate gates.',
  '- Skip sync for typos, comments, one-line style, lint config, or fixture-only changes.',
];

interface Props {
  /** Calls `useLocalVault.scaffoldOntology()`. */
  onScaffold: () => Promise<{ created: number; skipped: number }>;
  /** 0 means an empty vault; above 0 shows the add-to-existing-vault tone. */
  docCount: number;
  /** The installed app's vault path; with it the copied command runs as is. */
  vaultPath?: string | null;
}

function shellQuotePath(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function commandTarget(vaultPath?: string | null): string {
  return vaultPath ? shellQuotePath(vaultPath) : '.';
}

export function buildOntologyStarterCliVerifyCommands(
  vaultPath?: string | null,
): string {
  const target = commandTarget(vaultPath);
  return [
    `${ATLAS_CLI} validate ${target}`,
    `${ATLAS_CLI} workspace-brief ${target}`,
    `${ATLAS_CLI} agent-brief ${target} --prompt`,
    `${ATLAS_CLI} agent-brief ${target} --graph-db-pack`,
    `${ATLAS_CLI} agent-brief ${target} --verify-fallbacks`,
    `${ATLAS_CLI} mcp-verify ${target} --timeout-ms 15000`,
  ].join('\n');
}

export function buildOntologyStarterJsonGateCommand(
  vaultPath?: string | null,
): string {
  return `${ATLAS_CLI} agent-brief ${commandTarget(vaultPath)} --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`;
}

export function buildOntologyStarterAgentVerifyPrompt(
  vaultPath?: string | null,
): string {
  const jsonGate = buildOntologyStarterJsonGateCommand(vaultPath);
  return [
    'Use the ontology-atlas MCP server to run validate_vault, then query_ontology({ "operation": "workspace_brief" }), then query_ontology({ "operation": "agent_brief" }).',
    'Tell me whether this vault is readable and the write tools are available before proposing changes.',
    `If the MCP connector is unavailable, run this terminal setup gate instead: ${jsonGate}.`,
    'Parse ok separately from performanceOk: ok=false means setup or fallback execution is broken; performanceOk=false with ok=true means the graph fallback works but local latency needs attention.',
    'After any non-trivial code change, sync docs/ontology before finishing when the change introduces or renames a domain, capability, element, or relation. Skip sync for typos, comments, one-line style, lint config, or fixture-only changes.',
    'Do not write to the ontology until one of those read-first checks succeeds.',
  ].join(' ');
}

/**
 * A prominent card for an empty vault, a small secondary button otherwise: five seeded md files
 * plus `.mcp.json` and `.codex/config.toml`, with no terminal or npm. The caller raises the toast.
 */
export function OntologyStarterCta({ onScaffold, docCount, vaultPath = null }: Props) {
  const t = useTranslations('featuresMisc.starterCta');
  const failureSentence = useFailureSentence();
  const [busy, setBusy] = useState(false);
  /*
   * A sentence plus its English detail, never the thrown message: `permission-denied` and
   * `already-exists` have catalogue sentences; the thrown English goes to `data-failure-detail`.
   */
  const [error, setError] = useState<FailureCopy | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [cliCopyState, setCliCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [jsonGateCopyState, setJsonGateCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const isEmpty = docCount === 0;
  const verificationSteps = [
    t('verifyStepFiles'),
    t('verifyStepMcp'),
    t('verifyStepCli'),
  ];
  const proofCards = [
    { label: t('proofLocalLabel'), body: t('proofLocalBody') },
    { label: t('proofGraphLabel'), body: t('proofGraphBody') },
    { label: t('proofAgentLabel'), body: t('proofAgentBody') },
  ];

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      await onScaffold();
    } catch (err) {
      setError(failureSentence(err, t('errorFallback')));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyPrompt() {
    const copied = await copyText(buildOntologyStarterAgentVerifyPrompt(vaultPath));
    setCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyCliVerify() {
    const copied = await copyText(buildOntologyStarterCliVerifyCommands(vaultPath));
    setCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyJsonGate() {
    const copied = await copyText(buildOntologyStarterJsonGateCommand(vaultPath));
    setJsonGateCopyState(copied ? 'copied' : 'failed');
  }

  const copyPromptLabel =
    copyState === 'copied'
      ? t('copyPromptCopied')
      : copyState === 'failed'
        ? t('copyPromptFailed')
        : t('copyPromptLabel');
  const copyCliLabel =
    cliCopyState === 'copied'
      ? t('copyCliCopied')
      : cliCopyState === 'failed'
        ? t('copyCliFailed')
        : t('copyCliLabel');
  const copyJsonGateLabel =
    jsonGateCopyState === 'copied'
      ? t('copyJsonGateCopied')
      : jsonGateCopyState === 'failed'
        ? t('copyJsonGateFailed')
        : t('copyJsonGateLabel');

  if (isEmpty) {
    return (
      <section
        aria-label={t('emptyAriaLabel')}
        className="rounded-panel border border-dashed border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a06)] px-4 py-5 sm:px-6 sm:py-6"
      >
        <div className="@container/ontology-starter mx-auto grid w-full max-w-[var(--measure-note-column)] gap-4 text-left">
          <header className="grid gap-1.5">
            <p className="font-mono text-caption leading-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-indigo-accent)]">
              {t('emptyEyebrow')}
            </p>
            <h2 className="break-keep text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
              {t('emptyTitle')}
            </h2>
            <div className="grid gap-1">
              <p className="break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
                {t.rich('emptyBodyLine1', {
                  code: (chunks) => (
                    <code className="rounded-micro bg-[color:var(--color-overlay-2)] px-1 font-mono text-label">
                      {chunks}
                    </code>
                  ),
                })}
              </p>
              <p className="break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
                {t('emptyBodyLine2')}
              </p>
            </div>
          </header>

          <div className="w-full rounded-chip border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-surface-deep-a18)] px-3 py-3">
            <p className="text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-indigo-accent)]">
              {t('definitionLabel')}
            </p>
            <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]">
              {t('definitionBody')}
            </p>
          </div>

          <div className="grid w-full auto-rows-fr gap-2 @min-[32rem]/ontology-starter:grid-cols-3">
            {proofCards.map((card) => (
              <div
                key={card.label}
                className="flex h-full flex-col rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-3"
              >
                <p className="text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]">
                  {card.label}
                </p>
                <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]">
                  {card.body}
                </p>
              </div>
            ))}
          </div>

          <div aria-label={t('verifyAriaLabel')} className="grid w-full gap-2">
            {verificationSteps.map((step, index) => (
              <div
                key={step}
                className="grid grid-cols-[18px_1fr] items-start gap-2 rounded-chip border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-label leading-label text-[color:var(--color-text-secondary)]"
              >
                <CheckCircle2
                  size={ICON_SIZE.md}
                  aria-hidden
                  className="text-[color:var(--color-indigo-accent)]"
                />
                <span>
                  <span className="font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]">
                    {index + 1}.
                  </span>{' '}
                  {step}
                </span>
              </div>
            ))}
          </div>

          <div className="grid w-full gap-3">
            <div className="grid w-full grid-cols-1 gap-2 @min-[32rem]/ontology-starter:grid-cols-3">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className={controlClass({
                  shape: 'chip',
                  tone: 'secondary',
                  className: `w-full min-w-0 justify-center text-center ${NEUTRAL_CHIP_SKIN}`,
                })}
              >
                <ClipboardCopy size={ICON_SIZE.sm} className="shrink-0" aria-hidden />
                {copyPromptLabel}
              </button>
              <button
                type="button"
                onClick={handleCopyCliVerify}
                className={controlClass({
                  shape: 'chip',
                  tone: 'secondary',
                  className: `w-full min-w-0 justify-center text-center ${NEUTRAL_CHIP_SKIN}`,
                })}
              >
                <ClipboardCopy size={ICON_SIZE.sm} className="shrink-0" aria-hidden />
                {copyCliLabel}
              </button>
              <button
                type="button"
                onClick={handleCopyJsonGate}
                className={controlClass({
                  shape: 'chip',
                  tone: 'secondary',
                  className: `w-full min-w-0 justify-center text-center ${NEUTRAL_CHIP_SKIN}`,
                })}
              >
                <ClipboardCopy size={ICON_SIZE.sm} className="shrink-0" aria-hidden />
                {copyJsonGateLabel}
              </button>
            </div>
            <button
              type="button"
              onClick={handleClick}
              disabled={busy}
              className={controlClass({
                shape: 'chip',
                size: 'lg',
                tone: 'strong',
                className: `w-full justify-center @min-[32rem]/ontology-starter:w-auto @min-[32rem]/ontology-starter:justify-self-end ${INDIGO_SOLID_SKIN}`,
              })}
            >
              <Sparkles size={ICON_SIZE.sm} aria-hidden />
              {busy ? t('emptyBusy') : t('emptyCta')}
            </button>
            {error ? (
              <p
                role="alert"
                data-failure-detail={error.detail ?? undefined}
                className="break-keep text-label leading-label text-[color:var(--color-status-danger)]"
              >
                {error.sentence}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  // The vault already has `.md` files.
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={t('secondaryTitle')}
        className={controlClass({
          shape: 'chip',
          tone: 'secondary',
          className: `w-full justify-center ${NEUTRAL_CHIP_SKIN}`,
        })}
      >
        <Sparkles size={ICON_SIZE.sm} aria-hidden />
        {busy ? t('secondaryBusy') : t('secondaryLabel')}
      </button>
      <button
        type="button"
        onClick={handleCopyPrompt}
        title={t('secondaryCopyTitle')}
        className={controlClass({
          shape: 'chip',
          tone: 'secondary',
          className: `w-full justify-center ${NEUTRAL_CHIP_SKIN}`,
        })}
      >
        <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
        {copyPromptLabel}
      </button>
      <button
        type="button"
        onClick={handleCopyCliVerify}
        title={t('secondaryCliTitle')}
        className={controlClass({
          shape: 'chip',
          tone: 'secondary',
          className: `w-full justify-center ${NEUTRAL_CHIP_SKIN}`,
        })}
      >
        <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
        {copyCliLabel}
      </button>
      <button
        type="button"
        onClick={handleCopyJsonGate}
        title={t('secondaryJsonGateTitle')}
        className={controlClass({
          shape: 'chip',
          tone: 'secondary',
          className: `w-full justify-center ${NEUTRAL_CHIP_SKIN}`,
        })}
      >
        <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
        {copyJsonGateLabel}
      </button>
    </div>
  );
}
