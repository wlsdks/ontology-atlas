import type {
  KnowledgeDocumentFrontmatter,
  KnowledgeDocumentMetadataInput,
  KnowledgeDocumentMetadataPreviewRow,
} from "./types";

export interface ParsedKnowledgeFrontmatter {
  frontmatter: KnowledgeDocumentFrontmatter;
  body: string;
  hasFrontmatter: boolean;
}

function normalizeValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function parseKnowledgeFrontmatter(
  markdown: string,
): ParsedKnowledgeFrontmatter {
  if (!markdown.startsWith("---")) {
    return {
      frontmatter: {},
      body: markdown,
      hasFrontmatter: false,
    };
  }

  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return {
      frontmatter: {},
      body: markdown,
      hasFrontmatter: false,
    };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) {
    return {
      frontmatter: {},
      body: markdown,
      hasFrontmatter: false,
    };
  }

  const rawLines = lines.slice(1, endIndex);
  const frontmatter: KnowledgeDocumentFrontmatter = {};
  let currentListKey: string | null = null;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("- ") && currentListKey) {
      const nextValue = normalizeValue(trimmed.slice(2));
      const current = frontmatter[currentListKey];
      if (Array.isArray(current)) {
        current.push(nextValue);
      } else {
        frontmatter[currentListKey] = [nextValue];
      }
      continue;
    }

    currentListKey = null;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key) continue;

    if (!rawValue) {
      currentListKey = key;
      frontmatter[key] = [];
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => normalizeValue(item))
        .filter(Boolean);
      continue;
    }

    frontmatter[key] = normalizeValue(rawValue);
  }

  return {
    frontmatter,
    body: lines.slice(endIndex + 1).join("\n"),
    hasFrontmatter: true,
  };
}

function normalizeProjectIds(projectIds: string[]): string[] {
  return [...new Set(projectIds.map((projectId) => projectId.trim()).filter(Boolean))];
}

export function resolveKnowledgeCanonicalMetadata(
  uiInput: KnowledgeDocumentMetadataInput,
  frontmatter: KnowledgeDocumentFrontmatter,
) {
  const title = typeof frontmatter.title === "string" && frontmatter.title.trim()
    ? frontmatter.title.trim()
    : uiInput.title.trim();
  const kind = typeof frontmatter.kind === "string" && frontmatter.kind.trim()
    ? frontmatter.kind.trim()
    : uiInput.kind.trim();
  const frontmatterProjectIds = Array.isArray(frontmatter.projectIds)
    ? normalizeProjectIds(frontmatter.projectIds.filter((item): item is string => typeof item === "string"))
    : [];
  const projectIds = frontmatterProjectIds.length > 0
    ? frontmatterProjectIds
    : normalizeProjectIds(uiInput.projectIds);

  return {
    title,
    kind,
    projectIds,
    source:
      typeof frontmatter.title === "string" ||
      typeof frontmatter.kind === "string" ||
      frontmatterProjectIds.length > 0
        ? "frontmatter"
        : "ui",
  } as const;
}

function stringifyProjectIds(projectIds: string[]) {
  return normalizeProjectIds(projectIds).join(", ");
}

export function buildKnowledgeMetadataPreview(
  uiInput: KnowledgeDocumentMetadataInput,
  frontmatter: KnowledgeDocumentFrontmatter,
): KnowledgeDocumentMetadataPreviewRow[] {
  const canonical = resolveKnowledgeCanonicalMetadata(uiInput, frontmatter);
  const normalizedUiProjects = normalizeProjectIds(uiInput.projectIds);
  const normalizedFrontmatterProjects = Array.isArray(frontmatter.projectIds)
    ? normalizeProjectIds(frontmatter.projectIds.filter((item): item is string => typeof item === "string"))
    : [];

  return [
    {
      field: "title",
      uiValue: uiInput.title.trim(),
      frontmatterValue:
        typeof frontmatter.title === "string" ? frontmatter.title.trim() : "",
      canonicalValue: canonical.title,
      isConflict:
        Boolean(uiInput.title.trim()) &&
        typeof frontmatter.title === "string" &&
        uiInput.title.trim() !== frontmatter.title.trim(),
    },
    {
      field: "kind",
      uiValue: uiInput.kind.trim(),
      frontmatterValue:
        typeof frontmatter.kind === "string" ? frontmatter.kind.trim() : "",
      canonicalValue: canonical.kind,
      isConflict:
        Boolean(uiInput.kind.trim()) &&
        typeof frontmatter.kind === "string" &&
        uiInput.kind.trim() !== frontmatter.kind.trim(),
    },
    {
      field: "projectIds",
      uiValue: stringifyProjectIds(normalizedUiProjects),
      frontmatterValue: stringifyProjectIds(normalizedFrontmatterProjects),
      canonicalValue: stringifyProjectIds(canonical.projectIds),
      isConflict:
        normalizedUiProjects.length > 0 &&
        normalizedFrontmatterProjects.length > 0 &&
        stringifyProjectIds(normalizedUiProjects) !==
          stringifyProjectIds(normalizedFrontmatterProjects),
    },
  ];
}

export function resolveKnowledgeFormatScore(
  frontmatter: KnowledgeDocumentFrontmatter,
) {
  let score = 0;
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) score += 35;
  if (typeof frontmatter.kind === "string" && frontmatter.kind.trim()) score += 30;
  if (Array.isArray(frontmatter.projectIds) && frontmatter.projectIds.length > 0) {
    score += 35;
  }
  if (typeof frontmatter.domain === "string" && frontmatter.domain.trim()) score += 10;
  if (Array.isArray(frontmatter.capabilities) && frontmatter.capabilities.length > 0) {
    score += 10;
  }
  if (Array.isArray(frontmatter.elements) && frontmatter.elements.length > 0) {
    score += 10;
  }
  if (Array.isArray(frontmatter.relates) && frontmatter.relates.length > 0) {
    score += 5;
  }
  return Math.min(score, 100);
}
