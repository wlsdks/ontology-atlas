import { Download, FolderOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";

export interface SampleNoticeProps {
  /** The gate is capability, not runtime: with FSA support, a folder can be opened on the web too. */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
}

/**
 * The strip that explains, in one plain sentence, "why editing is unavailable and how to turn it
 * on" while in the sample state (no vault chosen). It sits in the article header row.
 *
 * The `editorHeader.readOnlySample` dot chip stays as the state indicator and this strip carries
 * the explanation and the action beside it — a small chip in the top right alone does not convey
 * the why and the how.
 *
 * The visibility condition (`!isLocalSourceLoaded`) is the caller's judgement; this component is a
 * pure display assuming it was rendered. The open-folder flow is reused whenever FSA is
 * supported, regardless of runtime, and only an unsupported browser is pointed at the macOS app
 * download — the same capability-based contract as the map.
 */
export function SampleNotice({ canOpenLocalVault, onOpenFolder }: SampleNoticeProps) {
  const t = useTranslations("docsVault");
  return (
    <div
      data-testid="docs-vault-sample-notice"
      /*
       * **This notice is a fact about the vault, not about the document** (2026-08-08).
       *
       * It used to sit **above** the document title as its own band (full width, vertical padding,
       * an indigo rail on the left). Measured: it ate 53px and repeated the same sentence on **all
       * 112 documents** of the shipped sample vault, pushing the body down each time.
       *
       * But what the sentence says («this vault is read-only») does not change when you change
       * documents. So it moves into the document header row — where, in a sample vault, the right
       * side is **completely empty** (the edit tab and the sync indicator are both local-vault
       * only; confirmed in the code and by measurement). It says the same thing at zero vertical cost.
       *
       * **Why it is not deleted**: a sample document has no edit controls at all (measured: zero),
       * so there is nowhere else to attach "why can't I edit". This line is the only place carrying
       * that reason and "open my folder" — which was the original judgement behind this part, and
       * it still holds. Only its weight is lowered.
       *
       * No new breakpoint is introduced: the header row is `flex-wrap`, so it fits on one line when
       * wide and drops to its own line when narrow — there is one shape to maintain, and it is no
       * worse than before at narrow widths.
       */
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      <p className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
        {/*
         * Moving into the document header row **created a second attention winner** — "this is a
         * read-only sample" had the same weight and brightness as the document title and competed
         * with it on one row. The protagonist of a reading screen is the document title, so this
         * notice drops one step: secondary ink (the title is primary), tertiary for the
         * explanation. The weight stays, so it still reads as a «state label» — what was lowered
         * is brightness, and no words were removed.
         */}
        <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
          {t("sampleNotice.title")}
        </span>{" "}
        — {t("sampleNotice.body")}
      </p>
      {canOpenLocalVault ? (
        <button
          type="button"
          onClick={onOpenFolder}
          className={controlClass({
            shape: "chip",
            size: "lg",
            active: true,
            className:
              "flex-none font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a24)]",
          })}
        >
          <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          {t("sampleNotice.openFolderCta")}
        </button>
      ) : (
        <Link
          href="/download/"
          className={controlClass({ shape: "chip", className: "flex-none border-[color:var(--color-indigo-line-a42)] bg-[color:var(--color-indigo-a12)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-primary)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a18)]" })}
        >
          <Download size={ICON_SIZE.sm} aria-hidden />
          {t("vaultStatus.downloadAppCta")}
        </Link>
      )}
    </div>
  );
}
