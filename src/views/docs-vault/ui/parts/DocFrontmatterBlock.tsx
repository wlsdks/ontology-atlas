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
  const fields = GRAPH_KEYS.map((key) => ({
    key: key as string,
    value: formatValue(doc.frontmatter?.[key]),
  })).filter((f): f is { key: string; value: string } => f.value !== null);

  if (fields.length === 0) return null;

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="doc-frontmatter-block"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3 font-mono text-[12px] leading-[1.85] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
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
    </section>
  );
}
