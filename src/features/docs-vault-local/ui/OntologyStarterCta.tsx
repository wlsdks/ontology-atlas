'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCopy, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { copyText } from '@/shared/lib/copy-text';

export const ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT =
  [
    'Use the oh-my-ontology MCP server to run validate_vault, then query_ontology({ "operation": "workspace_brief" }), then query_ontology({ "operation": "agent_brief" }).',
    'Tell me whether this vault is readable and the write tools are available before proposing changes.',
    'If the MCP connector is unavailable, run this terminal setup gate from the vault folder instead: oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4.',
    'Parse ok separately from performanceOk: ok=false means setup or fallback execution is broken; performanceOk=false with ok=true means the graph fallback works but local latency needs attention.',
    'After any non-trivial code change, sync docs/ontology before finishing when the change introduces or renames a domain, capability, element, or relation. Skip sync for typos, comments, one-line style, lint config, or fixture-only changes.',
    'Do not write to the ontology until one of those read-first checks succeeds.',
  ].join(' ');

export const ONTOLOGY_STARTER_CLI_VERIFY_COMMANDS = [
  'oh-my-ontology validate .',
  'oh-my-ontology workspace-brief .',
  'oh-my-ontology agent-brief . --prompt',
  'oh-my-ontology agent-brief . --graph-db-pack',
  'oh-my-ontology agent-brief . --verify-fallbacks',
  'oh-my-ontology mcp-verify . --timeout-ms 15000',
].join('\n');

export const ONTOLOGY_STARTER_JSON_GATE_COMMAND =
  'oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4';

export const ONTOLOGY_POST_CHANGE_SYNC_LINES = [
  'Post-change ontology sync:',
  '- If a code change introduces or renames a domain, capability, element, or relation, sync docs/ontology before finishing.',
  '- Use MCP write tools when connected; otherwise update the markdown vault deliberately and run health/validate gates.',
  '- Skip sync for typos, comments, one-line style, lint config, or fixture-only changes.',
];

interface Props {
  /** 클릭 시 useLocalVault.scaffoldOntology() 호출. created/skipped 반환. */
  onScaffold: () => Promise<{ created: number; skipped: number }>;
  /** 현재 vault 의 doc 수 — 0 이면 빈 vault. 0 보다 크면 "기존 vault 에
   *  starter 추가" 톤으로 보조 메시지 표시. */
  docCount: number;
}

/**
 * mission v2 ontology starter CTA — vault 폴더 선택 후 비어 있으면 prominent
 * 카드, 이미 있으면 작은 보조 버튼. 사용자 비전 ("비개발자도 같이") 의
 * 핵심 진입점 — 터미널 / npm 없이 5 md 시드 + .mcp.json +
 * .codex/config.toml 작성.
 *
 * AI agent (Claude Code 등) 등록 안내는 scaffold 후 toast 로 띄우는 게
 * 자연스럽지만 이 컴포넌트는 결과만 emit — 호출자 (DocsVaultPage) 가 toast.
 */
export function OntologyStarterCta({ onScaffold, docCount }: Props) {
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
    const copied = await copyText(ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT);
    setCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyCliVerify() {
    const copied = await copyText(ONTOLOGY_STARTER_CLI_VERIFY_COMMANDS);
    setCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyJsonGate() {
    const copied = await copyText(ONTOLOGY_STARTER_JSON_GATE_COMMAND);
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
    // 빈 vault — 큰 카드로 "여기서 시작" 안내
    return (
      <section
        aria-label={t('emptyAriaLabel')}
        className="rounded-2xl border border-dashed border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.06)] px-5 py-6 text-center"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-indigo-accent)]">
          {t('emptyEyebrow')}
        </p>
        <h2 className="mt-2 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t('emptyTitle')}
        </h2>
        <p className="mt-2 break-keep text-[12px] leading-6 text-[color:var(--color-text-secondary)]">
          {t.rich('emptyBodyLine1', {
            code: (chunks) => (
              <code className="rounded bg-[color:var(--color-overlay-2)] px-1 font-mono text-[10.5px]">
                {chunks}
              </code>
            ),
          })}
          <br />
          {t('emptyBodyLine2')}
        </p>
        <div className="mx-auto mt-4 max-w-[560px] rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(14,16,22,0.18)] px-3 py-2 text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
            {t('definitionLabel')}
          </p>
          <p className="mt-1 break-keep text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">
            {t('definitionBody')}
          </p>
        </div>
        <div className="mx-auto mt-4 grid max-w-[520px] gap-2 sm:grid-cols-3">
          {proofCards.map((card) => (
            <div
              key={card.label}
              className="rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-left"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                {card.label}
              </p>
              <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
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
              className="grid grid-cols-[18px_1fr] items-start gap-2 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(255,255,255,0.035)] px-3 py-2 text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]"
            >
              <CheckCircle2
                size={14}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-indigo-accent)]"
              />
              <span>
                <span className="font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
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
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyPromptLabel}
          </button>
          <button
            type="button"
            onClick={handleCopyCliVerify}
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyCliLabel}
          </button>
          <button
            type="button"
            onClick={handleCopyJsonGate}
            className="inline-flex items-center gap-2 rounded-md border border-[color:rgba(130,230,180,0.28)] bg-[color:rgba(50,185,125,0.07)] px-3 py-1.5 text-[11.5px] text-[color:rgba(180,235,205,0.94)] transition-colors hover:border-[color:rgba(130,230,180,0.42)] hover:bg-[color:rgba(50,185,125,0.11)]"
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyJsonGateLabel}
          </button>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.18)] px-4 py-2 text-[12.5px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.28)] disabled:opacity-60"
        >
          <Sparkles size={13} aria-hidden />
          {busy ? t('emptyBusy') : t('emptyCta')}
        </button>
        {error ? (
          <p
            role="alert"
            className="mt-3 break-keep text-[11.5px] text-[color:var(--color-status-danger)]"
          >
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  // 이미 vault 에 .md 가 있는 경우 — 작은 보조 옵션
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={t('secondaryTitle')}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)] disabled:opacity-60"
      >
        <Sparkles size={12} aria-hidden />
        {busy ? t('secondaryBusy') : t('secondaryLabel')}
      </button>
      <button
        type="button"
        onClick={handleCopyPrompt}
        title={t('secondaryCopyTitle')}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
      >
        <ClipboardCopy size={12} aria-hidden />
        {copyPromptLabel}
      </button>
      <button
        type="button"
        onClick={handleCopyCliVerify}
        title={t('secondaryCliTitle')}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
      >
        <ClipboardCopy size={12} aria-hidden />
        {copyCliLabel}
      </button>
      <button
        type="button"
        onClick={handleCopyJsonGate}
        title={t('secondaryJsonGateTitle')}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(130,230,180,0.28)] bg-[color:rgba(50,185,125,0.07)] px-3 py-1.5 text-[11.5px] text-[color:rgba(180,235,205,0.94)] transition-colors hover:border-[color:rgba(130,230,180,0.42)] hover:bg-[color:rgba(50,185,125,0.11)]"
      >
        <ClipboardCopy size={12} aria-hidden />
        {copyJsonGateLabel}
      </button>
    </div>
  );
}
