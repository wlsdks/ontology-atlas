"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import type { FailureCopy } from "@/shared/lib/use-failure-sentence";
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { ChevronDown } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { fieldClass, fieldLabel } from "@/shared/ui/control-class";
import { cn } from "@/shared/lib/cn";
import { slugify } from "@/shared/lib/slugify";
import { Button, Checkbox, controlClass } from "@/shared/ui";
import {
  ProjectCard,
  computeHubSlugs,
  computeSuggestedDependencies,
  findDuplicateDependencySlugs,
  findMissingDependencySlugs,
  isSharedNode,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  wouldCreateDependencyCycle,
  type ProjectInput,
  type Project,
} from "@/entities/project";
import { useTaxonomy } from "@/features/taxonomy";
import {
  duplicateProjectToFormValues,
  projectFormSchema,
  projectToFormValues,
  formValuesToProjectInput,
  PRESERVE_MISSING_TAXONOMY_VALUE,
  type ProjectFormValues,
} from "../model/schema";
import { findProjectPlacement } from "../model/placement";
import { DependencyPicker } from "./DependencyPicker";
import { MarkdownField } from "./MarkdownField";

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


// schema.ts cannot use hooks, so it returns `validation.<key>` i18n keys translated here.
function resolveValidationMessage(
  t: ReturnType<typeof useTranslations>,
  message: string,
): string {
  if (message.startsWith("validation.linkLine:")) {
    const [, index, code] = message.split(":");
    return t(`validation.linkLine.${code}`, { index });
  }
  if (message.startsWith("validation.")) {
    return t(message);
  }
  return message;
}

const FORM_SECTION_IDS = [
  "project-form-basics",
  "project-form-story",
  "project-form-network",
  "project-form-operations",
] as const;

/** The create screen's first view; everything else folds into "add more". */
const CREATE_ESSENTIAL_FIELDS = new Set<keyof ProjectFormValues>([
  "name",
  "category",
  "status",
  "description",
]);

