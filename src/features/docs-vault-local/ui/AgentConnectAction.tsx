'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CircleAlert, ClipboardCopy, FileText, Loader2 } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { McpServerLaunch } from '@/shared/config';
import { buildAgentAnalyzePrompt } from '@/shared/config/agent-prompts';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { controlClass } from '@/shared/ui/control-class';
import { type AgentClientId, filesForClient } from '../lib/agent-clients';
import {
  planAgentConfig,
  verifyMcpServer,
  writeAgentConfig,
  type AgentConfigPlan,
  type McpVerifyResult,
} from '@/shared/lib/tauri-agent-setup';

import {
  agentConfigContents,
  mergeMcpServersJson,
  vaultPathRelativeToConfigRoot,
} from '../lib/agent-config-contents';

/**
 * "Connect an agent" — preview → approve → write → self-verify.
 *
 * This component exists for **the two middle steps**. If the app writes files to the user's disk, it
 * must first show what it will write and require a press (trust charter: zero silent writes,
 * auditable by git diff). And after writing it must prove on the spot that the result actually
 * connects — one real round trip instead of a fake progress bar.
 *
 * Failures are not hidden. The failure sentence *is* the user's next action.
 */

type Phase = 'idle' | 'planning' | 'preview' | 'writing' | 'verifying' | 'done' | 'failed';

export interface AgentConnectActionProps {
  /** The vault's absolute path. Without it (the web) this component renders nothing. */
  vaultPath: string | null;
  /** The bundled server's launch contract. Without it, nothing is rendered. */
  launch: McpServerLaunch | null;
  /** Hook to re-read vault state after the write finishes (refreshing the settings badge). */
  onWritten?: (() => void | Promise<void>) | null;
  /**
   * **Which tool is being connected.** This value decides which files are written
   * (`lib/agent-clients.ts`).
   *
   * Until 2026-07-30 this prop did not exist, so the whole of `plan.targets` was iterated — one
   * press of "Connect to Claude Code" wrote `.mcp.json`, `.mcp.json.example`, and
   * `.codex/config.toml`. That is a label telling a lie, and it puts an unused tool's file into the
   * user's git diff.
   *
   * There is no default — with one, the next person to use this component could omit the tool and
   * have it work silently, which is exactly how the defect arose.
   */
  clientId: AgentClientId;
}

/**
 * The face and hover of the indigo-filled primary action. The value layer (`controlClass`) emits
 * shape, size, and text colour only, leaving tint and hover to the consumer — this surface's two
 * slots (preview and confirm) share the string, so they are bundled as one.
 */
const INDIGO_SOLID_SKIN =
  'w-full justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a26)]';

