import { FileCode2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { truncateMiddlePath } from "@/shared/lib/concept-display/truncate-middle-path";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { GROUP_GLYPH_SLOT } from "./RelationGroupShell";
import type { OntologyMapDetailPanelProps } from "./detail-panel-props";

const PATH_CHARACTERS = 34;

/**
 * The concept's code, one press from the code reader beside the panel. It keeps its selected look
 * while the reader is open, and a second press closes the reader.
 */
export function CodeRow({ row }: { row: NonNullable<OntologyMapDetailPanelProps["codeRow"]> }) {
  const t = useTranslations("codeReader");
  return (
    <div className="px-[var(--map-panel-pad)] pb-3">
      <button
        type="button"
        onClick={row.onToggle}
        aria-pressed={row.readerOpen}
        aria-label={t("row.open", { path: row.path })}
        title={row.path}
        data-testid="map-detail-panel-code"
        data-code-reader-open={row.readerOpen ? "true" : "false"}
        className={controlClass({
          shape: "row",
          size: "sm",
          scope: "panel",
          tone: "secondary",
          active: row.readerOpen,
          hoverSurface: "lift",
          hoverInk: "strong",
          className: "-mx-2 w-[calc(100%+1rem)] text-left",
        })}
      >
        <span className={GROUP_GLYPH_SLOT}>
          <FileCode2 size={ICON_SIZE.sm} aria-hidden />
        </span>
        <span className="shrink-0 font-[var(--font-weight-emphasis)]">{t("row.label")}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--map-panel-text-tertiary)]">
          {truncateMiddlePath(row.path, PATH_CHARACTERS)}
        </span>
        {row.citeCount > 0 ? (
          <span className="shrink-0 text-label tabular-nums text-[color:var(--map-panel-text-tertiary)]">
            {t("row.cites", { count: row.citeCount })}
          </span>
        ) : null}
      </button>
    </div>
  );
}
