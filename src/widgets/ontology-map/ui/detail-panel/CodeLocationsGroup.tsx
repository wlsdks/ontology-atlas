import { Check, Clipboard } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { truncateMiddlePath } from "@/shared/lib/concept-display/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { IconButton } from "@/shared/ui";
import { GROUP_GLYPH_SLOT, GROUP_ROW_LIST, RelationGroupShell } from "./RelationGroupShell";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

// The "Code location" group — the node's REAL code evidence (raw file
// paths), distinct from the "Evidence" group above (a source-doc slug reference).
// Rows are plain monospace text, not a `Link` or button — raw code paths are not
// vault nodes, so the clickable-reference visual pattern would misrepresent them
// as navigable. Each row gets a lightweight copy affordance, since a path is
// exactly the string an agent or developer wants on the clipboard next.
export function CodeLocationsGroup({
  codeLocations,
  labels,
}: {
  codeLocations: OntologyMapDetailPanelProps["codeLocations"];
  labels: OntologyMapDetailPanelLabels;
}) {
  if (codeLocations.length === 0) return null;
  return (
    <RelationGroupShell
      groupKey="code-locations"
      dir="code"
      label={labels.codeLocationsLabel}
      count={codeLocations.length}
    >
      <ul className={GROUP_ROW_LIST}>
        {codeLocations.map((path) => (
          <CodeLocationRow
            key={path}
            path={path}
            copyLabel={labels.codeLocationsCopyLabel}
            copiedLabel={labels.codeLocationsCopiedLabel}
          />
        ))}
      </ul>
    </RelationGroupShell>
  );
}

/**
 * One 「Code Location」 row — a raw code path (middle truncated, full
 * path on hover) plus a per-row copy button. A dedicated component rather than
 * inline in the map callback, because each row owns its OWN copy-feedback state
 * (`useCopyFeedback`) — copying one path must not flip every row's icon.
 */
function CodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li
      data-datasheet-code-location={path}
      className="flex min-h-[32px] w-full items-center gap-2 rounded-[var(--map-panel-row-radius)] px-2.5 py-2"
    >
      <span aria-hidden className={GROUP_GLYPH_SLOT} />
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--map-panel-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <IconButton
        label={state === "copied" ? copiedLabel : copyLabel}
        size="sm"
        onClick={() => void copy(path)}
        data-testid="map-detail-panel-code-location-copy"
        className="text-[color:var(--map-panel-text-quaternary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]"
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </IconButton>
    </li>
  );
}