const PROJECT_FIELD_IDS: Partial<Record<keyof ProjectFormValues, string>> = {
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

function buildInitialValues({
  mode,
  initialProject,
  allProjects,
  categoryId,
  statusId,
  initialCategoryId,
  initialStatusId,
}: {
  mode: "create" | "edit";
  initialProject?: Project;
  allProjects: Project[];
  categoryId: string;
  statusId: string;
  initialCategoryId?: string;
  initialStatusId?: string;
}): ProjectFormValues {
  if (initialProject) {
    const values = mode === "edit"
      ? projectToFormValues(initialProject)
      : duplicateProjectToFormValues(
          initialProject,
          allProjects.map((project) => project.slug),
        );
    return {
      ...values,
      // Duplicate and create are new documents, so they use the visible taxonomy
      // default. Edit keeps a form-only preserve value so it never invents a typed
      // fact the original lacked, switching to a real id only when the user picks one.
      category:
        mode === "create"
          ? initialProject.category ?? initialCategoryId ?? categoryId
          : initialProject.category ?? PRESERVE_MISSING_TAXONOMY_VALUE,
      status:
        mode === "create"
          ? initialProject.status ?? initialStatusId ?? statusId
          : initialProject.status ?? PRESERVE_MISSING_TAXONOMY_VALUE,
    };
  }

  return {
    slug: "",
    name: "",
    nameEn: "",
    category: initialCategoryId ?? categoryId,
    status: initialStatusId ?? statusId,
    description: "",
    detail: "",
    tagsCsv: "",
    stackCsv: "",
    linksText: "",
    dependencies: [],
    screenshots: [],
    startedAt: "",
    launchedAt: "",
    owner: "",
    icon: "",
    progress: undefined,
    isHub: false,
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
  const tFreshness = useTranslations("projectFreshness");
  const { categories, statuses, getCategory, getStatus, categoryLabel, statusLabel } =
    useTaxonomy();
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
  const categoryOptions = useMemo(() => {
    // The provider picks labels for the screen locale; `category.label` itself is Korean.
    const options = categories.map((category) => ({
      value: category.id,
      label: categoryLabel(category.id),
    }));
    if (values.category === PRESERVE_MISSING_TAXONOMY_VALUE) {
      return [
        {
          value: PRESERVE_MISSING_TAXONOMY_VALUE,
          label: t("fields.categoryUnspecified"),
        },
        ...options,
      ];
    }
    if (values.category && !getCategory(values.category)) {
      return [
        {
          value: values.category,
          label: t("fields.categoryMissingOption", { id: values.category }),
        },
        ...options,
      ];
    }
    return options;
  }, [categories, categoryLabel, getCategory, t, values.category]);
  const statusOptions = useMemo(() => {
    const options = statuses.map((status) => ({
      value: status.id,
      label: statusLabel(status.id),
    }));
    if (values.status === PRESERVE_MISSING_TAXONOMY_VALUE) {
      return [
        {
          value: PRESERVE_MISSING_TAXONOMY_VALUE,
          label: t("fields.statusUnspecified"),
        },
        ...options,
      ];
    }
    if (values.status && !getStatus(values.status)) {
      return [
        {
          value: values.status,
          label: t("fields.statusMissingOption", { id: values.status }),
        },
        ...options,
      ];
    }
    return options;
  }, [getStatus, statusLabel, statuses, t, values.status]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(mode === "edit");
  const [slugFieldOpen, setSlugFieldOpen] = useState(false);
  const [createExtrasOpen, setCreateExtrasOpen] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ProjectFormValues, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  /* A failed save keeps the banner sentence and the English cause for `data-failure-detail`. */
  const [globalError, setGlobalError] = useState<FailureCopy | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const submitBehaviorRef = useRef<"stay" | "return">("stay");
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() =>
    mode === "create"
      ? {
          "project-form-basics": true,
          "project-form-story": true,
          "project-form-network": false,
          "project-form-operations": false,
        }
      : {
          "project-form-basics": true,
          "project-form-story": true,
          "project-form-network": true,
          "project-form-operations": true,
        },
  );
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
      setSectionOpen(
        mode === "create"
          ? {
              "project-form-basics": true,
              "project-form-story": true,
              "project-form-network": false,
              "project-form-operations": false,
            }
          : {
              "project-form-basics": true,
              "project-form-story": true,
              "project-form-network": true,
              "project-form-operations": true,
            },
      );
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

  const previewProject = useMemo<Project>(
    () => ({
      slug: values.slug,
      name: values.name,
      nameEn: values.nameEn || undefined,
      category:
        values.category === PRESERVE_MISSING_TAXONOMY_VALUE
          ? undefined
          : values.category,
      status:
        values.status === PRESERVE_MISSING_TAXONOMY_VALUE
          ? undefined
          : values.status,
      description: values.description,
      detail: values.detail || undefined,
      tags: (values.tagsCsv ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      stack: (values.stackCsv ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      links: [],
      dependencies: values.dependencies,
      owner: values.owner || undefined,
      icon: values.icon || undefined,
      screenshots: values.screenshots,
      timeline: {
        startedAt: values.startedAt
          ? new Date(`${values.startedAt}T00:00:00.000Z`)
          : undefined,
        launchedAt: values.launchedAt
          ? new Date(`${values.launchedAt}T00:00:00.000Z`)
          : undefined,
      },
      progress: values.progress,
      isHub: values.isHub,
      position: initialProject?.position ?? { x: 0, y: 0 },
      createdAt: initialProject?.createdAt ?? new Date(),
      updatedAt: new Date(),
    }),
    [values, initialProject],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setSaveNotice(null);
    const submitBehavior = submitBehaviorRef.current;
    const parsed = projectFormSchema.safeParse(values);
    if (!parsed.success) {
      const map: Partial<Record<keyof ProjectFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const k =
          (issue.path[0] as keyof ProjectFormValues | undefined) ??
          (issue.message.startsWith("Link ")
            ? "linksText"
            : undefined);
        if (!k) continue;
        map[k] = resolveValidationMessage(t, issue.message);
      }
      // An automatic address cannot exist before its name. Keep the first
      // correction on the visible name field instead of exposing a second,
      // apparently malformed input the person never edited.
      if (mode === "create" && !slugManuallyEdited && !values.name.trim()) delete map.slug;
      setErrors(map);
      const firstField = map.name ? "name" : Object.keys(map)[0] as keyof ProjectFormValues | undefined;
      if (firstField) focusField(firstField);
      return;
    }
    const preservesMissingCategory =
      mode === "edit" &&
      !initialProject?.category &&
      parsed.data.category === PRESERVE_MISSING_TAXONOMY_VALUE;
    const preservesMissingStatus =
      mode === "edit" &&
      !initialProject?.status &&
      parsed.data.status === PRESERVE_MISSING_TAXONOMY_VALUE;
    const nextCategory = preservesMissingCategory
      ? undefined
      : getCategory(parsed.data.category);
    const nextStatus = preservesMissingStatus
      ? undefined
      : getStatus(parsed.data.status);
    if (
      (!preservesMissingCategory && !nextCategory) ||
      (!preservesMissingStatus && !nextStatus)
    ) {
      const nextErrors = {
        ...(!preservesMissingCategory && !nextCategory
          ? { category: t("validation.categoryNotFound") }
          : {}),
        ...(!preservesMissingStatus && !nextStatus
          ? { status: t("validation.statusNotFound") }
          : {}),
      };
      setErrors(nextErrors);
      focusField(
        !preservesMissingCategory && !nextCategory ? "category" : "status",
      );
      return;
    }

    const availableDependencySlugs = allProjects
      .filter((project) =>
        mode === "edit" ? project.slug !== initialProject?.slug : true,
      )
      .map((project) => project.slug);
    const missingDependencies = findMissingDependencySlugs(
      parsed.data.dependencies,
      availableDependencySlugs,
    );
    if (missingDependencies.length > 0) {
      setErrors({
        dependencies: t("validation.missingDependencies", {
          slugs: missingDependencies.join(", "),
        }),
      });
      focusField("dependencies");
      return;
    }

    const duplicateDependencies = findDuplicateDependencySlugs(
      parsed.data.dependencies,
    );
    if (duplicateDependencies.length > 0) {
      setErrors({
        dependencies: t("validation.duplicateDependencies", {
          slugs: duplicateDependencies.join(", "),
        }),
      });
      focusField("dependencies");
      return;
    }

    setErrors({});

    if (initialProject) {
      const cyclicDependency = parsed.data.dependencies.find((dependencySlug) =>
        wouldCreateDependencyCycle(allProjects, initialProject.slug, dependencySlug),
      );

      if (cyclicDependency) {
        const dependencyProject = allProjects.find(
          (project) => project.slug === cyclicDependency,
        );
        setErrors({
          dependencies: t("validation.cyclicDependency", {
            name: dependencyProject?.name ?? cyclicDependency,
          }),
        });
        focusField("dependencies");
        return;
      }
    }

    if (existingSlugSet.has(parsed.data.slug)) {
      setErrors({ slug: t("validation.duplicateSlug") });
      focusField("slug");
      return;
    }

    setSubmitting(true);
    try {
      const latestProjects = allProjects;
      // Position is computed only on create, or when the user actually changed the
      // category. Edit must not silently fill in a category or position the original lacked.
      const initialPos = initialProject?.position;
      const resolvedCategoryId = preservesMissingCategory
        ? undefined
        : parsed.data.category;
      const categoryChanged =
        initialProject?.category !== resolvedCategoryId;
      // Branch on mode: duplicate is create with an initialProject and needs a fresh slot.
      const position = mode === "edit" && initialProject
        ? categoryChanged && nextCategory
          ? findProjectPlacement(
              nextCategory,
              latestProjects.filter(
                (project) => project.slug !== initialProject.slug,
              ),
            )
          : initialPos
        : nextCategory
          ? findProjectPlacement(nextCategory, latestProjects)
          : undefined;
      const input = formValuesToProjectInput(parsed.data, position);
      await onSubmit(input, { behavior: submitBehavior });
      setSavedValues(parsed.data);
      rhfReset(parsed.data);
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

  /* Create scores only the four fields it asks for; optional fields are scored on edit. */
  const completenessInsight = useMemo(() => {
    if (mode !== "create") return resolveProjectCompletenessInsight(previewProject);
    const required = [
      previewProject.name,
      previewProject.category,
      previewProject.status,
      previewProject.description,
    ];
    const completedCount = required.filter((value) => String(value ?? "").trim().length > 0).length;
    return {
      score: Math.round((completedCount / required.length) * 100),
      completedCount,
      totalCount: required.length,
    };
  }, [mode, previewProject]);
  const freshnessInsight = useMemo(
    () => resolveProjectFreshnessInsight(previewProject),
    [previewProject],
  );
  const editorModeLabel =
    mode === "create"
      ? initialProject
        ? t("actions.modeDuplicate")
        : t("actions.modeCreate")
      : t("actions.modeEdit");
  const dirtyStateLabel = isDirty ? t("actions.dirty") : t("actions.clean");
  const compactDirtyStateLabel = isDirty ? t("actions.compactDirty") : t("actions.compactClean");
  const changePreviewItems = useMemo(() => {
    const items: string[] = [];
    const emptyLabel = t("preview.changeNameEmpty");

    if (values.name !== savedValues.name) {
      items.push(
        t("preview.changeName", {
          from: savedValues.name || emptyLabel,
          to: values.name || emptyLabel,
        }),
      );
    }
    if (values.category !== savedValues.category || values.status !== savedValues.status) {
      const nextCategoryLabel =
        categoryOptions.find((option) => option.value === values.category)?.label ?? values.category;
      const nextStatusLabel =
        statusOptions.find((option) => option.value === values.status)?.label ?? values.status;
      items.push(
        t("preview.changeCategoryStatus", {
          category: nextCategoryLabel,
          status: nextStatusLabel,
        }),
      );
    }
    if (values.description !== savedValues.description) {
      items.push(
        values.description.trim().length > 0
          ? t("preview.changeDescriptionFilled")
          : t("preview.changeDescriptionEmpty"),
      );
    }
    if (values.dependencies.length !== savedValues.dependencies.length) {
      items.push(
        t("preview.changeDependencies", {
          from: savedValues.dependencies.length,
          to: values.dependencies.length,
        }),
      );
    }
    if (values.screenshots.length !== savedValues.screenshots.length) {
      items.push(
        t("preview.changeScreenshots", {
          from: savedValues.screenshots.length,
          to: values.screenshots.length,
        }),
      );
    }
    if (values.detail !== savedValues.detail) {
      items.push(
        (values.detail ?? "").trim().length > 0
          ? t("preview.changeDetailFilled")
          : t("preview.changeDetailEmpty"),
      );
    }

    return items.slice(0, 4);
  }, [categoryOptions, savedValues, statusOptions, t, values]);
  const mobilePreviewSummary = isDirty
    ? t("preview.summaryDirty", { score: completenessInsight.score, count: changePreviewItems.length })
    : t("preview.summaryClean", { score: completenessInsight.score });

  // Create and edit share one set of field fragments; only the arrangement differs.

  const slugField = (
    <FieldRow label={t("fields.slug")} error={errors.slug} fieldId={PROJECT_FIELD_IDS.slug}>
      <Input
        id={PROJECT_FIELD_IDS.slug}
        name="slug"
        data-testid="project-input-slug"
        value={values.slug}
        onChange={(v) => {
          setSlugManuallyEdited(true);
          setValue("slug", v);
        }}
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
            onClick={() => {
              setSlugManuallyEdited(false);
              setValue("slug", slugify(values.name));
            }}
            disabled={values.name.trim().length === 0}
          >
            {t("fields.slugGenerate")}
          </Button>
          {existingSlugSet.has(values.slug) && values.slug.length > 0 && (
            <span
              role="alert"
              className="text-body text-[color:var(--color-status-danger)]"
            >
              {t("fields.slugDuplicate")}
            </span>
          )}
          {initialProject && (
            <span className="text-body text-[color:var(--color-text-quaternary)]">
              {t("fields.duplicateNotice")}
            </span>
          )}
        </div>
      )}
      <Hint>{t("fields.slugHint")}</Hint>
    </FieldRow>
  );

  const nameField = (
    <FieldRow label={t("fields.name")} error={errors.name} fieldId={PROJECT_FIELD_IDS.name}>
      <Input
        id={PROJECT_FIELD_IDS.name}
        name="name"
        data-testid="project-input-name"
        value={values.name}
        onChange={(v) => {
          setValue("name", v);
          syncSlugFromName(v);
        }}
        placeholder={t("fields.namePlaceholder")}
        autoComplete="off"
        aria-invalid={Boolean(errors.name)}
      />
    </FieldRow>
  );

  const nameEnField = (
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

  const categoryStatusFields = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldRow
        label={t("fields.category")}
        error={errors.category}
        errorTestId="project-error-category"
        fieldId={PROJECT_FIELD_IDS.category}
      >
        <Select
          id={PROJECT_FIELD_IDS.category}
          name="category"
          data-testid="project-input-category"
          value={values.category}
          onChange={(v) => setValue("category", v)}
          options={categoryOptions}
          aria-invalid={Boolean(errors.category)}
        />
        {!getCategory(values.category) &&
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
          name="status"
          data-testid="project-input-status"
          value={values.status}
          onChange={(v) => setValue("status", v)}
          options={statusOptions}
          aria-invalid={Boolean(errors.status)}
        />
        {!getStatus(values.status) &&
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

  const descriptionField = (
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

  const detailField = (
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

  const tagsStackFields = (
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

  const linksField = (
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

  const dependenciesField = (
    <FieldRow
      label={t("fields.dependencies")}
      error={errors.dependencies}
      errorTestId="project-error-dependencies"
    >
      <DependencyPicker
        value={values.dependencies}
        onChange={(next) => setValue("dependencies", next)}
        options={allProjects}
        selfSlug={mode === "edit" ? initialProject?.slug : undefined}
        invalidSlugs={invalidDependencySlugs}
        suggestions={dependencySuggestions}
      />
      <Hint>{t("fields.dependenciesHint")}</Hint>
    </FieldRow>
  );

  const operationsFields = (
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

  /*
   * Opens a folder in place: on the web `/` is the gateway, which cannot open one.
   * Degradation grammar: `.claude/rules/surfaces.md`.
   */
  const writeDisabledBanner = writeDisabled ? (
    <div
      role="status"
      data-testid="project-write-disabled-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-4 py-3 text-body-lg text-[color:var(--color-text-secondary)]"
    >
      <span className="min-w-0">
        {t("validation.demoModeBanner")}{" "}
        <span className="text-[color:var(--color-text-quaternary)]">
          {t("validation.demoModeBannerHint")}
        </span>
      </span>
      {openVaultAction ? <span className="shrink-0">{openVaultAction}</span> : null}
    </div>
  ) : null;

  /** A failed save has no field to focus, so focus goes to this banner. */
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!globalError) return;
    const node = errorBannerRef.current;
    if (!node) return;
    // jsdom lacks `scrollIntoView`; focus is what matters.
    node.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    node.focus();
  }, [globalError, reducedMotion]);

  const errorBanner =
    globalError || Object.keys(errors).length > 0 ? (
      <div
        ref={errorBannerRef}
        role="alert"
        tabIndex={-1}
        data-testid="project-error-banner"
        data-failure-detail={globalError?.detail ?? undefined}
        className="rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-3 text-body-lg text-[color:var(--color-status-danger)]"
      >
        <p className="font-[var(--font-weight-signature)]">
          {globalError?.sentence ?? t("validation.globalErrorBanner")}
        </p>
        {Object.keys(errors).length > 0 ? (
          <>
            <ul className="mt-2 space-y-1 text-body">
              {Object.entries(errors).slice(0, 4).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
            {Object.keys(errors).length > 4 ? (
              <p className="mt-2 font-mono text-label uppercase tracking-[var(--tracking-caps-14)]">
                {t("validation.globalErrorMore", { count: Object.keys(errors).length - 4 })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    ) : null;

  const primarySubmitLabel = submitting
    ? t("actions.saving")
    : mode === "create"
      ? t("actions.createAndContinue")
      : t("actions.saveAndContinue");
  const returnSubmitLabel =
    mode === "create" ? t("actions.createAndReturn") : t("actions.saveAndReturn");

  // Actions come after the form so nothing is pressed before the inputs are seen.
  const actionRow = (
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
          submitBehaviorRef.current = "return";
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
          submitBehaviorRef.current = "stay";
        }}
        disabled={submitting || deleting || writeDisabled}
      >
        {primarySubmitLabel}
      </Button>
    </div>
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
                className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
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

      {/* The drop shadow was raised onto the ladder (2026-08-06). This band **really
          floats** (sticky + z-10, passing over the scrolling form), so rather than
          removing the drop, the hand-written `0 18px 36px var(--color-shadow-a22)`
          becomes the ladder's lowest floating step. y stays 18 while the blur goes
          36→40 and the density a22→a35: the more it floats, the darker and wider — so
          the light-source assumption becomes one with the ladder. */}
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
              data-testid="project-save-top"
              type="submit"
              data-submit-behavior="stay"
              onClick={() => {
                submitBehaviorRef.current = "stay";
              }}
              disabled={submitting || deleting || writeDisabled}
              className="order-last col-span-2 justify-center md:order-none md:col-span-1 md:min-w-[88px]"
            >
              {primarySubmitLabel}
            </Button>
            <Button
              data-testid="project-save-return-top"
              type="submit"
              data-submit-behavior="return"
              variant="outline"
              onClick={() => {
                submitBehaviorRef.current = "return";
              }}
              disabled={submitting || deleting || writeDisabled}
              className="justify-center"
            >
              {returnSubmitLabel}
            </Button>
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
          </div>
        </div>
      </div>

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
        onToggle={() =>
          setSectionOpen((current) => ({
            ...current,
            "project-form-story": !current["project-form-story"],
          }))
        }
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
        onToggle={() =>
          setSectionOpen((current) => ({
            ...current,
            "project-form-network": !current["project-form-network"],
          }))
        }
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
        onToggle={() =>
          setSectionOpen((current) => ({
            ...current,
            "project-form-operations": !current["project-form-operations"],
          }))
        }
        helperBadge={t("sections.helperBadgeOptional")}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {operationsFields}
      </FormSection>

      {actionRow}

      {/* Edit-only danger row: the only home for deletion, dashed border as the category signal. */}
      {onDelete && (
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
            onClick={handleDelete}
            disabled={deleting || submitting}
            className="ml-auto shrink-0 border-[color:var(--color-border-soft)] text-[color:var(--color-status-danger)] hover:border-[color:var(--color-danger-a50)]"
          >
            {deleting ? t("actions.deleting") : t("actions.delete")}
          </Button>
        </div>
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

      <aside className="order-none">
        <div className="lg:sticky lg:top-10">
          <button
            type="button"
            data-testid="project-mobile-preview-toggle"
            onClick={() => setMobilePreviewOpen((open) => !open)}
            className={controlClass({ shape: "row", className: "mb-4 justify-between rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4 lg:hidden" })}
          >
            <div>
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                {t("preview.toggleEyebrow")}
              </p>
              <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                {mobilePreviewSummary}
              </p>
            </div>
            <ChevronDown
              size={ICON_SIZE.lg}
              className={cn(
                "shrink-0 text-[color:var(--color-text-quaternary)] transition-transform",
                mobilePreviewOpen && "rotate-180",
              )}
            />
          </button>
          <div className={cn("hidden lg:block", mobilePreviewOpen && "block")}>
            {(mode === "edit" || saveNotice) && (
              <div className="mb-4 rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
                <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                  {t("preview.previewEyebrow")}
                </p>
                {saveNotice ? (
                  <div
                    role="status"
                    className="mt-3 rounded-card border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] px-4 py-3 text-body-lg text-[color:var(--color-indigo-text-soft)]"
                  >
                    {saveNotice}
                  </div>
                ) : null}
                {mode === "edit" ? (
                  <>
                    <p className="mt-3 text-body-lg text-[color:var(--color-text-secondary)]">
                      {t("preview.liveHint")}
                    </p>
                    {!saveNotice && changePreviewItems.length === 0 ? (
                      <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                        {t("preview.noChanges")}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
            <p className="mb-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
              {t("preview.cardEyebrow")}
            </p>
            {/* No frame around the card: the preview matches the map, which has none. */}
            <div className="flex items-start justify-center rounded-panel bg-[color:var(--color-canvas)] py-4">
              <ProjectCard
                project={previewProject}
                category={(() => {
                  const c = getCategory(previewProject.category);
                  return c
                    ? {
                        borderStyle: c.borderStyle,
                        sideLabelText: c.sideLabelText ?? c.labelEn ?? c.label,
                      }
                    : undefined;
                })()}
                statusDotColor={
                  getStatus(previewProject.status)?.dotColor ?? "neutral"
                }
                shared={
                  !previewProject.isHub &&
                  isSharedNode(
                    previewProject.dependencies,
                    computeHubSlugs(allProjects),
                  )
                }
                hubEyebrow={t("preview.cardHubEyebrow")}
                sharedEyebrow={t("preview.cardSharedEyebrow")}
                descriptionEmptyLabel={t("preview.cardDescriptionEmpty")}
                preview
              />
            </div>
            <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
              {t("preview.cardCaption")}
            </p>
            <div className="mt-4 rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                    {t("preview.completenessLabel")}
                  </p>
                  <p className="mt-2 text-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {completenessInsight.score}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                    {t("preview.publicStatusLabel")}
                  </p>
                  <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                    {isDirty ? t("preview.publicStatusDirty") : tFreshness(freshnessInsight.level)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
                {t(mode === "create" ? "preview.completenessFractionCreate" : "preview.completenessFraction", {
                  completed: completenessInsight.completedCount,
                  total: completenessInsight.totalCount,
                })}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The create screen's "add more" section: a hairline, not a box, expanded by the user. */
function CreateExtras({
  open,
  onToggle,
  label,
  caption,
  openLabel,
  closeLabel,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  caption: string;
  openLabel: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[color:var(--color-divider)] pt-5">
      <button
        type="button"
        data-testid="project-create-extras-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="project-create-extras"
        className={controlClass({
          shape: "row",
          stacked: true,
          className: "justify-between gap-3",
        })}
      >
        <span className="min-w-0">
          <span className="block text-body-lg text-[color:var(--color-text-primary)]">{label}</span>
          <span className="mt-1 block text-label text-[color:var(--color-text-quaternary)]">
            {caption}
          </span>
        </span>
        <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-divider)] px-3 text-body text-[color:var(--color-text-secondary)]">
          {open ? closeLabel : openLabel}
          <ChevronDown
            size={ICON_SIZE.md}
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open ? (
        <div
          id="project-create-extras"
          className="mt-5 flex flex-col gap-6 border-t border-[color:var(--color-divider)] pt-5"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** A subgroup inside "add more" — engraved label plus a hairline, no collapse control. */
function ExtrasGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <p className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]">
          {label}
        </p>
        <span aria-hidden className="h-px flex-1 bg-[color:var(--color-divider)]" />
      </div>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  error,
  errorTestId,
  fieldId,
  children,
}: {
  label: string;
  error?: string;
  errorTestId?: string;
  fieldId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]"
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          role="alert"
          data-testid={errorTestId}
          className="text-body text-[color:var(--color-status-danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FormSection({
  id,
  label,
  description,
  isOpen = true,
  onToggle,
  collapsible = true,
  helperBadge,
  collapseLabel,
  expandLabel,
  children,
}: {
  id: string;
  label: string;
  description: string;
  isOpen?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  helperBadge?: string;
  collapseLabel?: string;
  expandLabel?: string;
  children: React.ReactNode;
}) {
  const contentId = `${id}-content`;
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2)] md:px-5"
    >
      <div className="mb-5">
        {/* engraved section label — mono uppercase caption + hairline
            continuation (docs/prototypes/project-forms-final.html `.slabel`) */}
        <div className="mb-3 flex items-center gap-2.5">
          <p
            id={headingId}
            className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]"
          >
            {label}
          </p>
          <span aria-hidden className="h-px flex-1 bg-[color:var(--color-divider)]" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-body-lg text-[color:var(--color-text-secondary)]">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {helperBadge ? (
              <span className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {helperBadge}
              </span>
            ) : null}
            {collapsible ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls={contentId}
                className={controlClass({
                  shape: "pill",
                  size: "lg",
                  tone: "secondary",
                  className:
                    "gap-2 hover:border-[color:var(--color-indigo-a34)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
                })}
              >
                {isOpen ? (collapseLabel ?? "Collapse") : (expandLabel ?? "Expand")}
                <ChevronDown
                  size={ICON_SIZE.md}
                  aria-hidden="true"
                  className={cn("transition-transform", isOpen && "rotate-180")}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {isOpen ? (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          className="flex flex-col gap-6"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label text-[color:var(--color-text-quaternary)]">
      {children}
    </p>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  disabled,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  disabled?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "disabled"
>) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={fieldClass({
        size: "lg",
        className: cn("hover:border-[color:var(--color-border-strong)]", mono && "font-mono"),
      })}
      {...props}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows,
  mono,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows: number;
  mono?: boolean;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
>) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={fieldClass({
        multiline: true,
        size: "lg",
        className: cn("hover:border-[color:var(--color-border-strong)]", mono && "font-mono"),
      })}
      {...props}
    />
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  ...props
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={fieldClass({
        size: "lg",
        className: "hover:border-[color:var(--color-border-strong)]",
      })}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
