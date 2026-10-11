import { useTranslations } from "next-intl";

import { Button, Checkbox, Select } from "@/shared/ui";
import type { Project } from "@/entities/project";
import {
  PRESERVE_MISSING_TAXONOMY_VALUE,
  type ProjectFormValues,
} from "../model/schema";
import { DependencyPicker } from "./DependencyPicker";
import { MarkdownField } from "./MarkdownField";
import { FieldRow, Hint, Input, Textarea } from "./project-form-parts";

export const PROJECT_FIELD_IDS: Partial<Record<keyof ProjectFormValues, string>> = {
  slug: "project-field-slug",
  name: "project-field-name",
  nameEn: "project-field-name-en",
  category: "project-field-category",
  status: "project-field-status",
  description: "project-field-description",
  detail: "project-field-detail",
  tagsCsv: "project-field-tags",
  stackCsv: "project-field-stack",
  linksText: "project-field-links",
  startedAt: "project-field-started-at",
  launchedAt: "project-field-launched-at",
  owner: "project-field-owner",
  icon: "project-field-icon",
  progress: "project-field-progress",
};

export type ProjectFormBinding = {
  values: ProjectFormValues;
  errors: Partial<Record<keyof ProjectFormValues, string>>;
  setValue: <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) => void;
};

type TaxonomyOption = { value: string; label: string };

export function SlugField({
  form,
  mode,
  slugTaken,
  isDuplicate,
  onManualEdit,
  onRegenerate,
}: {
  form: ProjectFormBinding;
  mode: "create" | "edit";
  slugTaken: boolean;
  isDuplicate: boolean;
  onManualEdit: (value: string) => void;
  onRegenerate: () => void;
}) {
  const t = useTranslations("settings.projectForm");
  const { values, errors } = form;
  return (
    <FieldRow label={t("fields.slug")} error={errors.slug} fieldId={PROJECT_FIELD_IDS.slug}>
      <Input
        id={PROJECT_FIELD_IDS.slug}
        name="slug"
        data-testid="project-input-slug"
        value={values.slug}
        onChange={onManualEdit}
        placeholder="sample"
        disabled={mode === "edit"}
        mono
        spellCheck={false}
        aria-invalid={Boolean(errors.slug)}
      />
      {mode === "create" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            data-testid="project-generate-slug"
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            disabled={values.name.trim().length === 0}
          >
            {t("fields.slugGenerate")}
          </Button>
          {slugTaken && (
            <span
              role="alert"
              className="text-body text-[color:var(--color-status-danger)]"
            >
              {t("fields.slugDuplicate")}
            </span>
          )}
          {isDuplicate && (
            <span className="text-body text-[color:var(--color-text-quaternary)]">
              {t("fields.duplicateNotice")}
            </span>
          )}
        </div>
      )}
      <Hint>{t("fields.slugHint")}</Hint>
    </FieldRow>
  );
}

