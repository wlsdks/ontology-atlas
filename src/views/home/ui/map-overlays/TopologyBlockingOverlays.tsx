"use client";

import { CloseButton, controlClass } from "@/shared/ui";
import type { ComponentProps } from "react";
import { OntologyBootstrapForm } from "../create/OntologyBootstrapForm";

type Translate = (key: string, values?: Record<string, string | number>) => string;

interface TopologyBlockingOverlaysProps {
  t: Translate;
  bootstrapOpen: boolean;
  bootstrapPlan: ComponentProps<typeof OntologyBootstrapForm>["plan"] | null;
  closeBootstrap: () => void;
  runBootstrap: ComponentProps<typeof OntologyBootstrapForm>["onConfirm"];
  closeCreateNode: () => void;
  createNodePending: boolean;
  openDocsDrawer: () => void;
}

export function TopologyBlockingOverlays(props: TopologyBlockingOverlaysProps) {
  const { t } = props;
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
          // eslint-disable-next-line no-restricted-syntax -- the map composer stays in the map scrim layer; a body portal at the dialog layer would break the chrome order on the map
            role="dialog"
            aria-modal="true"
            aria-label={props.bootstrapPlan.existingProjectSlug ? t("bootstrap.headingAddToMap") : t("bootstrap.heading")}
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
              heading: t("bootstrap.heading"), headingAddToMap: t("bootstrap.headingAddToMap"),
              projectName: t("bootstrap.projectName"), folders: t("bootstrap.folders"),
              folderDocCount: (count) => t("bootstrap.folderDocCount", { count }),
              summary: (docCount, projectFile) => t("bootstrap.summary", { count: docCount, projectFile }),
              summaryExistingProject: (docCount, projectFile) => t("bootstrap.summaryExistingProject", { count: docCount, projectFile }),
              bodyUntouched: t("bootstrap.bodyUntouched"),
              alreadyTyped: (count) => t("bootstrap.alreadyTyped", { count }),
              runtimeSkills: (count) => t("bootstrap.runtimeSkills", { count }),
              agentPointers: (count) => t("bootstrap.agentPointers", { count }),
              libraryFiles: (count) => t("bootstrap.libraryFiles", { count }), confirm: t("bootstrap.confirm"),
              confirmAddToMap: (count) => t("bootstrap.confirmAddToMap", { count }),
              cancel: t("bootstrap.cancel"), errorPrefix: t("bootstrap.errorPrefix")
            }} />
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
          // eslint-disable-next-line no-restricted-syntax -- the map composer stays in the map scrim layer; a body portal at the dialog layer would break the chrome order on the map
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
            >{t("createNode.unavailableHeading")}</p><p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{t("createNode.unavailableBody")}</p></div><CloseButton
              onClick={props.closeCreateNode}
              label={t("createNode.cancel")}
            /></div><button
              type="button"
              onClick={() => { props.closeCreateNode(); props.openDocsDrawer(); }}
              data-testid="topology-create-node-open-workspace"
              className={controlClass({
                shape: "pill", size: "md", tone: "accent",
                className: "mt-3 justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset"
              })}
            >{t("createNode.unavailableAction")}</button></section>
          </div>
        </>
      ) : null}
    </>
  );
}
