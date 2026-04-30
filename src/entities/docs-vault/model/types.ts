// docs-vault 매니페스트 스키마. scripts/build-docs-vault.mjs 가 빌드타임에
// 생성한 JSON 과 정확히 같은 shape. 런타임에서는 import 만으로 접근 가능.

export type VaultMode = 'planner' | 'engineer' | 'both';

export interface VaultHeading {
  depth: number;
  text: string;
  slug: string;
}

export interface VaultDoc {
  slug: string;
  path: string;
  title: string;
  description?: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  headings: VaultHeading[];
  excerpt: string;
  wordCount: number;
  updatedAt: string;
  mode: VaultMode;
  linksOut: string[];
}

export interface VaultTreeNode {
  name: string;
  path: string;
  type: 'dir' | 'doc';
  slug?: string;
  title?: string;
  children?: VaultTreeNode[];
}

export interface VaultBacklinkEntry {
  fromSlug: string;
  /** 링크 앞뒤 120자 context. 링크 텍스트는 **[이렇게]** 굵게 표시돼 있다. */
  context: string;
  linkText: string;
}

export interface VaultManifest {
  version: string;
  generatedAt: string;
  docs: VaultDoc[];
  backlinksDetail: Record<string, VaultBacklinkEntry[]>;
  tags: Record<string, string[]>;
  tree: VaultTreeNode;
}
