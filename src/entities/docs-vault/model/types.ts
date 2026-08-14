// docs-vault 매니페스트 스키마. scripts/build-docs-vault.mjs 가 빌드타임에
// 생성한 JSON 과 정확히 같은 shape. 런타임에서는 import 만으로 접근 가능.

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
  /** Parser diagnostics are retained so health cannot hide malformed metadata. */
  diagnostics?: Array<{
    code: string;
    line: number;
    message: string;
  }>;
  headings: VaultHeading[];
  excerpt: string;
  /**
   * Exact source paths parsed from the persisted project competency block.
   * Derived at load time; never written back to vault Markdown.
   */
  meaningEvidencePaths?: string[];
  wordCount: number;
  updatedAt: string;
  linksOut: string[];
  /**
   * R11 #15 — local 모드의 conflict 감지에 사용. file.lastModified (ms).
   * static 모드는 빌드 시점 산출물이라 undefined. caller (saveDoc) 가
   * 옵션 expectedMtime 으로 그대로 전달해 외부 변경 감지.
   */
  mtime?: number;
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
  /**
   * 순회가 상한에 걸려 **일부만 봤는가.** 침묵하는 절단은 "전부 봤다" 로
   * 읽히므로 매니페스트가 이 사실을 들고 다닌다 — 화면이 "문서 N개" 라고
   * 말할 때 그 N 이 전부인지 아닌지를 같은 자리에서 알 수 있어야 한다.
   * 빌드타임 매니페스트에는 없는 개념이라 optional.
   */
  walkTruncated?: boolean;
  /** 캐시/의존성으로 판정해 통째로 건너뛴 디렉터리 — 왜 빠졌는지의 근거. */
  prunedDirs?: string[];
  docs: VaultDoc[];
  backlinksDetail: Record<string, VaultBacklinkEntry[]>;
  tags: Record<string, string[]>;
  tree: VaultTreeNode;
}
