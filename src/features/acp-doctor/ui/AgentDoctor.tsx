'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CheckCircle2, ChevronDown, RotateCcw, Stethoscope } from 'lucide-react';

import { Chip } from '@/shared/ui/controls';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { formatDownloadProgress } from '@/shared/lib/progress-format';
import {
  type AcpCheck,
  type AcpInstallProgress,
  agentInstallPlan,
  diagnoseAgent,
  formatBytes,
  installAgentCli,
  installManagedNode,
  lastInstallProgress,
  listenInstallProgress,
  nodeInstallPlan,
  repairAgentCheck,
  resetAgentConnection,
} from '../model/acp-doctor';

/**
 * Measures step by step why an agent connection fails and fixes here what can be fixed.
 * Unknown is never drawn as ok, and a fix shows the re-measured value rather than a claim.
 * An all-clear folds to one line; only blocked checks unfold.
 */
/**
 * Checks with a written next step; meaningful only for problems the app cannot fix.
 * An id absent here has no copy, and asking for it would print the key.
 */
const NEXT_STEP = new Set(['cli', 'launcher', 'login', 'gate']);

/**
 * Returns the check button and the results separately: the button sits in the row and the
 * results go full width beneath it.
 */
export function useAgentDoctor(
  runtimeId: string,
  /**
   * Called when the app changed something so the list is re-measured; without it the badge
   * above and the diagnosis below would disagree.
   */
  onChanged?: () => void,
) {
  const t = useTranslations('acpChat.doctor');
  const [checks, setChecks] = useState<AcpCheck[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /* `null` draws nothing: no 0% bar for work that has not started. */
  const [progress, setProgress] = useState<AcpInstallProgress | null>(null);

  /*
   * Attaches once: re-attaching per install press misses the first event Rust emits ahead of it.
   */
  useEffect(() => {
    let alive = true;
    let stop: (() => void) | null = null;
    void listenInstallProgress(runtimeId, (next) => {
      if (alive) setProgress(next);
    }).then((unlisten) => {
      if (alive) stop = unlisten;
      else unlisten();
    });
    /*
     * The sheet unmounts when closed and `done` is a single event, so the last state is fetched on
     * mount. A value already received is newer and is not overwritten.
     */
    void lastInstallProgress(runtimeId).then((last) => {
      if (alive && last) setProgress((current) => current ?? last);
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [runtimeId]);

  const run = useCallback(async () => {
    setBusy('scan');
    setFailed(false);
    // A new check clears the previous install result so it does not look just finished.
    setProgress(null);
    try {
      setChecks(await diagnoseAgent(runtimeId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId]);

  /** Runs one app-side change and draws the re-measured checks it returns. */
  const applyChange = useCallback(
    async (busyKey: string, change: () => Promise<AcpCheck[]>) => {
      setBusy(busyKey);
      setFailed(false);
      try {
        setChecks(await change());
        onChanged?.();
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const fix = useCallback(
    (checkId: string) => applyChange(checkId, () => repairAgentCheck(runtimeId, checkId)),
    [applyChange, runtimeId],
  );
  const reset = useCallback(
    () => applyChange('reset', () => resetAgentConnection(runtimeId)),
    [applyChange, runtimeId],
  );

  /**
   * The install command, shown before pressing. Asked only when the tool is missing, so a healthy
   * tool gets no install offer.
   */
  const [installPlan, setInstallPlan] = useState<string | null>(null);
  const toolMissing = useMemo(
    () => (checks ?? []).some((check) => check.id === 'cli' && check.state === 'problem'),
    [checks],
  );
  useEffect(() => {
    // No synchronous setState in the effect body (a ratchet catches it); a healthy tool hides the
    // plan because the render condition also reads `toolMissing`.
    if (!toolMissing) return;
    let alive = true;
    void agentInstallPlan(runtimeId).then((plan) => {
      if (alive) setInstallPlan(plan);
    });
    return () => {
      alive = false;
    };
  }, [toolMissing, runtimeId]);

  /** The Node download plan, asked only when launching the tool is blocked. */
  const [nodePlan, setNodePlan] = useState<string | null>(null);
  const launcherMissing = useMemo(
    () => (checks ?? []).some((check) => check.id === 'launcher' && check.state === 'problem'),
    [checks],
  );
  useEffect(() => {
    if (!launcherMissing) return;
    let alive = true;
    void nodeInstallPlan().then((plan) => {
      if (alive) setNodePlan(plan);
    });
    return () => {
      alive = false;
    };
  }, [launcherMissing]);

  const getNode = useCallback(
    () => applyChange('node', () => installManagedNode(runtimeId)),
    [applyChange, runtimeId],
  );
  const install = useCallback(
    () => applyChange('install', () => installAgentCli(runtimeId)),
    [applyChange, runtimeId],
  );

  /** True when an earlier step is blocked; reconnect is hidden then, because rebuilding the config cannot help. */
  const prerequisiteBlocked = useMemo(
    () => (checks ?? []).some((check) => check.blocked),
    [checks],
  );

  const blocked = useMemo(
    () => (checks ?? []).filter((check) => check.state !== 'ok'),
    [checks],
  );

  const scanButton = (
    <>
    {/*
      Uses the `Chip` primitive: a hand-written button reads as a different object beside it,
      and a ratchet blocks new hand-written controls.
    */}
    <Chip
      /*
       * `lg` matches the chat chip beside it; the order is said by ink instead: `default` puts
       * the check after the chat chip and the install link.
       */
      size="lg"
      tone="default"
      hoverInk="strong"
      hoverBorder="strong"
      data-testid="agent-doctor-scan"
      disabled={busy !== null}
      onClick={() => void run()}
      className="shrink-0 border-[color:var(--color-border-soft)]"
    >
      <Stethoscope size={ICON_SIZE.md} aria-hidden />
      {busy === 'scan' ? t('scanning') : t('scan')}
    </Chip>
    {/*
      Reconnect, not log out: the app has no login of its own, so a logout would erase someone
      else's login. Offered only after check results, or it reads as a sign of trouble.
    */}
    {checks && !prerequisiteBlocked ? (
      <Chip
        /* Same row as the scan chip above, so the same step. */
        size="lg"
        tone="default"
        hoverInk="strong"
        hoverBorder="strong"
        data-testid="agent-doctor-reset"
        disabled={busy !== null}
        onClick={() => void reset()}
        className="ml-1.5 shrink-0 border-[color:var(--color-border-soft)]"
      >
        <RotateCcw size={ICON_SIZE.md} aria-hidden />
        {busy === 'reset' ? t('resetting') : t('reset')}
      </Chip>
    ) : null}
    </>
  );

  /**
   * Progress rules: never draw an unknown percentage (npm has no total, so its output line shows
   * instead), and record completion, since a list turning green does not say the press succeeded.
   */
  const percent =
    progress && progress.received !== null
      ? formatDownloadProgress(progress.received, progress.total)
      : null;
  const doneNow = progress?.stage === 'done';
  const progressRow = progress ? (
    <div
      data-testid="agent-doctor-progress"
      data-job={progress.job}
      data-stage={progress.stage}
      role="status"
      aria-live="polite"
      className="mb-2 flex min-w-0 flex-col gap-1"
    >
      <p className="flex min-w-0 items-center gap-1.5 break-keep text-label leading-prose text-[color:var(--color-text-secondary)]">
        {doneNow ? (
          <CheckCircle2
            size={ICON_SIZE.sm}
            aria-hidden
            className="shrink-0 text-[color:var(--color-success-text-a90)]"
          />
        ) : null}
        <span className="min-w-0 flex-1">
          {t(`progress.${progress.job}.${progress.stage}`)}
          {percent ? (
            <span className="ml-1.5 text-[color:var(--color-text-tertiary)]">
              {percent}
              {progress.total !== null ? (
                <span className="ml-1 text-[color:var(--color-text-quaternary)]">
                  {formatBytes(progress.received ?? 0)} / {formatBytes(progress.total)}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </p>
      {percent ? (
        /* A bar only while the total is known. */
        <span
          data-testid="agent-doctor-progress-bar"
          aria-hidden
          className="block h-1 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
        >
          <span
            className="block h-full rounded-full bg-[color:var(--color-indigo-brand)] transition-[width]"
            style={{ width: percent }}
          />
        </span>
      ) : progress.note ? (
        /*
         * Without a percentage, the tool's own line is shown, cut to one line (npm emits hundreds).
         */
        <code
          data-testid="agent-doctor-progress-note"
          className="block min-w-0 truncate text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {progress.note}
        </code>
      ) : null}
    </div>
  ) : null;

  const result =
    failed || checks || progress ? (
      <div
        data-testid="agent-doctor"
        data-blocked={blocked.length}
        className="mt-1.5 min-w-0 border-t border-[color:var(--color-divider)] pt-2"
      >
        {progressRow}
        {/*
          No `checks` means not measured, not fine: without this guard, progress alone would render
          "no problems right now". The verdict needs a measurement; the progress line stays above.
        */}
        {failed ? (
          <p
            data-testid="agent-doctor-failure"
            className="break-keep text-label leading-prose text-[color:var(--color-status-danger)]"
          >
            {t('failed')}
          </p>
        ) : !checks ? null : blocked.length === 0 ? (
          /*
           * All-clear is one plain sentence with no count (the check count differs per tool), and the
           * checks fold into a `<details>` with a rotating chevron so it looks openable.
           */
          <details data-testid="agent-doctor-all-clear" className="group">
            <summary
              className={controlClass({
                shape: 'link',
                size: 'sm',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'list-none',
              })}
            >
              {t('allClear')}
              <span className="ml-1.5 inline-flex items-center gap-1 text-[color:var(--color-text-quaternary)]">
                {t('whatWeChecked')}
                <ChevronDown
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className="transition-transform group-open:rotate-180"
                />
              </span>
            </summary>
            <ul
              data-testid="agent-doctor-checked-list"
              className="mt-1.5 flex min-w-0 flex-col gap-1"
            >
              {(checks ?? []).map((check) => (
                <li
                  key={check.id}
                  className="break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
                >
                  {t(`check.${check.id}`)}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <ul data-testid="agent-doctor-checks" className="flex min-w-0 flex-col gap-1.5">
            {blocked.map((check) => (
              <li
                key={check.id}
                data-testid={`agent-doctor-check-${check.id}`}
                data-state={check.state}
                className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 break-keep text-label leading-prose"
              >
                {/*
                  The dot is not the only channel; the copy beside it says the same in words.
                */}
                <span
                  aria-hidden
                  className={`mt-[0.45em] size-1.5 shrink-0 rounded-full ${
                    check.state === 'problem'
                      ? 'bg-[color:var(--color-status-danger)]'
                      : 'bg-[color:var(--color-text-quaternary)]'
                  }`}
                />
                <span className="min-w-0 flex-1 text-[color:var(--color-text-secondary)]">
                  {t(`check.${check.id}`)}
                  <span className="ml-1.5 text-[color:var(--color-text-quaternary)]">
                    {t(`state.${check.state}`)}
                  </span>
                </span>
                {check.state === 'problem' && check.fixable ? (
                  <Chip
                    size="sm"
                    tone="accentOnTint"
                    data-testid={`agent-doctor-fix-${check.id}`}
                    disabled={busy !== null}
                    onClick={() => void fix(check.id)}
                    className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
                  >
                    {busy === check.id ? t('fixing') : t('fix')}
                  </Chip>
                ) : null}
                {check.id === 'cli' && check.state === 'problem' && toolMissing && installPlan ? (
                  /*
                    Shows exactly what will run and where it installs, before pressing.
                  */
                  <span
                    data-testid="agent-doctor-install-plan"
                    className="w-full basis-full min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
                  >
                    <span className="block break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('installPlanTitle')}
                    </span>
                    {/*
                      The 142-character command overflows the 698px pane and its path contains a
                      space, so it uses `break-all`; a horizontal scroll would hide what will run.
                    */}
                    <code className="mt-1 block min-w-0 break-all whitespace-pre-wrap text-caption leading-caption text-[color:var(--color-text-secondary)]">
                      {installPlan}
                    </code>
                    <span className="mt-1.5 block break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                      {t('installPlanNote')}
                    </span>
                    <span className="mt-2 block">
                      <Chip
                        size="sm"
                        tone="accentOnTint"
                        data-testid="agent-doctor-install"
                        disabled={busy !== null}
                        onClick={() => void install()}
                        className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
                      >
                        {busy === 'install' ? t('installing') : t('install')}
                      </Chip>
                    </span>
                  </span>
                ) : null}
                {check.id === 'launcher' && check.state === 'problem' && launcherMissing && nodePlan ? (
                  <span
                    data-testid="agent-doctor-node-plan"
                    className="w-full basis-full min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
                  >
                    <span className="block break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('nodePlanTitle')}
                    </span>
                    <code className="mt-1 block min-w-0 break-all whitespace-pre-wrap text-caption leading-caption text-[color:var(--color-text-secondary)]">
                      {nodePlan}
                    </code>
                    <span className="mt-1.5 block break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                      {t('nodePlanNote')}
                    </span>
                    <span className="mt-2 block">
                      <Chip
                        size="sm"
                        tone="accentOnTint"
                        data-testid="agent-doctor-install-node"
                        disabled={busy !== null}
                        onClick={() => void getNode()}
                        className="border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
                      >
                        {busy === 'node' ? t('installingNode') : t('installNode')}
                      </Chip>
                    </span>
                  </span>
                ) : null}
                {/*
                  Where the app cannot fix it, say what the person should do, or it is a dead end.
                  Only when the app has no install path, so it never contradicts the install button.
                */}
                {check.state === 'problem' &&
                !check.fixable &&
                NEXT_STEP.has(check.id) &&
                !(check.id === 'cli' && installPlan) &&
                !(check.id === 'launcher' && nodePlan) ? (
                  <span
                    data-testid={`agent-doctor-next-${check.id}`}
                    className="w-full basis-full break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
                  >
                    {t(`next.${check.id}`)}
                  </span>
                ) : null}
              </li>
            ))}
            {/* Passing checks remain as a count so what was measured stays visible. */}
            {(checks?.length ?? 0) > blocked.length ? (
              <li
                data-testid="agent-doctor-rest"
                className="break-keep pl-3.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
              >
                {t('restFine')}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    ) : null;

  return { scanButton, result };
}
