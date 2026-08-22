'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCopy, Sparkles } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';
import { copyText } from '@/shared/lib/copy-text';
import { ATLAS_CLI } from '@/shared/config/cli-invocation';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The neutral chip's **face and hover**. The value layer (`controlClass`) emits shape, size, and
 * text colour only, deliberately leaving the background tint and hover to the consumer (hover
 * frequency eats the motion budget). Four slots on this surface held the same string — bundled as one.
 */
const NEUTRAL_CHIP_SKIN =
  'bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** The indigo tint chip — border, background, and hover are still outside the ramp, so kept as one set. */
const INDIGO_CHIP_SKIN =
  'border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** The primary action (indigo fill) — one set for the same reason. */
const INDIGO_SOLID_SKIN =
  'border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a18)] hover:bg-[color:var(--color-indigo-a28)]';

export const ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT =
  [
    'Use the ontology-atlas MCP server to run validate_vault, then query_ontology({ "operation": "workspace_brief" }), then query_ontology({ "operation": "agent_brief" }).',
    'Tell me whether this vault is readable and the write tools are available before proposing changes.',
    `If the MCP connector is unavailable, run this terminal setup gate from the vault folder instead: ${ATLAS_CLI} agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4.`,
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
  `${ATLAS_CLI} agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`;

export const ONTOLOGY_POST_CHANGE_SYNC_LINES = [
  'Post-change ontology sync:',
  '- If a code change introduces or renames a domain, capability, element, or relation, sync docs/ontology before finishing.',
  '- Use MCP write tools when connected; otherwise update the markdown vault deliberately and run health/validate gates.',
  '- Skip sync for typos, comments, one-line style, lint config, or fixture-only changes.',
];

interface Props {
  /** Calls `useLocalVault.scaffoldOntology()` on click, returning created/skipped. */
  onScaffold: () => Promise<{ created: number; skipped: number }>;
  /** The current vault's document count. 0 means an empty vault; above 0 shows the secondary
   *  message in the "adding a starter to an existing vault" tone. */
  docCount: number;
  /** The absolute path of the vault chosen in the installed app. With it, the copied command is directly runnable. */
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
  return `${ATLAS_CLI} agent-brief ${commandTarget(vaultPath)} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`;
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
 * The ontology starter CTA — a prominent card when the chosen vault folder is empty, a small
 * secondary button when it is not. The key entry point for "non-developers too": five seeded md
 * files plus `.mcp.json` and `.codex/config.toml`, with no terminal and no npm.
 *
 * This component only emits the result; the caller (DocsVaultPage) raises the toast that explains
 * registering an AI agent.
 */
export function OntologyStarterCta({ onScaffold, docCount, vaultPath = null }: Props) {
  const t = useTranslations('featuresMisc.starterCta');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : t('errorFallback'));
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
    // Empty vault — a large card saying "start here".
    return (
      <section
        aria-label={t('emptyAriaLabel')}
        className="rounded-panel border border-dashed border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a06)] px-5 py-6 text-center"
      >
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-indigo-accent)]">
          {t('emptyEyebrow')}
        </p>
        <h2 className="mt-2 break-keep text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t('emptyTitle')}
        </h2>
        <p className="mt-2 break-keep text-body leading-title text-[color:var(--color-text-secondary)]">
          {t.rich('emptyBodyLine1', {
            code: (chunks) => (
              <code className="rounded-micro bg-[color:var(--color-overlay-2)] px-1 font-mono text-label">
                {chunks}
              </code>
            ),
          })}
          <br />
          {t('emptyBodyLine2')}
        </p>
        <div className="mx-auto mt-4 max-w-[560px] rounded-chip border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-surface-deep-a18)] px-3 py-2 text-left">
          <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-accent)]">
            {t('definitionLabel')}
          </p>
          <p className="mt-1 break-keep text-label leading-body text-[color:var(--color-text-secondary)]">
            {t('definitionBody')}
          </p>
        </div>
        <div className="mx-auto mt-4 grid max-w-[520px] gap-2 sm:grid-cols-3">
          {proofCards.map((card) => (
            <div
              key={card.label}
              className="rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-left"
            >
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-tertiary)]">
                {card.label}
              </p>
              <p className="mt-1 break-keep text-label leading-body text-[color:var(--color-text-secondary)]">
                {card.body}
              </p>
            </div>
          ))}
        </div>
        <div
          aria-label={t('verifyAriaLabel')}
          className="mx-auto mt-4 grid max-w-[420px] gap-2 text-left"
        >
          {verificationSteps.map((step, index) => (
            <div
              key={step}
              className="grid grid-cols-[18px_1fr] items-start gap-2 rounded-chip border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-label leading-body text-[color:var(--color-text-secondary)]"
            >
              <CheckCircle2
                size={ICON_SIZE.md}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-indigo-accent)]"
              />
              <span>
                <span className="font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {index + 1}.
                </span>{' '}
                {step}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={handleCopyPrompt}
            className={controlClass({
              shape: 'chip',
              tone: 'secondary',
              className: NEUTRAL_CHIP_SKIN,
            })}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyPromptLabel}
          </button>
          <button
            type="button"
            onClick={handleCopyCliVerify}
            className={controlClass({
              shape: 'chip',
              tone: 'secondary',
              className: NEUTRAL_CHIP_SKIN,
            })}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            {copyCliLabel}
          </button>
          {/*
            When `tone: 'success'` was redefined against the text role token (a94) on 2026-08-03,
            this slot returned to the ramp. The tint surface and border are values specific to this
            slot on the signal ladder, so className wins (the same grammar as DependencyPicker's
            warning pill).
          */}
          <button
            type="button"
            onClick={handleCopyJsonGate}
            className={controlClass({
              shape: 'chip',
              tone: 'success',
              className:
                'gap-2 border-[color:var(--color-success-a28)] bg-[color:var(--color-success-a07)] hover:border-[color:var(--color-success-a42)] hover:bg-[color:var(--color-success-a11)]',
            })}
          >
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
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
            className: `mt-4 ${INDIGO_SOLID_SKIN}`,
          })}
        >
          <Sparkles size={ICON_SIZE.sm} aria-hidden />
          {busy ? t('emptyBusy') : t('emptyCta')}
        </button>
        {error ? (
          <p
            role="alert"
            className="mt-3 break-keep text-label text-[color:var(--color-status-danger)]"
          >
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  // The vault already has `.md` files — a small secondary option.
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
          className: `w-full justify-center ${INDIGO_CHIP_SKIN}`,
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
        className={controlClass({ shape: "chip", className: "w-full justify-center border-[color:var(--color-success-a28)] bg-[color:var(--color-success-a07)] px-3 py-1.5 text-label text-[color:var(--color-success-text-a94)] hover:border-[color:var(--color-success-a42)] hover:bg-[color:var(--color-success-a11)]" })}
      >
        <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
        {copyJsonGateLabel}
      </button>
    </div>
  );
}
