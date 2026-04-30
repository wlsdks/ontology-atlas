import type {
  KnowledgeVersion,
  KnowledgeVersionMarkdownDiff,
  KnowledgeVersionMetadataDiff,
  KnowledgeVersionRecordInput,
} from "./types";

function computeStableHash(markdown: string) {
  let hash = 2166136261;
  for (let index = 0; index < markdown.length; index += 1) {
    hash ^= markdown.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `kv-${(hash >>> 0).toString(16)}`;
}

function stringifyProjectIds(projectIds: string[]) {
  return [...new Set(projectIds.map((projectId) => projectId.trim()).filter(Boolean))].join(
    ", ",
  );
}

export function createKnowledgeVersionRecord(
  input: KnowledgeVersionRecordInput,
): Omit<KnowledgeVersion, "createdAt"> {
  return {
    id: input.id,
    documentId: input.documentId,
    title: input.metadata.title,
    kind: input.metadata.kind,
    projectIds: input.metadata.projectIds,
    frontmatter: input.frontmatter,
    storagePath: input.storagePath,
    mimeType: "text/markdown",
    sizeBytes: new TextEncoder().encode(input.markdown).length,
    hash: computeStableHash(input.markdown),
    createdBy: input.createdBy,
  };
}

export function buildKnowledgeVersionMetadataDiff(params: {
  currentVersion: KnowledgeVersion;
  selectedVersion: KnowledgeVersion;
}): KnowledgeVersionMetadataDiff[] {
  const fields: Array<KnowledgeVersionMetadataDiff["field"]> = [
    "title",
    "kind",
    "projectIds",
  ];

  return fields.map((field) => {
    const currentValue =
      field === "projectIds"
        ? stringifyProjectIds(params.currentVersion.projectIds)
        : String(params.currentVersion[field] ?? "");
    const selectedValue =
      field === "projectIds"
        ? stringifyProjectIds(params.selectedVersion.projectIds)
        : String(params.selectedVersion[field] ?? "");

    return {
      field,
      currentValue,
      selectedValue,
      changed: currentValue !== selectedValue,
    };
  });
}

export function buildKnowledgeVersionMarkdownDiff(params: {
  currentVersion: Pick<KnowledgeVersion, "hash">;
  selectedVersion: Pick<KnowledgeVersion, "hash">;
  currentMarkdown: string;
  selectedMarkdown: string;
}): KnowledgeVersionMarkdownDiff {
  const currentLineCount = params.currentMarkdown.split(/\r?\n/).length;
  const selectedLineCount = params.selectedMarkdown.split(/\r?\n/).length;

  return {
    hasChanges: params.currentVersion.hash !== params.selectedVersion.hash,
    currentLineCount,
    selectedLineCount,
    currentCharCount: params.currentMarkdown.length,
    selectedCharCount: params.selectedMarkdown.length,
  };
}
