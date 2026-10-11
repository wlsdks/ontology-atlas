import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { fieldLabel } from "@/shared/ui/control-class";
import { cn } from "@/shared/lib/cn";
import { Button, controlClass } from "@/shared/ui";

type SubmitBehavior = "stay" | "return";

const FORM_SECTION_IDS = [
  "project-form-basics",
  "project-form-story",
  "project-form-network",
  "project-form-operations",
] as const;

export function ActionRow({
  mode,
  submitting,
  deleting,
  writeDisabled,
  onCancel,
  onChooseBehavior,
}: {
  mode: "create" | "edit";
  submitting: boolean;
  deleting: boolean;
  writeDisabled: boolean;
  onCancel: () => void;
  onChooseBehavior: (behavior: SubmitBehavior) => void;
}) {
  const t = useTranslations("settings.projectForm");
  const primarySubmitLabel = submitting
    ? t("actions.saving")
    : mode === "create"
      ? t("actions.createAndContinue")
      : t("actions.saveAndContinue");
  const returnSubmitLabel =
    mode === "create" ? t("actions.createAndReturn") : t("actions.saveAndReturn");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--color-overlay-2)] pt-6">
      <Button
        data-testid="project-cancel"
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={submitting || deleting}
      >
        {t("actions.cancel")}
      </Button>
      <Button
        data-testid="project-save-return"
        type="submit"
        data-submit-behavior="return"
        variant="outline"
        onClick={() => {
          onChooseBehavior("return");
        }}
        disabled={submitting || deleting || writeDisabled}
      >
        {returnSubmitLabel}
      </Button>
      {/* One filled primary CTA per screen: edit's sticky band carries it, so this repeat is outline. */}
      <Button
        data-testid="project-save"
        type="submit"
        data-submit-behavior="stay"
        variant={mode === "edit" ? "outline" : "primary"}
        onClick={() => {
          onChooseBehavior("stay");
        }}
        disabled={submitting || deleting || writeDisabled}
      >
        {primarySubmitLabel}
      </Button>
    </div>
  );
}

export function EditSaveBand({
  mode,
  isDuplicate,
  isDirty,
  submitting,
  deleting,
  writeDisabled,
  onCancel,
  onChooseBehavior,
}: {
  mode: "create" | "edit";
  isDuplicate: boolean;
  isDirty: boolean;
  submitting: boolean;
  deleting: boolean;
  writeDisabled: boolean;
  onCancel: () => void;
  onChooseBehavior: (behavior: SubmitBehavior) => void;
}) {
  const t = useTranslations("settings.projectForm");
  const primarySubmitLabel = submitting
    ? t("actions.saving")
    : mode === "create"
      ? t("actions.createAndContinue")
      : t("actions.saveAndContinue");
  const returnSubmitLabel =
    mode === "create" ? t("actions.createAndReturn") : t("actions.saveAndReturn");
  const editorModeLabel =
    mode === "create"
      ? isDuplicate
        ? t("actions.modeDuplicate")
        : t("actions.modeCreate")
      : t("actions.modeEdit");
  const dirtyStateLabel = isDirty ? t("actions.dirty") : t("actions.clean");
  const compactDirtyStateLabel = isDirty ? t("actions.compactDirty") : t("actions.compactClean");
  return (
    <>
      {/* This band floats over the scrolling form, so it takes the ladder's lowest floating shadow. */}
      <div className="sticky top-4 z-10 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-2),var(--shadow-elevation-1)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={fieldLabel({ className: "font-mono uppercase tracking-[var(--tracking-caps-12)]" })}>
                {editorModeLabel}
              </p>
              <p className="mt-2 hidden text-body-lg text-[color:var(--color-text-secondary)] md:block">
                {t("actions.headerHelpEdit")}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full border px-3 py-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] md:hidden",
                  isDirty
                    ? "border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-primary)]"
                    : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]",
                )}
              >
                {compactDirtyStateLabel}
              </span>
            </div>
            <span
              className={cn(
                "hidden rounded-full border px-3 py-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] md:inline-flex",
                isDirty
                  ? "border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-primary)]"
                  : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]",
              )}
            >
              {dirtyStateLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
            {/* Delete lives in the danger row at the foot, away from the save cluster. */}
            <Button
              data-testid="project-cancel-top"
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting || deleting}
              className="justify-center"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              data-testid="project-save-return-top"
              type="submit"
              data-submit-behavior="return"
              variant="outline"
              onClick={() => {
                onChooseBehavior("return");
              }}
              disabled={submitting || deleting || writeDisabled}
              className="justify-center"
            >
              {returnSubmitLabel}
            </Button>
            <Button
              data-testid="project-save-top"
              type="submit"
              data-submit-behavior="stay"
              onClick={() => {
                onChooseBehavior("stay");
              }}
              disabled={submitting || deleting || writeDisabled}
              className="col-span-2 justify-center md:col-span-1 md:min-w-[88px]"
            >
              {primarySubmitLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function SectionNav() {
  const t = useTranslations("settings.projectForm");
  const FORM_SECTIONS = useMemo(
    () => [
      {
        id: FORM_SECTION_IDS[0],
        label: t("sections.basicsLabel"),
        description: t("sections.basicsDescription"),
      },
      {
        id: FORM_SECTION_IDS[1],
        label: t("sections.storyLabel"),
        description: t("sections.storyDescription"),
      },
      {
        id: FORM_SECTION_IDS[2],
        label: t("sections.networkLabel"),
        description: t("sections.networkDescription"),
      },
      {
        id: FORM_SECTION_IDS[3],
        label: t("sections.operationsLabel"),
        description: t("sections.operationsDescription"),
      },
    ],
    [t],
  );
  return (
    <div className="rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          {t("sections.navLabel")}
        </p>
        <nav className="flex flex-wrap gap-2">
          {FORM_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={controlClass({
                shape: "pill",
                size: "lg",
                tone: "secondary",
                className:
                  "hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function DangerRow({
  submitting,
  deleting,
  onDelete,
}: {
  submitting: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("settings.projectForm");
  return (
    <div
      data-testid="project-danger-row"
      className="mt-4 flex items-center gap-3 rounded-card border border-dashed border-[color:var(--color-border-strong)] px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-body text-[color:var(--color-text-secondary)]">
          {t("actions.deleteRowTitle")}
        </p>
        <p className="mt-0.5 text-label text-[color:var(--color-text-quaternary)]">
          {t("actions.deleteRowCaption")}
        </p>
      </div>
      <Button
        data-testid="project-delete"
        type="button"
        variant="outline"
        onClick={onDelete}
        disabled={deleting || submitting}
        className="ml-auto shrink-0 border-[color:var(--color-border-soft)] text-[color:var(--color-status-danger)] hover:border-[color:var(--color-danger-a50)]"
      >
        {deleting ? t("actions.deleting") : t("actions.delete")}
      </Button>
    </div>
  );
}
