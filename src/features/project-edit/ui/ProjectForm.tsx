"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { useFailureSentence } from "@/shared/lib/failures/use-failure-sentence";
import type { FailureCopy } from "@/shared/lib/failures/use-failure-sentence";
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { cn } from "@/shared/lib/cn";
import { slugify } from "@/shared/lib/vault-document/slugify";
import { controlClass } from "@/shared/ui";
import {
  computeSuggestedDependencies,
  wouldCreateDependencyCycle,
  type ProjectInput,
  type Project,
} from "@/entities/project";
import { useTaxonomy } from "@/features/taxonomy";
import {
  projectFormSchema,
  formValuesToProjectInput,
  type ProjectFormValues,
} from "../model/schema";
import { buildInitialValues, withKeptTaxonomyOption } from "../model/form-values";
import { checkProjectSubmission, projectPlacement } from "../model/submission";
import { CreateExtras, ExtrasGroup, FormSection } from "./project-form-parts";
import {
  CategoryStatusFields,
  DependenciesField,
  DescriptionField,
  DetailField,
  LinksField,
  NameEnField,
  NameField,
  OperationsFields,
  PROJECT_FIELD_IDS,
  SlugField,
  TagsStackFields,
  type ProjectFormBinding,
} from "./ProjectFormFields";
import { ActionRow, DangerRow, EditSaveBand, SectionNav } from "./ProjectFormActions";
import { ErrorBanner, WriteDisabledBanner } from "./ProjectFormBanners";
import { ProjectFormPreview } from "./ProjectFormPreview";

interface Props {
  mode: "create" | "edit";
  initialProject?: Project;
  initialCategoryId?: string;
  initialStatusId?: string;
  /** Every project, for the dependency picker. */
  allProjects: Project[];
  onSubmit: (
    input: ProjectInput,
    options: { behavior: "stay" | "return" },
  ) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  /** Demo mode with no vault: a banner shows and every submit is disabled up front. */
  writeDisabled?: boolean;
  /** Opens a folder from the write-locked banner; injected because FSD forbids feature→feature imports. */
  openVaultAction?: ReactNode;
}

/** The create screen's first view; everything else folds into "add more". */
const CREATE_ESSENTIAL_FIELDS = new Set<keyof ProjectFormValues>([
  "name",
  "category",
  "status",
  "description",
]);

function initialSectionOpen(mode: "create" | "edit"): Record<string, boolean> {
  const edit = mode === "edit";
  return {
    "project-form-basics": true,
    "project-form-story": true,
    "project-form-network": edit,
    "project-form-operations": edit,
  };
}

