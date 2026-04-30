import type {
  KnowledgeDocumentCanonicalMetadata,
  KnowledgeDocumentFrontmatter,
} from "@/entities/knowledge-document";

export interface KnowledgeVersion {
  id: string;
  accountId?: string;
  documentId: string;
  title: string;
  kind: string;
  projectIds: string[];
  frontmatter: KnowledgeDocumentFrontmatter;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  createdAt: Date;
  createdBy: string;
}

export interface KnowledgeVersionRecordInput {
  id: string;
  documentId: string;
  metadata: KnowledgeDocumentCanonicalMetadata;
  frontmatter: KnowledgeDocumentFrontmatter;
  storagePath: string;
  markdown: string;
  createdBy: string;
}

export interface KnowledgeVersionMetadataDiff {
  field: "title" | "kind" | "projectIds";
  currentValue: string;
  selectedValue: string;
  changed: boolean;
}

export interface KnowledgeVersionMarkdownDiff {
  hasChanges: boolean;
  currentLineCount: number;
  selectedLineCount: number;
  currentCharCount: number;
  selectedCharCount: number;
}
