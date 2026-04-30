export type KnowledgeDocumentSourceType = "upload" | "manual" | "import";

export type KnowledgeDocumentStatus =
  | "draft"
  | "ready"
  | "processing"
  | "reviewing"
  | "published"
  | "error";

export interface KnowledgeDocumentFrontmatter {
  title?: string;
  kind?: string;
  projectIds?: string[];
  domain?: string;
  capabilities?: string[];
  elements?: string[];
  relates?: string[];
  [key: string]: unknown;
}

export interface KnowledgeDocumentMetadataInput {
  title: string;
  kind: string;
  projectIds: string[];
}

export interface KnowledgeDocumentCanonicalMetadata
  extends KnowledgeDocumentMetadataInput {
  source: "frontmatter" | "ui";
}

export interface KnowledgeDocumentMetadataPreviewRow {
  field: "title" | "kind" | "projectIds";
  uiValue: string;
  frontmatterValue: string;
  canonicalValue: string;
  isConflict: boolean;
}

export interface KnowledgeDocument {
  id: string;
  accountId?: string;
  title: string;
  kind: string;
  projectIds: string[];
  sourceType: KnowledgeDocumentSourceType;
  currentVersionId: string;
  formatScore?: number;
  status: KnowledgeDocumentStatus;
  latestJobStatus?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface KnowledgeDocumentCreateInput
  extends KnowledgeDocumentMetadataInput {
  accountId?: string | null;
  sourceType: KnowledgeDocumentSourceType;
  rawMarkdown: string;
  createdBy: string;
}