export function NameField({
  form,
  onChange,
}: {
  form: ProjectFormBinding;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("settings.projectForm");
  const { values, errors } = form;
  return (
    <FieldRow label={t("fields.name")} error={errors.name} fieldId={PROJECT_FIELD_IDS.name}>
      <Input
        id={PROJECT_FIELD_IDS.name}
        name="name"
        data-testid="project-input-name"
        value={values.name}
        onChange={onChange}
        placeholder={t("fields.namePlaceholder")}
        autoComplete="off"
        aria-invalid={Boolean(errors.name)}
      />
    </FieldRow>
  );
}

export function NameEnField({ form }: { form: ProjectFormBinding }) {
  const t = useTranslations("settings.projectForm");
  const { values, setValue } = form;
  return (
    <FieldRow label={t("fields.nameEn")} fieldId={PROJECT_FIELD_IDS.nameEn}>
      <Input
        id={PROJECT_FIELD_IDS.nameEn}
        name="nameEn"
        data-testid="project-input-name-en"
        value={values.nameEn ?? ""}
        onChange={(v) => setValue("nameEn", v)}
        placeholder={t("fields.nameEnPlaceholder")}
        autoComplete="off"
      />
    </FieldRow>
  );
}

export function CategoryStatusFields({
  form,
  categoryOptions,
  statusOptions,
  categoryKnown,
  statusKnown,
}: {
  form: ProjectFormBinding;
  categoryOptions: TaxonomyOption[];
  statusOptions: TaxonomyOption[];
  categoryKnown: boolean;
  statusKnown: boolean;
}) {
  const t = useTranslations("settings.projectForm");
  const { values, errors, setValue } = form;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldRow
        label={t("fields.category")}
        error={errors.category}
        errorTestId="project-error-category"
        fieldId={PROJECT_FIELD_IDS.category}
      >
        <Select
          id={PROJECT_FIELD_IDS.category}
          data-testid="project-input-category"
          value={values.category}
          onChange={(v) => setValue("category", v)}
          options={categoryOptions}
        />
        {!categoryKnown &&
          values.category &&
          values.category !== PRESERVE_MISSING_TAXONOMY_VALUE && (
          <Hint>
            <span data-testid="project-missing-category-warning">
              {t("fields.categoryMissingWarning")}
            </span>
          </Hint>
        )}
      </FieldRow>

      <FieldRow
        label={t("fields.status")}
        error={errors.status}
        errorTestId="project-error-status"
        fieldId={PROJECT_FIELD_IDS.status}
      >
        <Select
          id={PROJECT_FIELD_IDS.status}
          data-testid="project-input-status"
          value={values.status}
          onChange={(v) => setValue("status", v)}
          options={statusOptions}
        />
        {!statusKnown &&
          values.status &&
          values.status !== PRESERVE_MISSING_TAXONOMY_VALUE && (
          <Hint>
            <span data-testid="project-missing-status-warning">
              {t("fields.statusMissingWarning")}
            </span>
          </Hint>
        )}
      </FieldRow>
    </div>
  );
}

export function DescriptionField({ form }: { form: ProjectFormBinding }) {
  const t = useTranslations("settings.projectForm");
  const { values, errors, setValue } = form;
  return (
    <FieldRow
      label={t("fields.description")}
      error={errors.description}
      fieldId={PROJECT_FIELD_IDS.description}
    >
      <Textarea
        id={PROJECT_FIELD_IDS.description}
        name="description"
        data-testid="project-input-description"
        value={values.description}
        onChange={(v) => setValue("description", v)}
        rows={2}
        placeholder={t("fields.descriptionPlaceholder")}
        autoComplete="off"
        aria-invalid={Boolean(errors.description)}
      />
    </FieldRow>
  );
}

export function DetailField({ form }: { form: ProjectFormBinding }) {
  const t = useTranslations("settings.projectForm");
  const { values, setValue } = form;
  return (
    <FieldRow label={t("fields.detail")} fieldId={PROJECT_FIELD_IDS.detail}>
      <MarkdownField
        id={PROJECT_FIELD_IDS.detail}
        value={values.detail ?? ""}
        onChange={(v) => setValue("detail", v)}
        rows={8}
        placeholder={t("fields.detailPlaceholder")}
      />
    </FieldRow>
  );
}

export function TagsStackFields({ form }: { form: ProjectFormBinding }) {
  const t = useTranslations("settings.projectForm");
  const { values, setValue } = form;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldRow label={t("fields.tagsCsv")} fieldId={PROJECT_FIELD_IDS.tagsCsv}>
        <Input
          id={PROJECT_FIELD_IDS.tagsCsv}
          name="tagsCsv"
          value={values.tagsCsv ?? ""}
          onChange={(v) => setValue("tagsCsv", v)}
          placeholder={t("fields.tagsPlaceholder")}
        />
      </FieldRow>

      <FieldRow label={t("fields.stackCsv")} fieldId={PROJECT_FIELD_IDS.stackCsv}>
        <Input
          id={PROJECT_FIELD_IDS.stackCsv}
          name="stackCsv"
          value={values.stackCsv ?? ""}
          onChange={(v) => setValue("stackCsv", v)}
          placeholder={t("fields.stackPlaceholder")}
          mono
        />
      </FieldRow>
    </div>
  );
}

