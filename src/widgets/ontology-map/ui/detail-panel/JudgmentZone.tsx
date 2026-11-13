import { type ReactNode, useState } from "react";
import { ChevronRight, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
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

function ActionControl({ action, filled, testId }: { action: JudgmentAction; filled: boolean; testId: string }) {
  const props = {
    "data-testid": testId,
    "data-judgment-action": action.emphasis,
    "data-action-role": filled ? "primary" : "secondary",
    className: panelActionClass(filled),
  };
  return action.href ? (
    <Link href={action.href} {...props}>{action.label}</Link>
  ) : (
    <button type="button" onClick={action.onSelect} {...props}>{action.label}</button>
  );
}

/**
 * What a person must settle first, above the definition and only when a fact holds. The first item
 * shows its note and carries the one action; the rest fold under "그 밖에 N". Nothing here says the
 * concept is wrong; the lists below stay.
 */
export function JudgmentZone({ items, actionFilled }: { items: readonly JudgmentItem[]; actionFilled: boolean }) {
  const tDial = useTranslations("mapDial");
  const [open, setOpen] = useState(false);
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <section
      data-testid="map-detail-panel-judgment"
      data-judgment-first={lead.id}
      data-judgment-count={items.length}
      className="mx-[var(--map-panel-pad)] mb-3 flex flex-col gap-1.5 rounded-chip border border-[color:var(--color-amber-signal-a30)] bg-[color:var(--color-amber-signal-a07)] px-2.5 py-2"
    >
      <div data-judgment-item={lead.id} className="flex items-start gap-2">
        <CircleAlert size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]" />
        <div className="min-w-0 flex-1 text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-text-primary)]">
          {lead.line}
        </div>
      </div>
      {lead.note ? (
        <p
          data-testid="map-detail-panel-judgment-note"
          title={lead.note}
          className="line-clamp-2 pl-6 text-body leading-body break-words text-[color:var(--map-panel-text-secondary)]"
        >
          {lead.note}
        </p>
      ) : null}
      {lead.action || rest.length > 0 ? (
        <div className="flex items-center gap-2 pl-6">
          {lead.action ? <ActionControl action={lead.action} filled={actionFilled} testId="map-detail-panel-judgment-action" /> : null}
          {rest.length > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              data-testid="map-detail-panel-judgment-more"
              className="atlas-touch-floor ml-auto inline-flex min-h-7 items-center gap-1 rounded-chip px-1.5 text-label text-[color:var(--map-panel-text-secondary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]"
            >
              {tDial("more", { count: rest.length })}
              <ChevronRight size={ICON_SIZE.sm} aria-hidden className={open ? "rotate-90" : undefined} />
            </button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <ul className="flex flex-col gap-1.5 border-t border-[color:var(--color-amber-signal-a16)] pt-1.5 pl-6">
          {rest.map((item) => (
            <li key={item.id} data-judgment-item={item.id} className="flex min-w-0 items-center gap-2 text-body leading-body text-[color:var(--map-panel-text-secondary)]">
              <div className="min-w-0 flex-1">{item.line}</div>
              {item.action ? <ActionControl action={item.action} filled={false} testId={`map-detail-panel-judgment-action-${item.id}`} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
