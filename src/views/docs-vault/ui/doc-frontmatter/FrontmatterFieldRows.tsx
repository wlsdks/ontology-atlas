import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { controlClass } from "@/shared/ui";
import { isNodeReference } from "../../lib/doc-frontmatter/fields";

export interface FrontmatterFieldRow {
  key: string;
  value: string;
  refTokens: string[] | null;
}

interface Props {
  fields: FrontmatterFieldRow[];
  onNavigate?: (slug: string) => void;
  resolveRef?: (token: string) => string | null;
  /** References nothing answers to; they are marked, and still count as linkable. */
  danglingSet: ReadonlySet<string>;
}

/** One `key: value` line per graph field; references become links when the folder knows them. */
export function FrontmatterFieldRows({ fields, onNavigate, resolveRef, danglingSet }: Props) {
  const t = useTranslations("docsVault.frontmatterBlock");
  return fields.map(({ key, value, refTokens }) => {
    const linkable =
      refTokens != null &&
      refTokens.length > 0 &&
      onNavigate != null &&
      refTokens.some((tok) => isNodeReference(key, tok) && (resolveRef?.(tok) != null || danglingSet.has(tok)));
    return (
      <div key={key} data-testid={`doc-frontmatter-field-${key}`} className="flex min-w-0 flex-wrap gap-x-1.5">
        <span className="text-[color:var(--color-text-quaternary)]">{key}:</span>
        {linkable ? (
          <span className="min-w-0 break-words text-[color:var(--color-text-secondary)]">
            {refTokens!.map((tok, index) => {
              const target = isNodeReference(key, tok) ? resolveRef?.(tok) ?? null : null;
              return (
                <Fragment key={`${tok}-${index}`}>
                  {index > 0 ? <span aria-hidden>, </span> : null}
                  {target != null ? (
                    <button
                      type="button"
                      onClick={() => onNavigate!(target)}
                      data-testid={`doc-frontmatter-ref-${tok}`}
                      // `min-h-6` meets WCAG 2.5.8's 24px floor; the link ramp would force `text-label`,
                      // but a reference inherits the parent font size.
                      className={controlClass({ shape: "link", className: "min-h-6 rounded-chip text-[color:var(--color-indigo-pale-a90)] underline decoration-[color:var(--color-indigo-line-a35)] underline-offset-2 hover:text-[color:var(--color-text-primary)] hover:decoration-[color:var(--color-indigo-line-a45)]" })}
                    >
                      {tok}
                    </button>
                  ) : danglingSet.has(tok) ? (
                    <span
                      data-testid={`doc-frontmatter-dangling-${tok}`}
                      title={t("danglingRefTitle")}
                      className="text-[color:var(--color-amber-docs-a92)] underline decoration-dotted decoration-[color:var(--color-amber-docs-a18)] underline-offset-2"
                    >
                      {tok}
                    </span>
                  ) : (
                    <span>{tok}</span>
                  )}
                </Fragment>
              );
            })}
          </span>
        ) : (
          <span
            className={
              key === "kind"
                ? "font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
                : "min-w-0 whitespace-pre-wrap break-words text-[color:var(--color-text-secondary)]"
            }
          >
            {value}
          </span>
        )}
      </div>
    );
  });
}
