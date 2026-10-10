"use client";

import { useEffect, useRef } from "react";
import type { GitRemoteState } from "../lib/remote-state";
import { Check, ShieldCheck } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { fieldClass } from "@/shared/ui/control-class";
import type { GitSnapshotResult } from "@/shared/lib/tauri-git";
import { Button, Checkbox, controlClass } from "@/shared/ui";
import {
  CONFIRM_PLACEMENT,
  DocumentConfirmStep,
  useInlineConfirmFocus,
} from "./DocumentConfirmStep";
import { cn } from "@/shared/lib/cn";
import type { Translator } from "../lib/translator";

/**
 * Discard one document's uncommitted changes. Worded apart from restore: git holds no copy, so
 * nothing brings them back. The count comes from the parsed diff on screen.
 */
export function DiscardDock({
  t,
  path,
  status,
  delta,
  others,
  busy,
  onDiscard,
}: {
  t: Translator;
  path: string;
  status: string;
  delta: { added: number; removed: number } | null;
  /** Uncommitted documents that stay untouched — the residue a person must know. */
  others: number;
  busy: boolean;
  onDiscard: (path: string, others: number) => Promise<boolean>;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2" data-testid="atlas-git-discard-dock">
      <DocumentConfirmStep
        testIdPrefix="atlas-git-discard"
        doorLabel={t("discardAction")}
        confirmLabel={t("discardButton")}
        busyLabel={t("discardRunning")}
        cancelLabel={t("cancelButton")}
        tone="danger"
        busy={busy}
        onConfirm={() => onDiscard(path, others)}
      >
        <p className="text-label leading-prose text-[color:var(--color-text-secondary)]">
          {status === "deleted"
            ? t("discardConfirmDeleted")
            : t("discardConfirmBody", { added: delta?.added ?? 0, removed: delta?.removed ?? 0 })}
        </p>
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("discardConfirmOthers", { count: others })}
        </p>
      </DocumentConfirmStep>
    </div>
  );
}

/**
 * A one-line result for recording. Every ICU argument is passed, or next-intl renders the key
 * path; a missing `counts` field from Rust falls back to the list's counts.
 */
function SnapshotResultLine({
  t,
  result,
  fallbackCount,
  pushFailure,
}: {
  t: Translator;
  result: GitSnapshotResult;
  fallbackCount: number;
  /** Why the send failed, in the reader's language — git's reason, read by the caller. */
  pushFailure: string | null;
}) {
  const count = result.counts?.total ?? fallbackCount;
  const remote = result.push?.remoteUrl ?? "";
  const saved = result.committed ? t("snapshotDone", { count }) : t("snapshotNoChanges");
  /*
   * One sentence per outcome (`pushDone` already covers save and send). A failed send carries
   * git's reason, since `remoteUrl` is filled only on success.
   */
  const line = !result.push
    ? saved
    : result.push.pushed
      ? result.committed
        ? t("pushDone", { count, upstream: remote })
        : t("remoteDonePush")
      : `${saved} · ${pushFailure ?? t("pushFailed", { count, remote })}`;
  return (
    <p
      className="git-fade-in text-caption text-[color:var(--color-text-tertiary)]"
      data-testid="atlas-git-snapshot-result"
    >
      {line}
    </p>
  );
}

/** The dock's next-remote-step door (connect, or send once saved), one class since both share a slot. */
const DOCK_DOOR_CLASS = controlClass({
  shape: "chip",
  size: "sm",
  className:
    "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
});

/**
 * The bottom dock with the screen's one decision, pinned (`mt-auto`) at the surface's heaviest
 * weight, with the recording-scope notice at the decision point. The confirm's mono line shows
 * the exact subject that will be recorded.
 */
