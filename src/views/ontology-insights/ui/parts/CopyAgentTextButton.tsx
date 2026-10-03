import { Clipboard } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { controlClass } from '@/shared/ui/control-class';
import { FeedbackGlyph } from '@/shared/motion/feedback-glyph';

/**
 * The insights copy button: clipboard copy, a success or failure tone, and a separate polite live region, since a
 * focused button's changed `aria-label` is not re-announced. State comes from the shared `useCopyFeedback`.
 */
export function CopyAgentTextButton({
  label,
  copiedLabel,
  text,
  compact = false,
  testId,
}: {
  label: string;
  copiedLabel: string;
  text: string;
  compact?: boolean;
  testId?: string;
}) {
  const t = useTranslations("ontologyPages.insights");
  const { state: copyState, copy } = useCopyFeedback();

  function handleCopy() {
    void copy(text);
  }

  const statusLabel = copyState === "copied" ? copiedLabel : copyState === "failed" ? t("agentCopyFailed") : "";
  const ariaLabel = statusLabel ? `${label} · ${statusLabel}` : label;
  // The `accentOnTint` ink, not `accent`: the button carries an indigo tint whose hover step drops accent ink below
  // AA, as `.claude/rules/design.md` prescribes for tinted controls.
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
            // The class `text-label`, not `text-caption`: the smallest step is reserved for one uppercase eyebrow (`design.md`).
            "shrink-0 justify-center text-label",
            toneClass,
            compact ? "min-h-8 px-2.5 py-1.5" : "min-h-9 px-3 py-2",
          ].join(" "),
        })}
        aria-label={ariaLabel}
        data-testid={testId}
        data-feedback={copyState}
      >
        <FeedbackGlyph state={copyState} icon={<Clipboard size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} />
        {label}
      </button>
      {/* A separate polite live region announces the result (as in `CopyProjectLinkButton`); emptied while idle. */}
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