export function ProjectForm({
  mode,
  initialProject,
  initialCategoryId,
  initialStatusId,
  allProjects,
  onSubmit,
  onCancel,
  onDelete,
  onDirtyChange,
  writeDisabled = false,
  openVaultAction,
}: Props) {
  const t = useTranslations("settings.projectForm");
  const failureSentence = useFailureSentence();
  const reducedMotion = usePrefersReducedMotion();
  const { categories, statuses, getCategory, getStatus, categoryLabel, statusLabel } =
    useTaxonomy();
  const initialValues = useMemo(
    () =>
      buildInitialValues({
        mode,
        initialProject,
        allProjects,
        categoryId: categories[0]?.id ?? "",
        statusId: statuses[0]?.id ?? "",
        initialCategoryId,
        initialStatusId,
      }),
    [
      allProjects,
      categories,
      initialCategoryId,
      initialProject,
      initialStatusId,
      mode,
      statuses,
    ],
  );
  const [savedValues, setSavedValues] = useState<ProjectFormValues>(initialValues);
  const [values, setValues] = useState<ProjectFormValues>(initialValues);

  // `values` state is the source of truth; RHF only supplements dirty and submit state.
  // The resolver's inferred types do not match RHF's Resolver signature, hence `as never`.
  const rhfMethods = useForm<ProjectFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(projectFormSchema) as never,
  });
  const rhfIsDirty = rhfMethods.formState.isDirty;
  const rhfReset = rhfMethods.reset;
  const rhfSetValue = rhfMethods.setValue;
  const categoryOptions = useMemo(
    () =>
      withKeptTaxonomyOption(
        // The provider picks labels for the screen locale; `category.label` itself is Korean.
        categories.map((category) => ({ value: category.id, label: categoryLabel(category.id) })),
        values.category,
        !!getCategory(values.category),
        t("fields.categoryUnspecified"),
        t("fields.categoryMissingOption", { id: values.category }),
      ),
    [categories, categoryLabel, getCategory, t, values.category],
  );
  const statusOptions = useMemo(
    () =>
      withKeptTaxonomyOption(
        statuses.map((status) => ({ value: status.id, label: statusLabel(status.id) })),
        values.status,
        !!getStatus(values.status),
        t("fields.statusUnspecified"),
        t("fields.statusMissingOption", { id: values.status }),
      ),
    [getStatus, statusLabel, statuses, t, values.status],
  );
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(mode === "edit");
  const [slugFieldOpen, setSlugFieldOpen] = useState(false);
  const [createExtrasOpen, setCreateExtrasOpen] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ProjectFormValues, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /* A failed save keeps the banner sentence and the English cause for `data-failure-detail`. */
  const [globalError, setGlobalError] = useState<FailureCopy | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const submitBehaviorRef = useRef<"stay" | "return">("stay");
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() =>
    initialSectionOpen(mode),
  );
  const toggleSection = (id: string) =>
    setSectionOpen((current) => ({ ...current, [id]: !current[id] }));
  const existingSlugSet = useMemo(
    () =>
      new Set(
        allProjects
          .map((project) => project.slug)
          .filter((slug) =>
            mode === "edit" ? slug !== initialProject?.slug : true,
          ),
      ),
    [allProjects, initialProject?.slug, mode],
  );
  const invalidDependencySlugs = useMemo(() => {
    if (!initialProject) return [];

    return allProjects
      .filter((project) =>
        wouldCreateDependencyCycle(allProjects, initialProject.slug, project.slug),
      )
      .map((project) => project.slug);
  }, [allProjects, initialProject]);
  const dependencySuggestions = useMemo(() => {
    const invalidSet = new Set(invalidDependencySlugs);
    return computeSuggestedDependencies(
      {
        slug: values.slug,
        dependencies: values.dependencies,
        description: values.description,
        detail: values.detail,
      },
      allProjects,
    ).filter((suggestion) => !invalidSet.has(suggestion.slug));
  }, [
    allProjects,
    invalidDependencySlugs,
    values.dependencies,
    values.description,
    values.detail,
    values.slug,
  ]);
  // RHF's `isDirty` has false negatives on nested arrays, so the baseline comparison is OR'd in.
  const isDirty =
    rhfIsDirty || JSON.stringify(values) !== JSON.stringify(savedValues);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Browsers show a generic message whatever `returnValue` says; in-app Link navigation
  // is not covered here.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    queueMicrotask(() => {
      setSectionOpen(initialSectionOpen(mode));
    });
  }, [mode]);

  const setValue = <K extends keyof ProjectFormValues>(
    key: K,
    v: ProjectFormValues[K],
  ) => {
    setSaveNotice(null);
    setValues((prev) => ({ ...prev, [key]: v }));
    // `Path<T>` is not compatible with `keyof T` in RHF 7.x, hence `as never`.
    rhfSetValue(
      key as Parameters<typeof rhfSetValue>[0],
      v as never,
      { shouldDirty: true, shouldValidate: false },
    );
  };

  const focusField = (field: keyof ProjectFormValues) => {
    // Expand a collapsed section before focusing its field; an off-screen error is a dead end.
    if (mode === "create") {
      if (field === "slug") setSlugFieldOpen(true);
      else if (!CREATE_ESSENTIAL_FIELDS.has(field)) setCreateExtrasOpen(true);
    }
    const fieldId = PROJECT_FIELD_IDS[field];
    if (!fieldId || typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(fieldId);
      if (target instanceof HTMLElement) {
        target.focus();
        // jsdom lacks `scrollIntoView`; focus is what matters.
        target.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      }
    });
  };

  const syncSlugFromName = (name: string) => {
    if (mode !== "create") return;
    if (slugManuallyEdited) return;
    const nextSlug = slugify(name);
    setValues((prev) => ({ ...prev, slug: nextSlug }));
    rhfSetValue("slug", nextSlug, { shouldDirty: true, shouldValidate: false });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setSaveNotice(null);
    const submitBehavior = submitBehaviorRef.current;
    const check = checkProjectSubmission({
      values,
      mode,
      initialProject,
      allProjects,
      existingSlugSet,
      slugManuallyEdited,
      getCategory,
      getStatus,
      t,
    });
    if (!check.ok) {
      setErrors(check.errors);
      if (check.focus) focusField(check.focus);
      return;
    }
    const { data, category } = check;
    setErrors({});

    setSubmitting(true);
    try {
      const position = projectPlacement({ mode, initialProject, allProjects, category });
      const input = formValuesToProjectInput(data, position);
      await onSubmit(input, { behavior: submitBehavior });
      setSavedValues(data);
      rhfReset(data);
      if (submitBehavior === "stay") {
        setSaveNotice(
          mode === "create"
            ? t("actions.createNoticeStay")
            : t("actions.editNoticeStay"),
        );
      }
    } catch (err) {
      setGlobalError(failureSentence(err, t("validation.saveFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm(t("actions.deleteConfirm", { name: values.name }))) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setGlobalError(failureSentence(err, t("validation.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  };

  const form: ProjectFormBinding = { values, errors, setValue };
  const isDuplicate = Boolean(initialProject);
  const chooseBehavior = (behavior: "stay" | "return") => {
    submitBehaviorRef.current = behavior;
  };

  // Create and edit share one set of field fragments; only the arrangement differs.
  const slugField = (
    <SlugField
      form={form}
      mode={mode}
      slugTaken={existingSlugSet.has(values.slug) && values.slug.length > 0}
      isDuplicate={isDuplicate}
      onManualEdit={(v) => {
        setSlugManuallyEdited(true);
        setValue("slug", v);
      }}
      onRegenerate={() => {
        setSlugManuallyEdited(false);
        setValue("slug", slugify(values.name));
      }}
    />
  );

  const nameField = (
    <NameField
      form={form}
      onChange={(v) => {
        setValue("name", v);
        syncSlugFromName(v);
      }}
    />
  );

  const nameEnField = <NameEnField form={form} />;

  const categoryStatusFields = (
    <CategoryStatusFields
      form={form}
      categoryOptions={categoryOptions}
      statusOptions={statusOptions}
      categoryKnown={!!getCategory(values.category)}
      statusKnown={!!getStatus(values.status)}
    />
  );

  const descriptionField = <DescriptionField form={form} />;

  const detailField = <DetailField form={form} />;

  const tagsStackFields = <TagsStackFields form={form} />;

  const linksField = <LinksField form={form} />;

  const dependenciesField = (
    <DependenciesField
      form={form}
      allProjects={allProjects}
      selfSlug={mode === "edit" ? initialProject?.slug : undefined}
      invalidSlugs={invalidDependencySlugs}
      suggestions={dependencySuggestions}
    />
  );

  const operationsFields = <OperationsFields form={form} />;

  const writeDisabledBanner = (
    <WriteDisabledBanner writeDisabled={writeDisabled} openVaultAction={openVaultAction} />
  );

  const errorBanner = <ErrorBanner globalError={globalError} errors={errors} />;

  // Actions come after the form so nothing is pressed before the inputs are seen.
  const actionRow = (
    <ActionRow
      mode={mode}
      submitting={submitting}
      deleting={deleting}
      writeDisabled={writeDisabled}
      onCancel={onCancel}
      onChooseBehavior={chooseBehavior}
    />
  );

  // Create shows the four required fields; the slug is a caption under the name.
  const createForm = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {writeDisabledBanner}
      {errorBanner}

      <div className="flex flex-col gap-5 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2)] md:px-5">
        <div className="flex flex-col gap-2">
          {nameField}
          {slugFieldOpen ? (
            slugField
          ) : (
            /* One line, so the caption height never depends on the slug length. */
            <div className="flex items-baseline gap-2 overflow-hidden">
              <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
                {t("fields.slugAutoLabel")}
              </span>
              <span
                title={values.slug || undefined}
                className={cn(
                  "min-w-0 flex-1 truncate text-label text-[color:var(--color-text-tertiary)]",
                  values.slug && "font-mono",
                )}
              >
                {values.slug || t("fields.slugAutoPending")}
              </span>
              <button
                type="button"
                data-testid="project-slug-disclosure"
                onClick={() => setSlugFieldOpen(true)}
                /* Floor of 24 only; under 12px clearance below, so no touch-hit-expand. */
                className={controlClass({
                  shape: "link",
                  tone: "accent",
                  className:
                    "shrink-0 underline underline-offset-2 hover:text-[color:var(--color-text-primary)]",
                })}
              >
                {t("fields.slugEditToggle")}
              </button>
            </div>
          )}
        </div>
        {categoryStatusFields}
        {descriptionField}
      </div>

      <CreateExtras
        open={createExtrasOpen}
        onToggle={() => setCreateExtrasOpen((open) => !open)}
        label={t("sections.extrasLabel")}
        caption={t("sections.extrasCaption")}
        openLabel={t("sections.expandLabel")}
        closeLabel={t("sections.collapseLabel")}
      >
        <ExtrasGroup label={t("sections.storyLabel")}>
          {nameEnField}
          {detailField}
          {tagsStackFields}
          {linksField}
        </ExtrasGroup>
        <ExtrasGroup label={t("sections.networkLabel")}>{dependenciesField}</ExtrasGroup>
        <ExtrasGroup label={t("sections.operationsLabel")}>{operationsFields}</ExtrasGroup>
      </CreateExtras>

      {actionRow}
    </form>
  );

  // Edit shows every field expanded, with the save row sticky at the top.
  const editForm = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {writeDisabledBanner}

      <EditSaveBand
        mode={mode}
        isDuplicate={isDuplicate}
        isDirty={isDirty}
        submitting={submitting}
        deleting={deleting}
        writeDisabled={writeDisabled}
        onCancel={onCancel}
        onChooseBehavior={chooseBehavior}
      />

      <SectionNav />

      {errorBanner}

      <FormSection
        id="project-form-basics"
        label={t("sections.basicsLabel")}
        description={t("sections.basicsDetailedDescription")}
        collapsible={false}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {slugField}
        {nameField}
        {nameEnField}
        {categoryStatusFields}
      </FormSection>

      <FormSection
        id="project-form-story"
        label={t("sections.storyLabel")}
        description={t("sections.storyDetailedDescription")}
        isOpen={sectionOpen["project-form-story"]}
        onToggle={() => toggleSection("project-form-story")}
        helperBadge={t("sections.helperBadgeDescriptionRequired")}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {descriptionField}
        {detailField}
        {tagsStackFields}
        {linksField}
      </FormSection>

      <FormSection
        id="project-form-network"
        label={t("sections.networkLabel")}
        description={t("sections.networkDetailedDescription")}
        isOpen={sectionOpen["project-form-network"]}
        onToggle={() => toggleSection("project-form-network")}
        helperBadge={t("sections.helperBadgeAfterSave")}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {dependenciesField}
        {/* No screenshot uploader: images live inline in Markdown or as vault assets. */}
      </FormSection>

      <FormSection
        id="project-form-operations"
        label={t("sections.operationsLabel")}
        description={t("sections.operationsDetailedDescription")}
        isOpen={sectionOpen["project-form-operations"]}
        onToggle={() => toggleSection("project-form-operations")}
        helperBadge={t("sections.helperBadgeOptional")}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {operationsFields}
      </FormSection>

      {actionRow}

      {/* Edit-only danger row: the only home for deletion, dashed border as the category signal. */}
      {onDelete && (
        <DangerRow submitting={submitting} deleting={deleting} onDelete={handleDelete} />
      )}
    </form>
  );

  return (
    /*
     * The input column takes the remaining width and only the preview is fixed; `minmax(0,…)`
     * keeps long content inside the frame. The 640 in docs/prototypes/project-forms-final.html
     * is a single column, not a sidebar track. Gate: tests/contract/page-grid-fits-frame.contract.test.ts.
     */
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      {mode === "create" ? createForm : editForm}

      <ProjectFormPreview
        mode={mode}
        values={values}
        savedValues={savedValues}
        initialProject={initialProject}
        isDirty={isDirty}
        saveNotice={saveNotice}
        allProjects={allProjects}
        categoryOptions={categoryOptions}
        statusOptions={statusOptions}
      />
    </div>
  );
}
