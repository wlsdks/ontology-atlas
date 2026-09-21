"use client";

import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { X } from "lucide-react";
import type { ComponentProps, KeyboardEvent, RefObject } from "react";
import { CreateNodeForm } from "./CreateNodeForm";
import { OntologyBootstrapForm } from "./OntologyBootstrapForm";

const CREATE_NODE_DIALOG_TITLE_ID = "topology-create-node-dialog-title";
type Translate = (key: string, values?: Record<string, string | number>) => string;

interface TopologyBlockingOverlaysProps {
  t: Translate;
  bootstrapOpen: boolean;
  bootstrapPlan: ComponentProps<typeof OntologyBootstrapForm>["plan"] | null;
  closeBootstrap: () => void;
  runBootstrap: ComponentProps<typeof OntologyBootstrapForm>["onConfirm"];
  canCreateNode: boolean;
  createNodeOpen: boolean;
  closeCreateNode: () => void;
  createNodePanelRef: RefObject<HTMLDivElement | null>;
  onCreateNodePanelKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  createNode: ComponentProps<typeof CreateNodeForm>["onCreate"];
  createNodeDomainOptions: ComponentProps<typeof CreateNodeForm>["domainOptions"];
  createNodeDefaultKind: ComponentProps<typeof CreateNodeForm>["defaultKind"];
  createNodeSeedDomain: string;
  activeLocale: string;
  createNodeProposal: {
    changeSet: NonNullable<ComponentProps<typeof CreateNodeForm>["review"]>["changeSet"];
  } | null;
  createNodeConfirming: boolean;
  clearCreateNodeProposal: () => void;
  confirmCreateNode: () => void;
  createNodePending: boolean;
  openDocsDrawer: () => void;
}

