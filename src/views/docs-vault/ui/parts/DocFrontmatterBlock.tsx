import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { VaultDoc } from "@/entities/docs-vault";

/**
 * Engraved frontmatter visualization — "frontmatter 가 곧 그래프" made literal
 * in the editor. Renders the ontology-shaped subset of `doc.frontmatter`
 * (kind/slug/title/domain/depends_on/relates_to/contains/belongs_to/evidence)
 * as a machined mono block, mirroring exactly what `deriveOntologyFromVault`
 * reads to build the topology graph.
 *
 * Only rendered when `frontmatter.kind` is present — plain guide docs (no
 * ontology kind) don't get an (empty, confusing) block.
 *
 * Collapsed by default (`<details open={false}>`) — long documents used to
 * have this block push the H1 below the first screen. Frontmatter is the
 * graph source so it's never deleted/hidden from the DOM, only collapsed;
 * the summary line still surfaces `kind` / `slug` / field count so the
 * reader knows what's inside before expanding. Caller mounts this component
 * with `key={doc.slug}` so switching documents remounts it and resets the
 * collapse state — no cross-document memory, no URL/session pollution.
 */

const GRAPH_KEYS = [
  "kind",
  "slug",
  "title",
  "domain",
  "category",
  "status",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
  "evidence",
] as const;

function formatValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function DocFrontmatterBlock({ doc }: { doc: VaultDoc }) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const [open, setOpen] = useState(false);
  const fields = GRAPH_KEYS.map((key) => ({
    key: key as string,
    value: formatValue(doc.frontmatter?.[key]),
  })).filter((f): f is { key: string; value: string } => f.value !== null);

  if (fields.length === 0) return null;

  const kindValue = formatValue(doc.frontmatter?.kind);
  const slugValue = formatValue(doc.frontmatter?.slug) ?? doc.slug;

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="doc-frontmatter-block"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3 font-mono text-[12px] leading-[1.85] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
      >
        <summary
          data-testid="doc-frontmatter-summary"
          aria-label={open ? t("collapseAria") : t("expandAria")}
          className="flex cursor-pointer list-none items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]"
        >
          <ChevronRight
            size={11}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          <span aria-hidden>---</span>
          {kindValue ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">kind:</span>
              <span className="font-semibold text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
                {kindValue}
              </span>
            </>
          ) : null}
          <span className="min-w-0 truncate text-[color:var(--color-text-quaternary)]">
            slug: <span className="text-[color:var(--color-text-secondary)]">{slugValue}</span>
          </span>
          <span className="ml-auto flex-none text-[color:var(--color-text-quaternary)]">
            {t("collapsedSummary", { count: fields.length })}
          </span>
        </summary>
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
          {fields.map(({ key, value }) => (
            <div key={key} className="flex min-w-0 flex-wrap gap-x-1.5">
              <span className="text-[color:var(--color-text-quaternary)]">{key}:</span>
              <span
                className={
                  key === "kind"
                    ? "font-semibold text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
                    : "min-w-0 truncate text-[color:var(--color-text-secondary)]"
                }
              >
                {value}
              </span>
            </div>
          ))}
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-quaternary)]">
          <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true" className="shrink-0">
            <line
              x1="1"
              y1="3"
              x2="15"
              y2="3"
              stroke="var(--topology-v2-edge-contains-mark, var(--color-border-strong))"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {t("note")}
        </p>
      </details>
    </section>
  );
}
