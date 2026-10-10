"use client";

import { Fragment, useEffect, useRef } from "react";
import type { GitRemoteState, RemoteAction } from "../lib/remote-state";
import { fieldClass } from "@/shared/ui/control-class";
import { badgeClass } from "@/shared/ui/badge-class";
import { Button, controlClass } from "@/shared/ui";
import { Tooltip } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/cn";
import type { Translator } from "../lib/translator";

/**
 * One remote action: the label in the reader's locale, and a tooltip, opening on focus as well
 * as hover, with what it does and the git verb it runs.
 */
function RemoteActionButton({
  id,
  label,
  hint,
  command = `git ${id}`,
  busy,
  disabled,
  onClick,
}: {
  id: RemoteAction;
  label: string;
  hint: string;
  /** The git command the press runs, shown under the hint; the verb itself by default. */
  command?: string;
  busy: boolean;
  disabled: boolean;
  onClick: (kind: RemoteAction) => void;
}) {
  return (
    <Tooltip
      side="bottom"
      align="end"
      // The hint opens across the "now / uncommitted changes" row below the button and holds
      // nothing to press, so it never takes the pointer, or it would swallow clicks on that row.
      panelClassName="pointer-events-none"
      content={
        <span className="flex flex-col gap-0.5" data-testid={`atlas-git-remote-${id}-hint`}>
          <span>{hint}</span>
          <span className="font-mono text-[color:var(--color-text-tertiary)]">{command}</span>
        </span>
      }
    >
    <Button
      variant="outline"
      size="sm"
      data-testid={`atlas-git-remote-${id}`}
      disabled={disabled}
      onClick={() => onClick(id)}
      className="max-sm:w-full"
    >
      {busy ? "…" : label}
    </Button>
    </Tooltip>
  );
}

/**
 * The location line: where this folder's steps go, as one chrome line at the header's right
 * with a quiet action; the remote input opens only when pressed. Not a railed callout card,
 * which `design.md` forbids.
 */