export function TopologyBlockingOverlays(props: TopologyBlockingOverlaysProps) {
  const { t, createNodePanelRef, onCreateNodePanelKeyDown } = props;
  return (
    <>
      {props.bootstrapOpen && props.bootstrapPlan ? (
        <>
          <button
            type="button"
            aria-label={t("bootstrap.cancel")}
            className="absolute inset-0 z-[var(--z-map-scrim)] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
            data-interactive-overlay="true"
            data-testid="ontology-bootstrap-backdrop"
            data-backdrop-contract="blocks-map-and-closes-composer"
            data-backdrop-surface-token="--topology-blocking-backdrop-surface"
            onClick={props.closeBootstrap}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("bootstrap.heading")}
            tabIndex={-1}
            className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 max-h-[var(--topology-blocking-composer-max-height)] w-[var(--topology-blocking-composer-width)] -translate-x-1/2 overflow-y-auto"
            data-testid="ontology-bootstrap-panel"
            data-attention-role="blocking-composer"
            data-placement-contract="centered-blocking-edit"
            data-surface-role="blocking-edit-surface"
            data-elevation-contract="solid-panel-over-dimmed-map"
            data-size-contract="bounded-centered-composer"
            data-top-token="--topology-blocking-composer-top"
            data-width-token="--topology-blocking-composer-width"
            data-max-height-token="--topology-blocking-composer-max-height"
          >
            <OntologyBootstrapForm plan={props.bootstrapPlan} onCancel={props.closeBootstrap} onConfirm={props.runBootstrap} labels={{
              heading: t("bootstrap.heading"), projectName: t("bootstrap.projectName"), folders: t("bootstrap.folders"),
              folderDocCount: (count) => t("bootstrap.folderDocCount", { count }),
              summary: (docCount, projectFile) => t("bootstrap.summary", { count: docCount, projectFile }),
              summaryExistingProject: (docCount, projectFile) => t("bootstrap.summaryExistingProject", { count: docCount, projectFile }),
              bodyUntouched: t("bootstrap.bodyUntouched"),
              alreadyTyped: (count) => t("bootstrap.alreadyTyped", { count }),
              runtimeSkills: (count) => t("bootstrap.runtimeSkills", { count }),
              agentPointers: (count) => t("bootstrap.agentPointers", { count }),
              libraryFiles: (count) => t("bootstrap.libraryFiles", { count }), confirm: t("bootstrap.confirm"),
              cancel: t("bootstrap.cancel"), errorPrefix: t("bootstrap.errorPrefix")
            }} />
          </div>
        </>
      ) : null}
      {props.canCreateNode && props.createNodeOpen ? (
        <>
          <button
            type="button"
            aria-label={t("createNode.cancel")}
            className="absolute inset-0 z-[var(--z-map-scrim)] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
            data-interactive-overlay="true"
            data-testid="topology-create-node-backdrop"
            data-backdrop-contract="blocks-map-and-closes-composer"
            data-backdrop-surface-token="--topology-blocking-backdrop-surface"
            onClick={props.closeCreateNode}
          />
          <div
            ref={createNodePanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={CREATE_NODE_DIALOG_TITLE_ID}
            tabIndex={-1}
            onKeyDown={onCreateNodePanelKeyDown}
            className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 max-h-[var(--topology-blocking-composer-max-height)] w-[min(var(--dialog-w-md),calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto"
            data-testid="topology-create-node-panel"
            data-attention-role="blocking-composer"
            data-placement-contract="centered-blocking-edit"
            data-surface-role="blocking-edit-surface"
            data-elevation-contract="solid-panel-over-dimmed-map"
            data-size-contract="bounded-centered-composer"
            data-top-token="--topology-blocking-composer-top"
            data-width-token="--dialog-w-md"
            data-max-height-token="--topology-blocking-composer-max-height"
          >
            <CreateNodeForm
              onCreate={props.createNode}
              onCancel={props.closeCreateNode}
              domainOptions={props.createNodeDomainOptions}
              labels={{
                headingId: CREATE_NODE_DIALOG_TITLE_ID, heading: t("createNode.heading"),
                titlePlaceholder: t("createNode.titlePlaceholder"), kind: t("createNode.kind"),
                domain: t("createNode.domain"), domainQuestion: t("createNode.domainQuestion"),
                domainNone: t("createNode.domainNone"), domainHelper: t("createNode.domainHelper"),
                create: t("createNode.create"), cancel: t("createNode.cancel"),
                reviewHeading: t("createNode.reviewHeading"), reviewBack: t("createNode.reviewBack"),
                reviewConfirm: t("createNode.reviewConfirm"), reviewConfirming: t("createNode.reviewConfirming"),
                kindLabels: { project: t("createNode.kindProject"), domain: t("createNode.kindDomain"), capability: t("createNode.kindCapability"), element: t("createNode.kindElement") },
                primaryNamePlaceholder: t("createNode.primaryNamePlaceholder"),
                secondaryNamePlaceholder: t("createNode.secondaryNamePlaceholder"),
                localeNamesHint: t("createNode.localeNamesHint"),
                primaryLocaleRequired: t("createNode.primaryLocaleRequired")
              }}
              defaultKind={props.createNodeDefaultKind}
              defaultDomain={props.createNodeSeedDomain}
              localeNames={{ primaryLocale: props.activeLocale, secondaryLocale: props.activeLocale === "ko" ? "en" : "ko" }}
              review={props.createNodeProposal ? {
                changeSet: props.createNodeProposal.changeSet, confirming: props.createNodeConfirming,
                onBack: props.clearCreateNodeProposal, onConfirm: props.confirmCreateNode
              } : null}
            />
          </div>
        </>
      ) : null}
      {props.createNodePending ? (
        <>
          <button
            type="button"
            aria-label={t("createNode.cancel")}
            className="absolute inset-0 z-[var(--z-map-scrim)] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
            data-interactive-overlay="true"
            data-testid="topology-create-node-pending-backdrop"
            data-backdrop-contract="blocks-map-and-clears-create-intent"
            data-backdrop-surface-token="--topology-blocking-backdrop-surface"
            onClick={props.closeCreateNode}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="topology-create-node-unavailable-title"
            className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 w-[var(--topology-blocking-composer-width)] -translate-x-1/2"
            data-testid="topology-create-node-unavailable-panel"
            data-attention-role="blocking-composer"
            data-create-intent-state="pending-writable-vault"
            data-placement-contract="centered-blocking-edit"
            data-surface-role="blocking-edit-surface"
            data-elevation-contract="solid-panel-over-dimmed-map"
            data-size-contract="bounded-centered-composer"
            data-top-token="--topology-blocking-composer-top"
            data-width-token="--topology-blocking-composer-width"
          >
            <section className="rounded-card border border-[color:var(--topology-blocking-composer-border)] bg-[color:var(--topology-blocking-composer-surface)] px-4 py-3 shadow-[var(--topology-blocking-composer-shadow)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p
              id="topology-create-node-unavailable-title"
              className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-text-soft)]"
            >{t("createNode.unavailableHeading")}</p><p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{t("createNode.unavailableBody")}</p></div><button
              type="button"
              onClick={props.closeCreateNode}
              aria-label={t("createNode.cancel")}
              className={controlClass({
                shape: "icon", size: "sm", tone: "muted",
                className: "hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset"
              })}
            ><X size={ICON_SIZE.sm} aria-hidden /></button></div><button
              type="button"
              onClick={() => { props.closeCreateNode(); props.openDocsDrawer(); }}
              data-testid="topology-create-node-open-workspace"
              className={controlClass({
                shape: "pill", size: "md", tone: "accentOnTint",
                className: "mt-3 justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset"
              })}
            >{t("createNode.unavailableAction")}</button></section>
          </div>
        </>
      ) : null}
    </>
  );
}
