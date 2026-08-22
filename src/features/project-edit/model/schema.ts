import { z } from "zod";
import type { Project, ProjectInput } from "@/entities/project";

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function parseDateOnly(value?: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateInputValue(date?: Date) {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Link parsing failure codes — a stable code is returned rather than English prose. The
// user-facing text is translated by `resolveValidationMessage()` in ProjectForm through
// the `validation.linkLine.<code>` i18n key (the zod model layer has no access to the
// `useTranslations` hook).
type LinkLineErrorCode = "format" | "protocol" | "invalidUrl";

function parseLinkLine(line: string) {
  const [labelPart, urlPart, ...rest] = line.split("|");
  const label = labelPart?.trim() ?? "";
  const url = urlPart?.trim() ?? "";

  if (rest.length > 0 || !label || !url) {
    return {
      ok: false as const,
      code: "format" as LinkLineErrorCode,
    };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false as const,
        code: "protocol" as LinkLineErrorCode,
      };
    }
  } catch {
    return {
      ok: false as const,
      code: "invalidUrl" as LinkLineErrorCode,
    };
  }

  return {
    ok: true as const,
    value: { label, url },
  };
}

export function parseLinksText(
  text?: string,
): Array<{ label: string; url: string }> {
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseLinkLine(line))
    .filter(
      (
        parsed,
      ): parsed is { ok: true; value: { label: string; url: string } } =>
        parsed.ok,
    )
    .map((parsed) => parsed.value);
}

// zod's min/regex messages are literally the `validation.<key>` i18n keys, resolved in the
// `settings.projectForm` namespace — the model layer has no access to `useTranslations`, so
// it carries only the code and ProjectForm translates with `t(issue.message)`.
export const projectFormSchema = z
  .object({
    slug: z
      .string()
      .min(1, "validation.slugRequired")
      .regex(/^[\p{L}\p{N}-]+$/u, "validation.slugFormat"),
    name: z.string().min(1, "validation.nameRequired"),
    nameEn: z.string().optional(),
    // Category and status are dynamic and may extend to a vault-frontmatter-based taxonomy,
    // so they stay free strings. The caller (ProjectForm) validates existence against the taxonomy.
    category: z.string().min(1, "validation.categoryRequired"),
    status: z.string().min(1, "validation.statusRequired"),
    description: z.string().min(1, "validation.descriptionRequired"),
    detail: z.string().optional(),
    tagsCsv: z.string().optional(),
    stackCsv: z.string().optional(),
    linksText: z.string().optional(),
    dependencies: z.array(z.string()).default([]),
    screenshots: z.array(z.string()).default([]),
    owner: z.string().optional(),
    icon: z.string().optional(),
    startedAt: z.string().optional(),
    launchedAt: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    isHub: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.linksText) {
      for (const [index, rawLine] of values.linksText.split("\n").entries()) {
        const line = rawLine.trim();
        if (!line) continue;

        const parsed = parseLinkLine(line);
        if (!parsed.ok) {
          // "validation.linkLine:<1-based index>:<code>" — ProjectForm parses this and
          // translates with `t("validation.linkLine.<code>", { index })`.
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["linksText"],
            message: `validation.linkLine:${index + 1}:${parsed.code}`,
          });
          return;
        }
      }
    }

    if (values.startedAt && !isValidDateOnly(values.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startedAt"],
        message: "validation.invalidStartDate",
      });
    }

    if (values.launchedAt && !isValidDateOnly(values.launchedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["launchedAt"],
        message: "validation.invalidLaunchDate",
      });
    }

    if (
      values.startedAt &&
      values.launchedAt &&
      isValidDateOnly(values.startedAt) &&
      isValidDateOnly(values.launchedAt) &&
      parseDateOnly(values.launchedAt)!.getTime() <
        parseDateOnly(values.startedAt)!.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["launchedAt"],
        message: "validation.launchBeforeStart",
      });
    }
  });

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

/**
 * A form-only value that stops a full edit from inventing a taxonomy fact the existing
 * project lacked. It must be turned back into `undefined` before reaching the serializer.
 */
export const PRESERVE_MISSING_TAXONOMY_VALUE =
  "__ontology_atlas_preserve_missing__";

function nextDuplicateSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
): string {
  let attempt = `${baseSlug}-copy`;
  let index = 2;
  while (existingSlugs.has(attempt)) {
    attempt = `${baseSlug}-copy-${index}`;
    index += 1;
  }
  return attempt;
}

export function projectToFormValues(project: Project): ProjectFormValues {
  return {
    slug: project.slug,
    name: project.name,
    nameEn: project.nameEn ?? "",
    category: project.category ?? PRESERVE_MISSING_TAXONOMY_VALUE,
    status: project.status ?? PRESERVE_MISSING_TAXONOMY_VALUE,
    description: project.description,
    detail: project.detail ?? "",
    tagsCsv: project.tags.join(", "),
    stackCsv: project.stack.join(", "),
    linksText: project.links.map((l) => `${l.label}|${l.url}`).join("\n"),
    dependencies: [...project.dependencies],
    screenshots: [...project.screenshots],
    owner: project.owner ?? "",
    icon: project.icon ?? "",
    startedAt: toDateInputValue(project.timeline?.startedAt),
    launchedAt: toDateInputValue(project.timeline?.launchedAt),
    progress: project.progress,
    isHub: project.isHub ?? false,
  };
}

export function duplicateProjectToFormValues(
  project: Project,
  existingSlugs: Iterable<string>,
): ProjectFormValues {
  return {
    ...projectToFormValues(project),
    slug: nextDuplicateSlug(project.slug, new Set(existingSlugs)),
  };
}

/**
 * Converts form values into a `ProjectInput` — `position` must be injected by the caller.
 */
export function formValuesToProjectInput(
  values: ProjectFormValues,
  position?: { x: number; y: number },
): ProjectInput {
  const splitCsv = (s?: string): string[] =>
    s
      ? s
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

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
    tags: splitCsv(values.tagsCsv),
    stack: splitCsv(values.stackCsv),
    links: parseLinksText(values.linksText),
    dependencies: values.dependencies,
    screenshots: values.screenshots,
    owner: values.owner || undefined,
    icon: values.icon || undefined,
    timeline: {
      startedAt: parseDateOnly(values.startedAt),
      launchedAt: parseDateOnly(values.launchedAt),
    },
    progress: values.progress,
    isHub: values.isHub,
    position,
  };
}