export function LinksField({ form }: { form: ProjectFormBinding }) {
  const t = useTranslations("settings.projectForm");
  const { values, errors, setValue } = form;
  return (
    <FieldRow
      label={t("fields.linksText")}
      error={errors.linksText}
      errorTestId="project-error-links"
      fieldId={PROJECT_FIELD_IDS.linksText}
    >
      <Textarea
        id={PROJECT_FIELD_IDS.linksText}
        name="linksText"
        data-testid="project-input-links"
        value={values.linksText ?? ""}
        onChange={(v) => setValue("linksText", v)}
        rows={3}
        placeholder={t("fields.linksPlaceholder")}
        mono
      />
    </FieldRow>
  );
}

export function DependenciesField({
  form,
  allProjects,
  selfSlug,
  invalidSlugs,
  suggestions,
}: {
  form: ProjectFormBinding;
  allProjects: Project[];
  selfSlug: string | undefined;
  invalidSlugs: string[];
  suggestions: React.ComponentProps<typeof DependencyPicker>["suggestions"];
}) {
  const t = useTranslations("settings.projectForm");
  const { values, errors, setValue } = form;
  return (
    <FieldRow
      label={t("fields.dependencies")}
      error={errors.dependencies}
      errorTestId="project-error-dependencies"
    >
      <DependencyPicker
        value={values.dependencies}
        onChange={(next) => setValue("dependencies", next)}
        options={allProjects}
        selfSlug={selfSlug}
        invalidSlugs={invalidSlugs}
        suggestions={suggestions}
      />
      <Hint>{t("fields.dependenciesHint")}</Hint>
    </FieldRow>
  );
}

export function OperationsFields({ form }: { form: ProjectFormBinding }) {
  const t = useTranslations("settings.projectForm");
  const { values, errors, setValue } = form;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldRow
          label={t("fields.startedAt")}
          error={errors.startedAt}
          errorTestId="project-error-startedAt"
          fieldId={PROJECT_FIELD_IDS.startedAt}
        >
          <Input
            id={PROJECT_FIELD_IDS.startedAt}
            name="startedAt"
            data-testid="project-input-started-at"
            type="date"
            value={values.startedAt ?? ""}
            onChange={(v) => setValue("startedAt", v)}
          />
        </FieldRow>

        <FieldRow
          label={t("fields.launchedAt")}
          error={errors.launchedAt}
          errorTestId="project-error-launchedAt"
          fieldId={PROJECT_FIELD_IDS.launchedAt}
        >
          <Input
            id={PROJECT_FIELD_IDS.launchedAt}
            name="launchedAt"
            data-testid="project-input-launched-at"
            type="date"
            value={values.launchedAt ?? ""}
            onChange={(v) => setValue("launchedAt", v)}
          />
        </FieldRow>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FieldRow label={t("fields.owner")} fieldId={PROJECT_FIELD_IDS.owner}>
          <Input
            id={PROJECT_FIELD_IDS.owner}
            name="owner"
            value={values.owner ?? ""}
            onChange={(v) => setValue("owner", v)}
            placeholder={t("fields.ownerPlaceholder")}
          />
        </FieldRow>

        <FieldRow label={t("fields.icon")} fieldId={PROJECT_FIELD_IDS.icon}>
          <Input
            id={PROJECT_FIELD_IDS.icon}
            name="icon"
            value={values.icon ?? ""}
            onChange={(v) => setValue("icon", v)}
            placeholder={t("fields.iconPlaceholder")}
          />
        </FieldRow>

        <FieldRow label={t("fields.progress")} fieldId={PROJECT_FIELD_IDS.progress}>
          <Input
            id={PROJECT_FIELD_IDS.progress}
            name="progress"
            type="number"
            value={values.progress !== undefined ? String(values.progress) : ""}
            onChange={(v) => setValue("progress", v === "" ? undefined : Number(v))}
            placeholder={t("fields.progressPlaceholder")}
          />
        </FieldRow>
      </div>

      <Checkbox
        className="text-body-lg"
        name="isHub"
        checked={values.isHub}
        onChange={(e) => setValue("isHub", e.target.checked)}
        label={
          <span>
            {t("fields.isHubLabel")}{" "}
            <span className="text-[color:var(--color-text-quaternary)]">
              {t("fields.isHubHint")}
            </span>
          </span>
        }
      />
    </>
  );
}
