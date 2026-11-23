import { useTranslations } from "next-intl";
import { CompactCopyButton, controlClass } from "@/shared/ui";

interface Props {
  exampleDoc: string;
  open: boolean;
  onToggle: () => void;
  copied: boolean;
  onCopy: () => void;
}

/** A toggle that shows a new document of this kind as frontmatter, with a copy button. */
export function FrontmatterExample({ exampleDoc, open, onToggle, copied, onCopy }: Props) {
  const t = useTranslations("docsVault.frontmatterBlock");
  return (
    <div className="mt-2 font-sans">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="doc-frontmatter-example"
        data-testid="doc-frontmatter-example-toggle"
        className={controlClass({
          shape: "link",
          tone: "muted",
          className: "touch-hit-expand hover:text-[color:var(--color-text-secondary)]",
        })}
      >
        {t("exampleToggle")}
      </button>
      {open ? (
        <div
          id="doc-frontmatter-example"
          data-testid="doc-frontmatter-example"
          className="mt-2 flex items-start gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2"
        >
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
            {exampleDoc}
          </pre>
          <CompactCopyButton
            copied={copied}
            label={copied ? t("exampleCopied") : t("exampleCopy")}
            ariaLabel={t("exampleCopyAriaLabel")}
            onClick={onCopy}
            data-testid="doc-frontmatter-example-copy"
          />
        </div>
      ) : null}
    </div>
  );
}
