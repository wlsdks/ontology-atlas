'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCopy, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { copyText } from '@/shared/lib/copy-text';
import { ATLAS_CLI } from '@/shared/config/cli-invocation';
import { controlClass } from '@/shared/ui/control-class';

/**
 * 중립 칩의 **면과 호버.** 값 층(`controlClass`)은 모양·크기·글자색만 내고
 * 배경 틴트와 호버는 일부러 소비처에 남긴다(호버 빈도가 모션 예산을 깎으므로).
 * 이 표면에서 네 자리가 같은 문자열을 들고 있었다 — 한 벌로 묶는다.
 */
const NEUTRAL_CHIP_SKIN =
  'bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** 인디고 틴트 칩 — 테두리·배경·호버가 아직 램프 밖이라 한 벌로 둔다. */
const INDIGO_CHIP_SKIN =
  'border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** 주 행동(인디고 채움) — 같은 이유로 한 벌. */
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
  /** 클릭 시 useLocalVault.scaffoldOntology() 호출. created/skipped 반환. */
  onScaffold: () => Promise<{ created: number; skipped: number }>;
  /** 현재 vault 의 doc 수 — 0 이면 빈 vault. 0 보다 크면 "기존 vault 에
   *  starter 추가" 톤으로 보조 메시지 표시. */
  docCount: number;
  /** Installed app 에서 선택한 vault 절대경로. 있으면 복사 명령이 바로 실행 가능해진다. */
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
 * mission v2 ontology starter CTA — vault 폴더 선택 후 비어 있으면 prominent
 * 카드, 이미 있으면 작은 보조 버튼. 사용자 비전 ("비개발자도 같이") 의
 * 핵심 진입점 — 터미널 / npm 없이 5 md 시드 + .mcp.json +
 * .codex/config.toml 작성.
 *
 * AI agent (Claude Code 등) 등록 안내는 scaffold 후 toast 로 띄우는 게
 * 자연스럽지만 이 컴포넌트는 결과만 emit — 호출자 (DocsVaultPage) 가 toast.
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
    // 빈 vault — 큰 카드로 "여기서 시작" 안내
    return (
      <section
        aria-label={t('emptyAriaLabel')}
        className="rounded-2xl border border-dashed border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a06)] px-5 py-6 text-center"
      >
        <p className="font-mono text-caption uppercase tracking-[0.16em] text-[color:var(--color-indigo-accent)]">
          {t('emptyEyebrow')}
        </p>
        <h2 className="mt-2 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t('emptyTitle')}
        </h2>
        <p className="mt-2 break-keep text-body leading-6 text-[color:var(--color-text-secondary)]">
          {t.rich('emptyBodyLine1', {
            code: (chunks) => (
              <code className="rounded bg-[color:var(--color-overlay-2)] px-1 font-mono text-label">
                {chunks}
              </code>
            ),
          })}
          <br />
          {t('emptyBodyLine2')}
        </p>
        <div className="mx-auto mt-4 max-w-[560px] rounded-chip border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-surface-deep-a18)] px-3 py-2 text-left">
          <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
            {t('definitionLabel')}
          </p>
          <p className="mt-1 break-keep text-label leading-5 text-[color:var(--color-text-secondary)]">
            {t('definitionBody')}
          </p>
        </div>
        <div className="mx-auto mt-4 grid max-w-[520px] gap-2 sm:grid-cols-3">
          {proofCards.map((card) => (
            <div
              key={card.label}
              className="rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-left"
            >
              <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                {card.label}
              </p>
              <p className="mt-1 break-keep text-label leading-5 text-[color:var(--color-text-secondary)]">
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
              className="grid grid-cols-[18px_1fr] items-start gap-2 rounded-chip border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-label leading-5 text-[color:var(--color-text-secondary)]"
            >
              <CheckCircle2
                size={14}
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
            <ClipboardCopy size={12} aria-hidden />
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
            <ClipboardCopy size={12} aria-hidden />
            {copyCliLabel}
          </button>
          {/*
            램프 밖으로 **남긴다** — `tone: 'success'` 는 신호색
            `--color-status-success`(#32b97d) 를 내는데, 이 자리(그리고 앱의 성공
            틴트 전부)는 글자 역할 토큰 `--color-success-text-a94` 를 쓴다.
            `tone: 'danger'` 만 글자 역할 토큰(`--color-danger-text`)을 쓰고
            success/warning 은 신호 토큰을 써서 셋의 역할이 어긋나 있다.
            억지로 맞추면 색이 바뀌므로 값 층이 먼저 정해야 한다.
          */}
          <button
            type="button"
            onClick={handleCopyJsonGate}
            className="inline-flex items-center gap-2 rounded-chip border border-[color:var(--color-success-a28)] bg-[color:var(--color-success-a07)] px-3 py-1.5 text-label text-[color:var(--color-success-text-a94)] transition-colors hover:border-[color:var(--color-success-a42)] hover:bg-[color:var(--color-success-a11)]"
          >
            <ClipboardCopy size={12} aria-hidden />
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
          <Sparkles size={13} aria-hidden />
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

  // 이미 vault 에 .md 가 있는 경우 — 작은 보조 옵션
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
        <Sparkles size={12} aria-hidden />
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
        <ClipboardCopy size={12} aria-hidden />
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
        <ClipboardCopy size={12} aria-hidden />
        {copyCliLabel}
      </button>
      <button
        type="button"
        onClick={handleCopyJsonGate}
        title={t('secondaryJsonGateTitle')}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-chip border border-[color:var(--color-success-a28)] bg-[color:var(--color-success-a07)] px-3 py-1.5 text-label text-[color:var(--color-success-text-a94)] transition-colors hover:border-[color:var(--color-success-a42)] hover:bg-[color:var(--color-success-a11)]"
      >
        <ClipboardCopy size={12} aria-hidden />
        {copyJsonGateLabel}
      </button>
    </div>
  );
}
