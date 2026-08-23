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
 * The connection check — **measure step by step why it does not work, and fix here what can be fixed.**
 *
 * Why it sits here (owner instruction, 2026-08-20): *"if the connection fails, it is effectively unusable"*
 * (if the connection fails, it is effectively unusable). It goes where someone who is stuck is
 * already looking — a check buried somewhere deep has to be hunted for, and mostly is not.
 *
 * ## ⚠️ The owner rejected the first version (2026-08-20): *"design-wise this leaves a lot to be desired"*
 * (design-wise this leaves a lot to be desired)
 *
 * Putting the result list in as the row's **fourth flex child** broke three things at once.
 *
 * ① **The hierarchy inverted.** That row's job is "this tool exists, open a conversation here",
 *    yet seven lines of secondary diagnosis ate the row's right half and pushed the "ready" badge
 *    off the end. What the eye should land on first is the name and the button, and the diagnosis won.
 * ② **A void opened between name and button.** Wedging a large block into a single
 *    `justify-between` row sends all the remaining width into that gap.
 * ③ **"Everything is fine" was seven lines long.** That very file (`AcpRuntimeSettings.tsx`)
 *    already recorded the failure *"18 of 20 lines were the same sentence, so half the screen was a
 *    copy"* — and the same failure was made again.
 *
 * So all three were fixed: **the button sits beside the row's other controls**, **the results go
 * full width beneath the row** (making the row a single line again), and **when everything is fine
 * it folds to one line** — the lines unfold only when something is blocked. The facts are still on
 * screen (the summary gives the count); only the duplication goes quiet.
 *
 * ## Two things this screen keeps
 *
 * 1. **Never draw the unknown as green.** There are three states, and `unknown` means "there was no
 *    way to check".
 * 2. **Do not claim it was fixed; show the value measured again.** `acp_repair` re-measures the
 *    state after fixing and returns that.
 */
/**
 * A hook that hands back the check button and the results **separately**.
 *
 * One component drawing both leaves the caller unable to separate them — the button must be inside
 * the row and the results beneath it, which is impossible as one block. That is the structural
 * reason the first version broke.
 */
/**
 * Checks with a written next step for the person. Meaningful only for problems the app cannot fix.
 *
 * An id absent here has no copy either, so nothing is drawn — calling for copy that does not exist
 * prints the key onto the screen.
 */
const NEXT_STEP = new Set(['cli', 'launcher', 'login', 'gate']);

