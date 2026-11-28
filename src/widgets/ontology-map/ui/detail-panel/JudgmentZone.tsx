import { type ReactNode, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "use-intl";
import { Link } from "@/i18n/navigation";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { ConceptReach } from "../../model/concept-reach";
import { reasonsByRelation, type V2ConnectionGroupsView } from "./map-datasheet";
import { panelActionClass } from "./PanelFooter";

/** The one emphasised thing in the panel, named on its root as `data-panel-emphasis`. */
export type PanelEmphasis = "none" | "judgment" | "open-document" | "meaning-review" | "project-source";

export interface JudgmentAction {
  label: string;
  emphasis: "open-document" | "meaning-review";
  href?: string;
  onSelect?: () => void;
}

/** One fact a person has to settle before relying on the concept, in the spec's order. */
export interface JudgmentItem {
  id: "raised" | "changed-since-review" | "unverifiable" | "reasons-missing" | "edit-conflict" | "summary";
  line: ReactNode;
  /** The writer's note, as written; shown only on the first item. */
  note?: string | null;
  action?: JudgmentAction;
}

/** Kinds whose reach rows carry a recorded reason; a domain row carries a link count instead. */
const REASONED_KINDS = new Set(["capability", "element"]);

/** The reach rows that read "no reason", counted the way the rows show them. O(rows + relations). */
export function countReasonsMissing(kind: string, reach: ConceptReach | null, groups: V2ConnectionGroupsView): number {
  if (!reach || !REASONED_KINDS.has(kind)) return 0;
  const reasons = reasonsByRelation(groups);
  const missing = (rows: ConceptReach["needs"], direction: "out" | "in") =>
    rows.filter((row) => row.links === null && !reasons.has(`${direction}:${row.id}`)).length;
  return missing(reach.needs, "out") + missing(reach.neededBy, "in");
}

function ActionControl({ action, testId }: { action: JudgmentAction; testId: string }) {
  const props = {
    "data-testid": testId,
    "data-judgment-action": action.emphasis,
    className: panelActionClass(false, "row"),
  };
  return action.href ? (
    <Link href={action.href} {...props}>{action.label}</Link>
  ) : (
    <button type="button" onClick={action.onSelect} {...props}>{action.label}</button>
  );
}

const ROW = "flex min-h-7 min-w-0 items-center gap-2 text-body leading-body";

/**
 * What a person must settle first, above the definition and only when a fact holds: one row of a
 * warning icon, the sentence and its action as a quiet chip, set off by a hairline rather than a
 * box. The first item shows its note; the rest open under a plain "+N more". Nothing here says
 * the concept is wrong; the lists below stay.
 */
export function JudgmentZone({ items }: { items: readonly JudgmentItem[] }) {
  const tDial = useTranslations("mapDial");
  const tReach = useTranslations("conceptReach");
  const [open, setOpen] = useState(false);
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <section
      data-testid="map-detail-panel-judgment"
      data-judgment-first={lead.id}
      data-judgment-count={items.length}
      className="flex flex-col border-b border-[color:var(--map-panel-zone-divider)] px-[var(--map-panel-pad)] py-1.5"
    >
      <div data-judgment-item={lead.id} className={ROW}>
        <CircleAlert size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-status-warning)]" />
        <div className="min-w-0 flex-1 text-[color:var(--map-panel-text-secondary)]">{lead.line}</div>
        {lead.action ? <ActionControl action={lead.action} testId="map-detail-panel-judgment-action" /> : null}
      </div>
      {lead.note ? (
        <p
          data-testid="map-detail-panel-judgment-note"
          title={lead.note}
          className="line-clamp-2 pb-1 pl-6 text-body leading-body break-words text-[color:var(--map-panel-text-tertiary)]"
        >
          {lead.note}
        </p>
      ) : null}
      {open
        ? rest.map((item) => (
            <div key={item.id} data-judgment-item={item.id} className={`${ROW} pl-6 text-[color:var(--map-panel-text-secondary)]`}>
              <div className="min-w-0 flex-1">{item.line}</div>
              {item.action ? <ActionControl action={item.action} testId={`map-detail-panel-judgment-action-${item.id}`} /> : null}
            </div>
          ))
        : null}
      {rest.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          data-testid="map-detail-panel-judgment-more"
          className="atlas-touch-floor ml-5 inline-flex min-h-7 items-center self-start rounded-chip px-1 text-label text-[color:var(--map-panel-text-tertiary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]"
        >
          {open ? tReach("showFewer") : tDial("more", { count: rest.length })}
        </button>
      ) : null}
    </section>
  );
}