export function AgentConnectAction({ vaultPath, launch, onWritten, clientId }: AgentConnectActionProps) {
  const t = useTranslations('agentConnect');
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<AgentConfigPlan | null>(null);
  const [verification, setVerification] = useState<McpVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state: analyzeCopy, copy: copyAnalyze } = useCopyFeedback();

  const startPreview = useCallback(async () => {
    if (!vaultPath) return;
    setPhase('planning');
    setError(null);
    try {
      const next = await planAgentConfig(vaultPath);
      if (!next) {
        setError(t('connectDesktopOnly'));
        setPhase('failed');
        return;
      }
      setPlan(next);
      setPhase('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('failed');
    }
  }, [vaultPath, t]);

  const confirmWrite = useCallback(async () => {
    if (!vaultPath || !launch || !plan) return;
    setPhase('writing');
    setError(null);
    try {
      const vaultRelative = vaultPathRelativeToConfigRoot(plan.configRoot, plan.vaultPath);
      /**
       * Writes **only the files this tool declares**. `plan.targets` is the list of what the app
       * **may** write, not the list this click will write — reading those two as the same thing was
       * the defect itself.
       */
      const wanted = new Set(filesForClient(clientId));
      /*
       * ⚠️ **Do not erase what was already there** (caught in review, 2026-08-16).
       *
       * Files used to be built from scratch and overwritten wholesale. With another MCP server
       * registered in that repository, **one click removed all of them.** For the same file the CLI
       * does exactly the opposite (replacing only our entry and preserving the rest) — one file, two
       * surfaces, opposite directions of safety.
       *
       * An unreadable file is **skipped.** Overwriting a file you cannot read is the same as
       * deleting it.
       */
      const skipped: string[] = [];
      const writes = plan.targets
        .filter((target) => wanted.has(target.fileName))
        .flatMap((target) => {
          const fresh = agentConfigContents({
            fileName: target.fileName,
            launch,
            vaultRelative,
            vaultAbsolute: plan.vaultPath,
          });
          // Only the `.mcp.json` family has known merge rules. The rest (the example file, the codex
          // toml) are written with our own content as before.
          if (!target.fileName.endsWith('.mcp.json')) {
            return [{ fileName: target.fileName, contents: fresh }];
          }
          const merged = mergeMcpServersJson(target.currentContents ?? null, fresh);
          if (!merged.ok) {
            skipped.push(target.fileName);
            return [];
          }
          return [{ fileName: target.fileName, contents: merged.text }];
        });
      await writeAgentConfig(vaultPath, writes);
      if (skipped.length > 0) {
        setError(t('mergeSkipped', { files: skipped.join(' · ') }));
      }
      await onWritten?.();
      setPhase('verifying');
      const result = await verifyMcpServer(vaultPath);
      setVerification(result);
      setPhase(result.ok ? 'done' : 'failed');
      if (!result.ok) setError(result.failure);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('failed');
    }
  }, [vaultPath, launch, plan, onWritten, clientId, t]);

  if (!vaultPath || !launch) return null;

  const busy = phase === 'planning' || phase === 'writing' || phase === 'verifying';

  return (
    <div className="flex flex-col gap-2.5" data-testid="agent-connect-action">
      {phase === 'idle' || phase === 'planning' ? (
        <button
          type="button"
          onClick={() => void startPreview()}
          disabled={busy}
          data-testid="agent-connect-preview"
          className={controlClass({
            shape: 'chip',
            size: 'lg',
            tone: 'strong',
            className: INDIGO_SOLID_SKIN,
          })}
        >
          {phase === 'planning' ? (
            <Loader2 size={ICON_SIZE.sm} aria-hidden className="animate-spin" />
          ) : (
            <FileText size={ICON_SIZE.sm} aria-hidden />
          )}
          {t('connectPreviewCta')}
        </button>
      ) : null}

      {plan && (phase === 'preview' || phase === 'writing') ? (
        <div
          data-testid="agent-connect-plan"
          className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          <p className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {plan.rootKind === 'repo-root'
              ? t('connectPlanRepoRoot', { path: plan.configRoot })
              : t('connectPlanVaultFolder', { path: plan.configRoot })}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {/*
              * **The preview draws only what will be written.** Filtering `confirmWrite` alone and
              * leaving this list untouched made the screen promise five and write one — which turns
              * the name "See what will be written" into a lie. It was the other half of the original
              * defect (the label lying).
              */}
            {plan.targets
              .filter((target) => filesForClient(clientId).includes(target.fileName))
              .map((target) => (
              <li
                key={target.fileName}
                className="flex items-baseline justify-between gap-2 font-mono text-caption text-[color:var(--color-text-tertiary)]"
              >
                <span className="truncate">{target.absolutePath}</span>
                <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  {target.exists ? t('connectPlanOverwrite') : t('connectPlanCreate')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption leading-label text-[color:var(--color-text-quaternary)]">
            {t('connectPlanAuditNote')}
          </p>
          <button
            type="button"
            onClick={() => void confirmWrite()}
            disabled={busy}
            data-testid="agent-connect-confirm"
            className={controlClass({
              shape: 'chip',
              size: 'lg',
              tone: 'strong',
              className: `mt-2.5 ${INDIGO_SOLID_SKIN}`,
            })}
          >
            {phase === 'writing' ? <Loader2 size={ICON_SIZE.sm} aria-hidden className="animate-spin" /> : null}
            {t('connectConfirmCta')}
          </button>
        </div>
      ) : null}

      {phase === 'verifying' ? (
        <p
          data-testid="agent-connect-verifying"
          className="inline-flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]"
        >
          <Loader2 size={ICON_SIZE.sm} aria-hidden className="animate-spin" />
          {t('connectVerifying')}
        </p>
      ) : null}

      {phase === 'done' && verification ? (
        <div
          role="status"
          data-testid="agent-connect-verified"
          className="rounded-chip border border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a10)] px-3 py-2.5"
        >
          <p className="inline-flex items-center gap-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            <Check size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-success)]" />
            {t('connectVerifiedTitle')}
          </p>
          <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t('connectVerifiedDesc', {
              tools: verification.toolCount ?? 0,
              node: verification.sampleTitle ?? verification.sampleSlug ?? '',
            })}
          </p>
          {/*
           * A restart is **a condition, not the next step** — kept one rung lower so the CTA remains
           * the action winner (hierarchy verdict: a precondition is read before an action).
           */}
          <p className="mt-1 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {t('connectVerifiedRestart')}
          </p>
          {/*
           * Connecting and stopping leaves the user sitting on "so now what". The card's last line
           * puts the next step in their hand — we cannot push a command into that session (MCP is a
           * pull model where the agent spawns the server, so there is no inbound channel), so we give
           * them a sentence to paste. The label carries the precondition by saying "in the restarted
           * session".
           */}
          <button
            type="button"
            data-testid="agent-connect-copy-analyze"
            onClick={() => void copyAnalyze(buildAgentAnalyzePrompt({ vaultPath }))}
            className={controlClass({ hoverInk: 'strong',
              shape: 'chip',
              tone: 'secondary',
              className: 'mt-2.5 border-[color:var(--color-overlay-3)] hover:border-[color:var(--color-indigo-line-a35)]',
            })}
          >
            {analyzeCopy === 'failed' ? (
              <CircleAlert size={ICON_SIZE.sm} aria-hidden />
            ) : (
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
            )}
            {analyzeCopy === 'copied'
              ? t('connectVerifiedCopied')
              : analyzeCopy === 'failed'
                ? t('connectVerifiedCopyFailed')
                : t('connectVerifiedCopyAnalyze')}
          </button>
        </div>
      ) : null}

      {phase === 'failed' ? (
        <div
          role="status"
          data-testid="agent-connect-failed"
          className="rounded-chip border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a10)] px-3 py-2.5"
        >
          <p className="inline-flex items-center gap-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            <CircleAlert size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-danger)]" />
            {t('connectFailedTitle')}
          </p>
          <p className="mt-1 break-words text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {error ?? t('connectFailedUnknown')}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase('idle');
              setPlan(null);
              setVerification(null);
              setError(null);
            }}
            data-testid="agent-connect-retry"
            className={controlClass({ hoverInk: 'strong',
              shape: 'link',
              tone: 'accentOnTint',
              className: 'touch-hit-expand mt-2 font-[var(--font-weight-signature)]',
            })}
          >
            {t('connectRetry')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