export function useAgentDoctor(
  runtimeId: string,
  /**
   * Called when the app changed something, to have the list re-measured.
   *
   * Without it, right after an install or repair **the badge above states the old fact while the
   * diagnosis right below states the new one.** Two sentences disagreeing on one screen is the very
   * defect this round has been fixing throughout, so it is not recreated here.
   */
  onChanged?: () => void,
) {
  const t = useTranslations('acpChat.doctor');
  const [checks, setChecks] = useState<AcpCheck[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /*
   * **How far the install has got.** `null` means it has never been drawn, and nothing is drawn —
   * no 0% bar is raised for work that has not started.
   */
  const [progress, setProgress] = useState<AcpInstallProgress | null>(null);

  /*
   * The subscription attaches **once**. Attaching and detaching on every install press misses the
   * first event Rust emits ahead of it — the `acp://exit` wiring above in this file was moved onto a
   * thread for the same reason.
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
     * **Fetch what went past while it was closed.**
     *
     * This sheet unmounts entirely when closed (the conditional portal in `AppSettingsMenu.tsx`), so
     * all state here disappears. The Node download ticks every 250ms and revives itself from the next
     * event, but **completion is a single event** and going past while closed means it is **never
     * seen** — which is exactly the indicator the owner asked for this round.
     *
     * Anything already received is not overwritten: the subscription may answer first, and then that
     * value is the newer one.
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
    // Starting a re-measure **clears the previous install's result line** — something that is not
    // what was just done must not be left looking like "just finished".
    setProgress(null);
    try {
      setChecks(await diagnoseAgent(runtimeId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId]);

  const fix = useCallback(
    async (checkId: string) => {
      setBusy(checkId);
      setFailed(false);
      try {
        setChecks(await repairAgentCheck(runtimeId, checkId));
      onChanged?.();
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
      }
    },
    [runtimeId, onChanged],
  );

  const reset = useCallback(async () => {
    setBusy('reset');
    setFailed(false);
    try {
      setChecks(await resetAgentConnection(runtimeId));
      onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId, onChanged]);

  /**
   * Is an earlier step blocked? Then "reconnect" is useless too. Rebuilding the config folder when
   * the tool is missing does not open a conversation (walkthrough 2026-08-20).
   */
  /**
   * **Show the command text first** — condition ② of ledger entry 2026-08-20 (88).
   *
   * Asked only when the check reported "the tool is missing". Showing an install offer permanently
   * to someone with no problem is advertising, not guidance.
   */
  const [installPlan, setInstallPlan] = useState<string | null>(null);
  const toolMissing = useMemo(
    () => (checks ?? []).some((check) => check.id === 'cli' && check.state === 'problem'),
    [checks],
  );
  useEffect(() => {
    // No synchronous setState in the effect body (a ratchet catches it) — "invisible when the tool is
    // fine" is kept by **not drawing it**, not by clearing state. The render condition below reads
    // `toolMissing` alongside.
    if (!toolMissing) return;
    let alive = true;
    void agentInstallPlan(runtimeId).then((plan) => {
      if (alive) setInstallPlan(plan);
    });
    return () => {
      alive = false;
    };
  }, [toolMissing, runtimeId]);

  /**
   * **The app can fetch Node too** — ledger entry (89). Asked only when "can the tool be launched"
   * is blocked. That was the final dead end for someone with no tooling at all.
   */
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

  const getNode = useCallback(async () => {
    setBusy('node');
    setFailed(false);
    try {
      setChecks(await installManagedNode(runtimeId));
      onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId, onChanged]);

  const install = useCallback(async () => {
    setBusy('install');
    setFailed(false);
    try {
      setChecks(await installAgentCli(runtimeId));
      onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [runtimeId, onChanged]);

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
      ⚠️ **Use the primitive** (owner, 2026-08-20: *"please unify the button sizes"* — please unify the
      button sizes). A hand-written `<button>` plus `controlClass` **reads as a different object**
      from the `Chip` beside it (which carries an icon) even with identical size classes — and this
      repository already has a ratchet preventing hand-written controls from growing.
    */}
    <Chip
      size="sm"
      tone="muted"
      hoverInk="strong"
      data-testid="agent-doctor-scan"
      disabled={busy !== null}
      onClick={() => void run()}
      className="shrink-0"
    >
      <Stethoscope size={ICON_SIZE.sm} aria-hidden />
      {busy === 'scan' ? t('scanning') : t('scan')}
    </Chip>
    {/*
      **This is "reconnect", not "log out".** This app has no login of its own, so offering a logout
      would either erase someone else's login or pretend to. Deleting only what the app created and
      recreating it is the precise meaning of "reconnect" in this structure.

      **Offered only after the check results.** Showing "reconnect" permanently to someone with no
      problem at all reads as a signal that something is wrong.
    */}
    {checks && !prerequisiteBlocked ? (
      <Chip
        size="sm"
        tone="muted"
        hoverInk="strong"
        data-testid="agent-doctor-reset"
        disabled={busy !== null}
        onClick={() => void reset()}
        className="ml-1.5 shrink-0"
      >
        <RotateCcw size={ICON_SIZE.sm} aria-hidden />
        {busy === 'reset' ? t('resetting') : t('reset')}
      </Chip>
    ) : null}
    </>
  );

  /**
   * **The screen speaks while the install runs.**
   *
   * Three rules:
   *
   * ① **Never draw a percentage that is unknown.** Only the Node download has a denominator; npm
   *    does not, so instead of a bar it shows **the line that tool actually emitted**. This app's
   *    update toast already follows the same rule.
   * ② **Record that it finished.** This line is the answer to the owner's question about checking
   *    off what completed — a list quietly turning green does not tell you whether what you just
   *    pressed succeeded.
   * ③ **No decoration.** A neutral track plus one indigo. Exactly the repository's charter.
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
        /* Raise a bar only while the denominator is known. Unknown, the bar itself is a lie. */
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
         * With no percentage, what is shown is **the line that tool emitted, verbatim**. It is cut to
         * one line — npm emits hundreds, and pouring all of it out is not guidance.
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
          ⚠️ **No `checks` means "not measured", not "fine".**

          Once progress alone was enough to render this block, a screen that had never run a check
          could ride `blocked.length === 0` into saying "no problems right now" — drawing green
          without measuring, in direct violation of the first of this screen's two rules ("never draw
          the unknown as green"). (Revealed in a 2026-08-20 installed-app screenshot where "install
          required" stood directly above "no problems right now".)

          So the verdict sentence is emitted **only when there is something measured**. The progress
          line stays above, so the completion indicator is not lost.
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
           * **When everything is fine it is one line.** Seven copies of the same sentence are
           * duplication, not information, and this screen has already suffered that failure once.
           *
           * ⚠️ **Counting them was rejected too** (2026-08-20, owner: *"3 steps are fine" and the like, I cannot make out what it
           * means* — "3 steps are fine" and the like, I cannot make out what it
           * means). "Step" is our internal word, and the check count differs per tool (Claude 7,
           * Codex 3), so **the number looks different for reasons the user cannot know** — it was our
           * implementation leaking out rather than information.
           *
           * So the status is one sentence in plain language, and what was examined is **folded away**.
           * Anyone curious unfolds it; for everyone else it is one line.
           *
           * ⚠️ **It must look pressable** (owner, 2026-08-20: *"Can this be opened and closed?"* —
           * can this be opened and closed?). Text alone leaves nobody aware it is a `<details>`. It
           * uses the indicator this screen already uses — a chevron that rotates when open.
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
                  One dot states the status, but **colour is not the only channel** — the copy right
                  beside it says the same thing in words.
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
                {/*
                  **Where the app cannot fix it, write what the person should do.** The same rule this
                  repository set for degraded cards — saying only why something does not work, without
                  saying where to go, is a dead end.
                */}
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
                    Conditions ② and ④ are visible on screen: exactly what will be run, and where alone
                    it will be installed. Both readable before pressing.
                  */
                  <span
                    data-testid="agent-doctor-install-plan"
                    className="w-full basis-full min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
                  >
                    <span className="block break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('installPlanTitle')}
                    </span>
                    {/*
                      ⚠️ **Not pinned to one line** (owner, 2026-08-20: *"What is
                      going on with this design"* — what is
                      going on with this design). Measured: this command is **142 characters**, roughly
                      900px at caption size (11px), while the settings sheet's right pane is **698px**
                      (880 − 180 for the LNB). It used to be bound to one line with `whitespace-pre`,
                      putting the overflowing third behind a horizontal scroll — and **nobody ever
                      discovers a horizontal scroll**, so the screen was not actually keeping condition
                      ② (show what will be run, first).

                      The path contains a space (`Application Support`), so wrapping only at word
                      boundaries still overflows. `break-all` lets it wrap anywhere.
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
                  ⚠️ **When the app can do it for you, do not say "do it yourself".**

                  In a 2026-08-20 screenshot two sentences stood on one screen: the "install into this
                  app" button directly above, and beneath it *"press 「install instructions」 for that
                  tool in this list, install it, then press 「check again」 above"*. Offering to do it
                  and instructing the user to do it themselves in the same place is not guidance but a
                  **contradiction**, and the user cannot tell which is real.

                  So this slot speaks **only when the app has no path to offer**.
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
            {/* Passing checks remain as a count — "what was not measured" must not be invisible. */}
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
