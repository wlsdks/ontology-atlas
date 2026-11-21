"use client";

import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import type {
  FullDetailConnectionRow,
  FullDetailDomainLink,
  FullDetailGroups,
  FullDetailGroupView,
} from "../lib/full-detail-groups";
import { controlClass } from '@/shared/ui/control-class';

/**
 * The relations section: structure (contains, contained by) in one column and direction
 * (incoming, outgoing, related) in the other. A group with no rows is not drawn; its heading
 * names the relation, so a row is only the concept's kind and name, and navigates on click.
 */

export interface FullDetailA1GroupsLabels {
  containsTitle: string;
  usedByTitle: string;
  dependsOnTitle: string;
  belongsToTitle: string;
  relatedTitle: string;
  freshDotTitle: string;
  directLinks: (count: number) => string;
  domainCount: (count: number) => string;
  domainLinks: (count: number) => string;
  caption: string;
  empty: string;
}

const ROW_CLASS = controlClass({ shape: "chip", className: "flex min-w-0 gap-2 border-transparent px-1.5 py-1 text-left text-[color:var(--map-panel-text-secondary)] hover:border-[color:var(--map-panel-text-quaternary)] hover:text-[color:var(--map-panel-text-primary)]" });
const COUNT_CLASS = "shrink-0 font-mono text-label tabular-nums text-[color:var(--map-panel-text-tertiary)]";

function Row({
  row,
  onSelectNode,
  freshDotTitle,
  showChildCount,
}: {
  row: FullDetailConnectionRow;
  onSelectNode: (id: string) => void;
  freshDotTitle: string;
  /** Only the contains group counts children, so a number beside a partner always means its links. */
  showChildCount: boolean;
}) {
  return (
    <button type="button" onClick={() => onSelectNode(row.id)} data-fulldetail-row={row.id} className={ROW_CLASS}>
      <OntologyMapKindGlyph kind={row.kind} size={14} />
      <span className="min-w-0 flex-1 truncate">{row.title}</span>
      {row.fresh ? (
        <span
          aria-hidden="true"
          title={freshDotTitle}
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ backgroundColor: "var(--map-panel-power-on)" }}
        />
      ) : null}
      {showChildCount && row.childCount > 0 ? <span className={COUNT_CLASS}>{row.childCount}</span> : null}
    </button>
  );
}

function DomainRow({
  link,
  onSelectNode,
  linksTitle,
}: {
  link: FullDetailDomainLink;
  onSelectNode: (id: string) => void;
  linksTitle: string;
}) {
  return (
    <button type="button" onClick={() => onSelectNode(link.id)} data-fulldetail-domain-row={link.id} className={ROW_CLASS}>
      <OntologyMapKindGlyph kind="domain" size={14} />
      <span className="min-w-0 flex-1 truncate">{link.title}</span>
      <span title={linksTitle} className={COUNT_CLASS}>
        <span aria-hidden="true">{link.links}</span>
        <span className="sr-only">{`, ${linksTitle}`}</span>
      </span>
    </button>
  );
}

interface GroupSpec {
  dataGroup: string;
  title: string;
  view: FullDetailGroupView;
  domains?: readonly FullDetailDomainLink[];
}

function Group({
  spec,
  labels,
  onSelectNode,
}: {
  spec: GroupSpec;
  labels: FullDetailA1GroupsLabels;
  onSelectNode: (id: string) => void;
}) {
  const { dataGroup, title, view, domains } = spec;
  const rows = view.rows.map((row) => (
    <Row key={row.id} row={row} onSelectNode={onSelectNode} freshDotTitle={labels.freshDotTitle} showChildCount={dataGroup === "contains"} />
  ));
  return (
    <section data-fulldetail-group={dataGroup} className="min-w-0">
      <h3 className="flex items-baseline gap-2 text-body font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]">
        <span className="min-w-0 truncate">{title}</span>
        <span data-fulldetail-group-total={dataGroup} className={`${COUNT_CLASS} font-sans`}>
          {domains ? labels.domainCount(domains.length) : view.total}
        </span>
      </h3>
      <div className="-mx-1.5 mt-1.5 flex flex-col">
        {domains?.map((link) => (
          <DomainRow key={link.id} link={link} onSelectNode={onSelectNode} linksTitle={labels.domainLinks(link.links)} />
        ))}
        {domains && rows.length > 0 ? (
          <p data-fulldetail-direct-links={dataGroup} className="mt-2 px-1.5 text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
            {labels.directLinks(view.total)}
          </p>
        ) : null}
        {rows}
      </div>
    </section>
  );
}

export function FullDetailA1GroupsPanel({
  groups,
  labels,
  onSelectNode,
  className,
}: {
  groups: FullDetailGroups;
  labels: FullDetailA1GroupsLabels;
  onSelectNode: (id: string) => void;
  className?: string;
}) {
  const partners = (links: readonly FullDetailDomainLink[] | undefined) => (links && links.length > 0 ? links : undefined);
  const drawn = (spec: GroupSpec) => spec.view.total > 0 || spec.domains !== undefined;
  const structure = [
    { dataGroup: "contains", title: labels.containsTitle, view: groups.contains },
    { dataGroup: "belongs-to", title: labels.belongsToTitle, view: groups.belongsTo },
  ].filter(drawn);
  const direction = [
    { dataGroup: "used-by", title: labels.usedByTitle, view: groups.usedBy, domains: partners(groups.domainLevel?.usedBy) },
    { dataGroup: "depends-on", title: labels.dependsOnTitle, view: groups.dependsOn, domains: partners(groups.domainLevel?.needs) },
    { dataGroup: "related", title: labels.relatedTitle, view: groups.related },
  ].filter(drawn);
  const columns = [structure, direction].filter((column) => column.length > 0);

  if (columns.length === 0) {
    return (
      <p data-fulldetail-groups-empty className={`text-body text-[color:var(--map-panel-text-tertiary)] ${className ?? ""}`}>
        {labels.empty}
      </p>
    );
  }
  return (
    <div className={className}>
      <div className="grid items-start gap-x-10 gap-y-6 md:grid-cols-2">
        {columns.map((column) => (
          <div key={column[0].dataGroup} className="flex min-w-0 flex-col gap-6">
            {column.map((spec) => (
              <Group key={spec.dataGroup} spec={spec} labels={labels} onSelectNode={onSelectNode} />
            ))}
          </div>
        ))}
      </div>
      {direction.some((spec) => spec.dataGroup !== "related") ? (
        <p data-fulldetail-groups-caption className="mt-4 text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
          {labels.caption}
        </p>
      ) : null}
    </div>
  );
}
