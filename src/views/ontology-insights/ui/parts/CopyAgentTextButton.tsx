import { Check, Clipboard } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { controlClass } from '@/shared/ui/control-class';

/**
 * The "copy" button used across the insights page: clipboard copy plus a success/failure tone plus
 * a screen-reader announcement (a separate polite live region, because changing the `aria-label` of
 * a focused button is not automatically re-announced). Extracted from the OntologyInsightsPage
 * monolith so the split-out panels can share it. The copy-state logic uses the shared
 * `useCopyFeedback` hook (removing duplication across 16+ sites).
 */
export function CopyAgentTextButton({
  label,
  copiedLabel,
  text,
  compact = false,
}: {
  label: string;
  copiedLabel: string;
  text: string;
  compact?: boolean;
}) {
  const t = useTranslations("ontologyPages.insights");
  const { state: copyState, copy } = useCopyFeedback();

  function handleCopy() {
    void copy(text);
  }

  const statusLabel = copyState === "copied" ? copiedLabel : copyState === "failed" ? t("agentCopyFailed") : "";
  const ariaLabel = statusLabel ? `${label} · ${statusLabel}` : label;
  // The text colour comes from the indigo-accent / status-danger tokens — the app is dark-only
  // (`.claude/rules/design.md`, 2026-07-19), so there is no light-on-dark regression to worry
  // about. The indigo and red alphas on border and background stay subtle.
  // Why the ink is the `accentOnTint` family rather than `accent` (#7170ff): this button carries an
  // indigo tint, and hover raises that tint one step (a06 → a13). Measured — accent ink barely
  // passed at rest with 4.56 and then **broke AA at 4.41 on hover** (2026-08-05). Switching to
  // `--color-indigo-text-soft` gives 8.92 / 8.66. `.claude/rules/design.md`'s rule that "a control
  // carrying a tint uses accentOnTint ink" already prescribed this, and the existing lint selector
  // saw **only the resting pair**, so it missed this site.
  const toneClass =
    copyState === "failed"
      ? "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-status-danger)] hover:border-[color:var(--color-danger-a50)] hover:bg-[color:var(--color-danger-a12)]"
      : "border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-line-a06)] text-[color:var(--color-indigo-text-soft)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]";

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className={controlClass({
          shape: "chip",
          size: "md",
          className: [
            "shrink-0 justify-center font-mono text-caption transition-[background-color,border-color,color,transform] duration-[var(--motion-base)] ease-[var(--motion-ease)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none",
            toneClass,
            compact ? "min-h-8 px-2.5 py-1.5" : "min-h-9 px-3 py-2",
          ].join(" "),
        })}
        aria-label={ariaLabel}
      >
        {copyState === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
        {label}
      </button>
      {/* Announces copy success and failure to a screen reader — changing the `aria-label` of a
          focused button is not automatically re-announced, so a separate polite live region is used
          (the same pattern as CopyProjectLinkButton). It is emptied while idle to avoid reset noise. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copyState === "copied"
          ? copiedLabel
          : copyState === "failed"
            ? t("agentCopyFailed")
            : ""}
      </span>
    </>
  );
}
