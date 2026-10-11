import type { useTranslations } from "next-intl";

import type { Category } from "@/entities/category";
import {
  findDuplicateDependencySlugs,
  findMissingDependencySlugs,
  wouldCreateDependencyCycle,
  type Project,
} from "@/entities/project";
import {
  projectFormSchema,
  PRESERVE_MISSING_TAXONOMY_VALUE,
  type ProjectFormValues,
} from "./schema";
import { findProjectPlacement } from "./placement";

type Translate = ReturnType<typeof useTranslations>;
type FieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

// schema.ts cannot use hooks, so it returns `validation.<key>` i18n keys translated here.
function resolveValidationMessage(t: Translate, message: string): string {
  if (message.startsWith("validation.linkLine:")) {
    const [, index, code] = message.split(":");
    return t(`validation.linkLine.${code}`, { index });
  }
  if (message.startsWith("validation.")) {
    return t(message);
  }
  return message;
}

export type ProjectSubmissionCheck =
  | { ok: false; errors: FieldErrors; focus?: keyof ProjectFormValues }
  | { ok: true; data: ProjectFormValues; category: Category | undefined };

export function checkProjectSubmission({
  values,
  mode,
  initialProject,
  allProjects,
  existingSlugSet,
  slugManuallyEdited,
  getCategory,
  getStatus,
  t,
}: {
  values: ProjectFormValues;
  mode: "create" | "edit";
  initialProject?: Project;
  allProjects: Project[];
  existingSlugSet: Set<string>;
  slugManuallyEdited: boolean;
  getCategory: (id: string | undefined) => Category | undefined;
  getStatus: (id: string | undefined) => unknown;
  t: Translate;
}): ProjectSubmissionCheck {
  const parsed = projectFormSchema.safeParse(values);
  if (!parsed.success) {
    const map: FieldErrors = {};
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
    const firstField = map.name ? "name" : Object.keys(map)[0] as keyof ProjectFormValues | undefined;
    return { ok: false, errors: map, focus: firstField };
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
    return {
      ok: false,
      errors: nextErrors,
      focus: !preservesMissingCategory && !nextCategory ? "category" : "status",
    };
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
    return {
      ok: false,
      errors: {
        dependencies: t("validation.missingDependencies", {
          slugs: missingDependencies.join(", "),
        }),
      },
      focus: "dependencies",
    };
  }

  const duplicateDependencies = findDuplicateDependencySlugs(
    parsed.data.dependencies,
  );
  if (duplicateDependencies.length > 0) {
    return {
      ok: false,
      errors: {
        dependencies: t("validation.duplicateDependencies", {
          slugs: duplicateDependencies.join(", "),
        }),
      },
      focus: "dependencies",
    };
  }

  if (initialProject) {
    const cyclicDependency = parsed.data.dependencies.find((dependencySlug) =>
      wouldCreateDependencyCycle(allProjects, initialProject.slug, dependencySlug),
    );

    if (cyclicDependency) {
      const dependencyProject = allProjects.find(
        (project) => project.slug === cyclicDependency,
      );
      return {
        ok: false,
        errors: {
          dependencies: t("validation.cyclicDependency", {
            name: dependencyProject?.name ?? cyclicDependency,
          }),
        },
        focus: "dependencies",
      };
    }
  }

  if (existingSlugSet.has(parsed.data.slug)) {
    return {
      ok: false,
      errors: { slug: t("validation.duplicateSlug") },
      focus: "slug",
    };
  }

  return { ok: true, data: parsed.data, category: nextCategory };
}

export function projectPlacement({
  mode,
  initialProject,
  allProjects,
  category,
}: {
  mode: "create" | "edit";
  initialProject?: Project;
  allProjects: Project[];
  category: Category | undefined;
}) {
  // Position is computed only on create, or when the user actually changed the
  // category. Edit must not silently fill in a category or position the original lacked.
  const initialPos = initialProject?.position;
  const categoryChanged = initialProject?.category !== category?.id;
  // Branch on mode: duplicate is create with an initialProject and needs a fresh slot.
  return mode === "edit" && initialProject
    ? categoryChanged && category
      ? findProjectPlacement(
          category,
          allProjects.filter(
            (project) => project.slug !== initialProject.slug,
          ),
        )
      : initialPos
    : category
      ? findProjectPlacement(category, allProjects)
      : undefined;
}
