"use client";

import {
  OntologyMapKindGlyph,
  OntologyMapTraceMark,
} from "@/shared/ui/ontology-node/map-kind-glyph";
import type {
  FullDetailConnectionRow,
  FullDetailDomainLink,
  FullDetailGroups,
  FullDetailGroupView,
} from "../lib/full-detail-groups";
import { controlClass } from '@/shared/ui/control-class';

/**
 * Four uncapped direction groups; each row has a trace mark (solid containment, dashed depends) and
 * navigates on click (`docs/prototypes/detail-a1-datasheet.html`).
 */

export interface FullDetailA1GroupsLabels {
  containsTitle: string;
  containsCaption: string;
  usedByTitle: string;
  usedByCaption: string;
  dependsOnTitle: string;
  dependsOnCaption: string;
  belongsToTitle: string;
  belongsToCaption: string;
  freshDotTitle: string;
  directLinks: (count: number) => string;
  domainCount: (count: number) => string;
  domainLinks: (count: number) => string;
  emptyGroup: (title: string) => string;
}

const ROW_CLASS = controlClass({ shape: "chip", className: "flex min-w-0 gap-2 border-transparent px-1.5 py-1 text-left text-body text-[color:var(--map-panel-text-secondary)] hover:border-[color:var(--map-panel-text-quaternary)] hover:text-[color:var(--map-panel-text-primary)]" });
const COUNT_CLASS = "shrink-0 font-mono text-label text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]";

function Row({
  row,
  onSelectNode,
  freshDotTitle,
}: {
  row: FullDetailConnectionRow;
  onSelectNode: (id: string) => void;
  freshDotTitle: string;
}) {
  return (
    <button type="button" onClick={() => onSelectNode(row.id)} data-fulldetail-row={row.id} className={ROW_CLASS}>
      <OntologyMapTraceMark containment={row.containment} />
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
      {row.childCount > 0 ? <span className={COUNT_CLASS}>{row.childCount}</span> : null}
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
      <OntologyMapTraceMark containment={false} />
      <OntologyMapKindGlyph kind="domain" size={14} />
      <span className="min-w-0 flex-1 truncate">{link.title}</span>
      <span title={linksTitle} className={COUNT_CLASS}>
        <span aria-hidden="true">{link.links}</span>
        <span className="sr-only">{`, ${linksTitle}`}</span>
      </span>
    </button>
  );
}

function GroupCard({
  title,
  caption,
  view,
  domains,
  labels,
  twoColumn,
  onSelectNode,
  dataGroup,
  className,
}: {
  title: string;
  caption: string;
  view: FullDetailGroupView;
  domains?: readonly FullDetailDomainLink[];
  labels: FullDetailA1GroupsLabels;
  twoColumn?: boolean;
  onSelectNode: (id: string) => void;
  dataGroup: string;
  className?: string;
}) {
  const rows = view.rows.map((row) => (
    <Row key={row.id} row={row} onSelectNode={onSelectNode} freshDotTitle={labels.freshDotTitle} />
  ));
  return (
    <section
      data-fulldetail-group={dataGroup}
      className={`w-full rounded-card border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-[var(--card-pad)] ${className ?? ""}`}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-body font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--map-panel-text-primary)]">
          {title}
        </span>
        <span className="min-w-0 truncate text-label leading-label text-[color:var(--map-panel-text-secondary)]">
          {caption}
        </span>
        {domains ? (
          <span data-fulldetail-group-total={dataGroup} className="ml-auto shrink-0 text-label leading-label tabular-nums text-[color:var(--map-panel-text-secondary)]">
            {labels.domainCount(domains.length)}
          </span>
        ) : (
          <span
            data-fulldetail-group-total={dataGroup}
            className="ml-auto font-mono text-body text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {view.total}
          </span>
        )}
      </div>
      {domains ? (
        <>
          <div className="-mx-1.5 flex flex-col">
            {domains.map((link) => (
              <DomainRow key={link.id} link={link} onSelectNode={onSelectNode} linksTitle={labels.domainLinks(link.links)} />
            ))}
          </div>
          <p data-fulldetail-direct-links={dataGroup} className="mt-2 text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
            {labels.directLinks(view.total)}
          </p>
          {rows.length > 0 ? <div className="-mx-1.5 mt-1 flex flex-col">{rows}</div> : null}
        </>
      ) : (
        <div className={twoColumn ? "-mx-1.5 grid grid-cols-2 gap-x-4" : "-mx-1.5 flex flex-col"}>{rows}</div>
      )}
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
  const side = [
    { dataGroup: "used-by", title: labels.usedByTitle, caption: labels.usedByCaption, view: groups.usedBy, domains: groups.domainLevel?.usedBy },
    { dataGroup: "depends-on", title: labels.dependsOnTitle, caption: labels.dependsOnCaption, view: groups.dependsOn, domains: groups.domainLevel?.needs },
    { dataGroup: "belongs-to", title: labels.belongsToTitle, caption: labels.belongsToCaption, view: groups.belongsTo, domains: undefined },
  ];
  const filled = side.filter((group) => group.view.total > 0 || (group.domains?.length ?? 0) > 0);
  const containsFilled = groups.contains.total > 0;
  const empty = [
    ...(containsFilled ? [] : [{ title: labels.containsTitle }]),
    ...side.filter((group) => !filled.includes(group)),
  ];
  return (
    <div className={className}>
      <div className="grid gap-[22px] md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {containsFilled ? (
          <GroupCard
            dataGroup="contains"
            title={labels.containsTitle}
            caption={labels.containsCaption}
            view={groups.contains}
            labels={labels}
            twoColumn
            onSelectNode={onSelectNode}
          />
        ) : null}
        <div className="flex flex-col gap-4">
          {filled.map((group, index) => (
            <GroupCard
              key={group.dataGroup}
              dataGroup={group.dataGroup}
              title={group.title}
              caption={group.caption}
              view={group.view}
              domains={group.domains}
              labels={labels}
              onSelectNode={onSelectNode}
              className={index === filled.length - 1 ? "flex-1" : undefined}
            />
          ))}
        </div>
      </div>
      {empty.length > 0 ? (
        <p data-fulldetail-empty-groups className="mt-3 flex flex-wrap gap-x-2 text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
          {empty.map((group, index) => (
            <span key={group.title} className="flex gap-x-2">
              {index > 0 ? <span aria-hidden="true">·</span> : null}
              {labels.emptyGroup(group.title)}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