export function LocationLine({
  t,
  branch,
  upstream,
  remoteState,
  headShortHash,
  ahead,
  behind,
  remoteOpen,
  setRemoteOpen,
  remoteBusy,
  onRemoteAction,
  pendingCount,
}: {
  t: Translator;
  /** Uncommitted changes. Above zero, Push opens the commit confirm step first. */
  pendingCount: number;
  branch: string | null;
  upstream: string | null;
  /** Where this branch's steps can go; everything right of the location follows from it. */
  remoteState: GitRemoteState;
  /** The commit a detached HEAD names — shown in place of the `HEAD` git reports as the branch. */
  headShortHash: string | null;
  /** With no upstream both are null — that is "unknown", not 0. */
  ahead: number | null;
  behind: number | null;
  remoteOpen: boolean;
  setRemoteOpen: (v: boolean) => void;
  remoteBusy: null | RemoteAction;
  onRemoteAction: (kind: RemoteAction) => void;
}) {
  if (!branch) return null;
  const known = ahead !== null && behind !== null;
  const same = known && ahead === 0 && behind === 0;
  const detachedAt = remoteState === "detached" ? headShortHash : null;
  return (
    <div
      data-testid="atlas-git-location"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--color-text-quaternary)]"
    >
      {/*
        Branch and remote names are the user's own, untranslated. Ahead and behind counts sit on
        the Push and Pull buttons they justify.
      */}
      {/*
        Branch, tracking arrow and upstream are one fact, drawn as one `tag` badge (`badgeClass`).
      */}
      <span
        data-testid="atlas-git-location-ref"
        className={badgeClass({
          shape: 'tag',
          className:
            'flex min-w-0 items-center gap-1.5 border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] font-mono',
        })}
      >
        {/* A detached HEAD has no branch name; git's `HEAD` says nothing, the commit does. */}
        <span className="truncate text-[color:var(--color-text-secondary)]">{detachedAt ?? branch}</span>
        {upstream ? (
          <>
            {/* The arrow is not decoration but a **tracking relation** — the left follows the right. */}
            <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
              →
            </span>
            <span className="truncate text-[color:var(--color-text-quaternary)]">
              {upstream}
            </span>
          </>
        ) : null}
      </span>
      {/*
        Keyed apart, or React reuses the pressed first-send button as Pull and a second Enter pulls.
      */}
      {upstream ? (
        <Fragment key="tracked">
          {/* "identical" appears only when there are no numbers — it says why both buttons are disabled. */}
          {same ? (
            <span
              data-testid="atlas-git-divergence"
              title={t("remoteStale")}
              className={badgeClass({
                shape: 'tag',
                className:
                  'shrink-0 border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-quaternary)]',
              })}
            >
              {t("divergeSame")}
            </span>
          ) : (
            <span data-testid="atlas-git-divergence" className="sr-only">
              {t("divergeAhead", { ahead: ahead ?? 0 })}{" "}
              {t("divergeBehind", { behind: behind ?? 0 })}
            </span>
          )}
          {/* Fetch, Pull and Push keep the git terms; translating them blurs what happens. */}
          <div data-testid="atlas-git-remote-actions" className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center">
          <RemoteActionButton
            id="fetch"
            label={t("remoteFetch")}
            hint={t("remoteFetchHint")}
            busy={remoteBusy === "fetch"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
          <RemoteActionButton
            id="pull"
            label={behind && behind > 0 ? `${t("remotePull")} ${behind}` : t("remotePull")}
            hint={behind && behind > 0 ? t("remotePullHint", { behind }) : t("remoteSameHint")}
            busy={remoteBusy === "pull"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
          <RemoteActionButton
            id="push"
            label={ahead && ahead > 0 ? `${t("remotePush")} ${ahead}` : t("remotePush")}
            hint={
              pendingCount > 0
                ? t("remotePushCommitsFirstHint", { count: pendingCount })
                : ahead && ahead > 0
                  ? t("remotePushHint", { ahead })
                  : t("remoteSameHint")
            }
            busy={remoteBusy === "push"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
          </div>
        </Fragment>
      ) : remoteState === "no-remote" ? (
        <Fragment key="no-remote">
          <span aria-hidden>·</span>
          <span data-testid="atlas-git-remote-state" data-remote-state={remoteState}>
            {t("noUpstream")}
          </span>
          <Button
            variant="outline"
            size="sm"
            data-testid="atlas-git-remote-toggle"
            aria-expanded={remoteOpen}
            onClick={() => setRemoteOpen(!remoteOpen)}
          >
            {remoteOpen ? t("remoteToggleClose") : t("remoteToggle")}
          </Button>
        </Fragment>
      ) : remoteState === "never-sent" ? (
        <Fragment key="never-sent">
          <span aria-hidden>·</span>
          <span data-testid="atlas-git-remote-state" data-remote-state={remoteState}>
            {t("neverSent")}
          </span>
          {/*
            The first send, the only place an upstream is set (git.rs runs
            `push --set-upstream origin HEAD`); the hint names branch and destination. With
            uncommitted changes it opens the commit confirm first, like Push.
          */}
          <RemoteActionButton
            id="push"
            label={t("remotePush")}
            hint={
              pendingCount > 0
                ? t("remotePushCommitsFirstHint", { count: pendingCount })
                : t("sendBranchHint", { branch })
            }
            command={`git push -u origin ${branch}`}
            busy={remoteBusy === "push"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
        </Fragment>
      ) : (
        <Fragment key="no-send">
          <span aria-hidden>·</span>
          {/* Detached or unknown: a fact, and no button — neither state has a send to offer,
              and neither may reach the form that rewrites `origin`. */}
          <span data-testid="atlas-git-remote-state" data-remote-state={remoteState}>
            {remoteState === "detached" ? t("detachedHead") : t("upstreamUnknown")}
          </span>
        </Fragment>
      )}
    </div>
  );
}

/**
 * A one-line result for a remote action, outside the top bar so a result never moves the
 * buttons under the pointer.
 */
export function RemoteResultLine({
  notice,
  error,
  kind = "remote",
}: {
  notice: string | null;
  error: string | null;
  /** Which action the line reports; only the test id differs. */
  kind?: "remote" | "restore";
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const text = error ?? notice;
  /*
   * When the pressed button leaves with its result (a first send), the result takes focus
   * instead of `<body>`; a button still present keeps it.
   */
  useEffect(() => {
    if (!text || typeof document === "undefined") return;
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, [text]);
  if (!text) return null;
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="status"
      data-testid={error ? `atlas-git-${kind}-error` : `atlas-git-${kind}-notice`}
      className={cn(
        "git-fade-in flex-none border-b border-[color:var(--color-divider)] px-4 py-2 text-label leading-prose outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]",
        error
          ? "text-[color:var(--color-danger-text)]"
          : "text-[color:var(--color-text-tertiary)]",
      )}
    >
      {text}
    </p>
  );
}

/**
 * Registering a remote, opened from the location line; optional, not a connect step. Only the
 * typed address is used, never a guess (trust charter), and saving it sends nothing.
 */
export function RemoteSetup({
  t,
  remoteUrl,
  setRemoteUrl,
  remoteRunning,
  remoteError,
  remoteNotice,
  onSubmit,
}: {
  t: Translator;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  remoteRunning: boolean;
  remoteError: string | null;
  remoteNotice: string | null;
  onSubmit: () => void;
}) {
  return (
    <div
      data-testid="atlas-git-remote-setup"
      className="git-fade-in flex shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
    >
      <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t("remoteSetupBody")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={remoteUrl}
          aria-label={t("remoteFieldLabel")}
          placeholder={t("remoteFieldPlaceholder")}
          data-testid="atlas-git-remote-input"
          onChange={(event) => setRemoteUrl(event.target.value)}
          className={fieldClass({ size: "md", className: "min-w-[220px] flex-1 font-mono text-label" })}
        />
        <button
          type="button"
          data-testid="atlas-git-remote-submit"
          disabled={remoteRunning || remoteUrl.trim() === ""}
          onClick={onSubmit}
          className={controlClass({
            tone: "onAccent",
            className: "hover:bg-[color:var(--color-indigo-brand-hover)]",
          })}
        >
          {remoteRunning ? t("remoteRunning") : t("remoteSubmit")}
        </button>
      </div>
      {remoteError ? (
        <div className="git-fade-in flex flex-col gap-0.5" data-testid="atlas-git-remote-error">
          <p className="text-label text-[color:var(--color-danger-text)]">{remoteError}</p>
          {/* Say every time that the data is safe even on failure. */}
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("remoteFailedSafe")}
          </p>
        </div>
      ) : null}
      {remoteNotice ? (
        <p
          className="git-fade-in text-label text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-remote-notice"
        >
          {remoteNotice}
        </p>
      ) : null}
      <p className="text-caption text-[color:var(--color-text-quaternary)]">{t("remoteHelp")}</p>
    </div>
  );
}
