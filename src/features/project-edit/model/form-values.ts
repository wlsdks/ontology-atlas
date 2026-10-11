import type { Project } from "@/entities/project";
import {
  duplicateProjectToFormValues,
  projectToFormValues,
  PRESERVE_MISSING_TAXONOMY_VALUE,
  type ProjectFormValues,
} from "./schema";

export function buildInitialValues({
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

/** Keeps a preserved-missing or unknown taxonomy value selectable in front of the known options. */
export function withKeptTaxonomyOption(
  options: { value: string; label: string }[],
  value: string,
  known: boolean,
  unspecifiedLabel: string,
  missingLabel: string,
): { value: string; label: string }[] {
  if (value === PRESERVE_MISSING_TAXONOMY_VALUE) return [{ value, label: unspecifiedLabel }, ...options];
  if (value && !known) return [{ value, label: missingLabel }, ...options];
  return options;
}

export function previewProjectFromValues(
  values: ProjectFormValues,
  initialProject: Project | undefined,
): Project {
  return {
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
  };
}

/* Create scores only the four fields it asks for; optional fields are scored on edit. */
export function createCompleteness(project: Project) {
  const required = [
    project.name,
    project.category,
    project.status,
    project.description,
  ];
  const completedCount = required.filter((value) => String(value ?? "").trim().length > 0).length;
  return {
    score: Math.round((completedCount / required.length) * 100),
    completedCount,
    totalCount: required.length,
  };
}
