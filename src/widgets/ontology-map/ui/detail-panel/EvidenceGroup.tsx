import { FileText } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { controlClass } from "@/shared/ui";
import { GROUP_GLYPH_SLOT, GROUP_ROW_LIST, RelationGroupShell } from "./RelationGroupShell";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

// Clickable doc-link rows: `row.id` is a vault slug, the input `buildDocsVaultHref` expects, a
// different namespace from `onSelectConnection`'s canvas-node ids. No TraceMark: these are not
// canvas edges. `row.path` shows only in the native `title=` hover; a raw vault path is opaque.
export function EvidenceGroup({
  evidence,
  labels,
  onHoverEvidence,
}: {
  evidence: OntologyMapDetailPanelProps["evidence"];
  labels: OntologyMapDetailPanelLabels;
  onHoverEvidence: OntologyMapDetailPanelProps["onHoverEvidence"];
}) {
  if (evidence.total === 0) return null;
  return (
    <RelationGroupShell
      groupKey="evidence"
      dir="evidence"
      label={labels.metricEvidence}
      help={labels.metricEvidenceHelp}
      count={evidence.total}
    >
      <ul className={GROUP_ROW_LIST}>
        {evidence.rows.map((row) => (
          <li key={`evidence:${row.id}`}>
            <Link
              href={buildDocsVaultHref({ slug: row.id })}
              data-datasheet-evidence={row.id}
              onPointerEnter={() => onHoverEvidence?.(row.id)}
              onPointerLeave={() => onHoverEvidence?.(null)}
              title={row.id}
              className={controlClass({
                shape: "row",
                size: "md",
                className:
                  "rounded-chip hover:bg-[color:var(--map-panel-row-hover)] active:bg-[color:var(--map-panel-row-active)]",
              })}
            >
              <span className={GROUP_GLYPH_SLOT}>
                <FileText
                  size={ICON_SIZE.md}
                  aria-hidden="true"
                  className="shrink-0 text-[color:var(--map-panel-text-tertiary)]"
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-[color:var(--map-panel-text-secondary)]">
                {row.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </RelationGroupShell>
  );
}