export function ActionDock({
  t,
  onConnectRemote,
  remoteState,
  branch,
  headShortHash,
  remoteBusy,
  onSendBranch,
  hasChanges,
  changeCount,
  predictedSubject,
  confirming,
  setConfirming,
  pushOptIn,
  setPushOptIn,
  snapshotting,
  snapshotResult,
  snapshotPushFailure,
  snapshotError,
  confirmSnapshot,
  upstream,
  snapshotMessage,
  setSnapshotMessage,
}: {
  t: Translator;
  /** The input the dock's last line opens when there is no remote. */
  onConnectRemote: () => void;
  /** Where this branch's steps can go; the dock's last line states the next step for it. */
  remoteState: GitRemoteState;
  branch: string | null;
  headShortHash: string | null;
  remoteBusy: null | "fetch" | "pull" | "push";
  /** The header's first send, offered again where the dock says there is one to make. */
  onSendBranch: () => void;
  hasChanges: boolean;
  changeCount: number;
  predictedSubject: string;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pushOptIn: boolean;
  setPushOptIn: (v: boolean) => void;
  snapshotting: boolean;
  snapshotResult: GitSnapshotResult | null;
  /** Why the last save's send failed, in the reader's language; `null` when it did not fail. */
  snapshotPushFailure: string | null;
  snapshotError: string | null;
  confirmSnapshot: () => void;
  upstream: string | null;
  /** A subject the user typed. Empty falls back to the automatic wording. */
  snapshotMessage: string;
  setSnapshotMessage: (v: string) => void;
}) {
  const { triggerRef, initialRef, close, onKeyDown } = useInlineConfirmFocus(confirming, setConfirming, {
    busy: snapshotting,
  });
  /*
   * A finished commit's result takes focus, since the commit button it would return to is
   * inert once nothing is pending.
   */
  const resultRef = useRef<HTMLDivElement | null>(null);
  const confirmingBeforeRef = useRef(confirming);
  useEffect(() => {
    const closedByResult = confirmingBeforeRef.current && !confirming && snapshotResult !== null;
    confirmingBeforeRef.current = confirming;
    if (!closedByResult || typeof document === "undefined") return;
    const active = document.activeElement;
    if (!active || active === document.body) resultRef.current?.focus();
  }, [confirming, snapshotResult]);
  return (
    <div
      data-testid="atlas-git-dock"
      className="mt-auto flex shrink-0 flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3"
    >
      {confirming ? (
        <div
          role="group"
          aria-label={t("messageLabel")}
          onKeyDown={onKeyDown}
          className="git-fade-in flex flex-col gap-2"
          data-testid="atlas-git-confirm-step"
        >
          <p className="text-caption text-[color:var(--color-text-tertiary)]">{t("confirmBody")}</p>
          {/* Editable so a step can say why; empty keeps the automatic subject the placeholder shows. */}
          <input
            type="text"
            ref={(node) => {
              initialRef.current = node;
            }}
            data-testid="atlas-git-message-input"
            value={snapshotMessage}
            onChange={(event) => setSnapshotMessage(event.target.value)}
            placeholder={predictedSubject}
            aria-label={t("messageLabel")}
            className={fieldClass({ multiline: true, size: "md", className: "w-full font-mono break-all" })}
          />
          {/* A saved origin can take the send too: its first send sets the upstream. */}
          <Checkbox
            data-testid="atlas-git-push-optin"
            checked={pushOptIn}
            disabled={!upstream && remoteState !== "never-sent"}
            onChange={(event) => setPushOptIn(event.target.checked)}
            label={t("pushOptIn")}
          />
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {upstream
              ? t("pushOptInHint", { upstream })
              : remoteState === "never-sent"
                ? t("pushOptInFirstHint", { branch: branch ?? "" })
                : remoteState === "detached"
                  ? t("pushDetachedHint")
                  : remoteState === "no-remote"
                    ? t("pushNoUpstream")
                    : t("upstreamUnknown")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              data-testid="atlas-git-confirm-button"
              disabled={snapshotting}
              onClick={confirmSnapshot}
              className={CONFIRM_PLACEMENT}
            >
              {snapshotting ? t("snapshotRunning") : t("confirmButton")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="atlas-git-cancel-button"
              disabled={snapshotting}
              onClick={close}
              className={CONFIRM_PLACEMENT}
            >
              {t("cancelButton")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={triggerRef}
          variant={hasChanges ? "primary" : "outline"}
          size="sm"
          data-testid="atlas-git-snapshot-button"
          disabled={!hasChanges}
          onClick={() => setConfirming(true)}
          className={cn(CONFIRM_PLACEMENT, "self-start")}
        >
          {hasChanges ? null : <Check size={ICON_SIZE.md} aria-hidden />}
          {hasChanges ? t("snapshotButton", { count: changeCount }) : t("noChanges")}
        </Button>
      )}

      {snapshotError ? (
        <p
          className="git-fade-in text-caption text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-snapshot-error"
        >
          {snapshotError}
        </p>
      ) : null}
      {snapshotResult ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          className="rounded-[var(--radius-chip)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        >
          <SnapshotResultLine
            t={t}
            result={snapshotResult}
            fallbackCount={changeCount}
            pushFailure={snapshotPushFailure}
          />
        </div>
      ) : null}

      {/*
        One next step per remote state; offering to connect where `origin` exists or HEAD is
        detached would rewrite the real remote.
      */}
      {upstream || remoteState === "unknown" ? (
        <p className="flex items-center gap-1.5 text-caption leading-label text-[color:var(--color-text-quaternary)]">
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          {t("scopeNotice")}
        </p>
      ) : remoteState === "no-remote" ? (
        <p
          data-testid="atlas-git-dock-no-remote"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          <span>{t("dockNoRemote")}</span>
          <button
            type="button"
            data-testid="atlas-git-dock-connect-remote"
            onClick={onConnectRemote}
            className={DOCK_DOOR_CLASS}
          >
            {t("dockConnectRemote")}
          </button>
        </p>
      ) : remoteState === "never-sent" ? (
        <p
          data-testid="atlas-git-dock-never-sent"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          <span>{t("dockNeverSent")}</span>
          <button
            type="button"
            data-testid="atlas-git-dock-send-branch"
            disabled={remoteBusy !== null}
            onClick={onSendBranch}
            className={DOCK_DOOR_CLASS}
          >
            {remoteBusy === "push" ? "…" : t("dockSendBranch")}
          </button>
        </p>
      ) : (
        // No button to wrap beside, so the sentence wraps under itself, not under the icon.
        <p
          data-testid="atlas-git-dock-detached"
          className="flex items-start gap-1.5 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
          <span>{t("dockDetached", { commit: headShortHash ?? "HEAD" })}</span>
        </p>
      )}
    </div>
  );
}
