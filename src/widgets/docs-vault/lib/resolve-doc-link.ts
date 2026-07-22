/**
 * 문서 뷰어 마크다운 링크 리졸버 — 순수 함수로 추출해 단위 테스트 가능하게.
 *
 * `/docs` 뷰어의 `a` 컴포넌트가 상대 `.md` 링크를 어떻게 처리할지 결정한다.
 * 핵심 회귀: vault(예: `docs/`) **바깥**을 가리키는 상대 경로
 * (`../mcp/README.md` 처럼 `..` 로 vault root 를 벗어나는 링크) 를 그대로
 * `<a href>` 로 렌더하면, 브라우저가 이를 현재 라우트(`/ko/docs/`) 기준
 * 상대 URL(`/ko/mcp/README.md`) 로 해석해 앱 404 로 빠진다. MCP 등록 관문
 * 문서(`mcp/README.md`) 링크가 죽어 있던 원인.
 *
 * 결정 규칙:
 *   - 절대 URL(http(s)://…) · 앵커(`#…`) · 비-md 경로 → passthrough (기존 처리 유지)
 *   - vault 내부 상대 경로 & 알려진 slug → internal (앱 라우팅)
 *   - vault root 를 벗어나거나, 내부지만 알려지지 않은 slug →
 *       · repoBlobBase 가 주어지면 external (GitHub blob, 새 탭)
 *       · 없으면(로컬 vault 등 repo 위치 불명) unresolved — 죽은 404 대신
 *         비-라우팅 렌더로 처리
 */

export type ResolvedDocLink =
  | { kind: 'internal'; slug: string; anchor?: string }
  | { kind: 'external'; url: string }
  | { kind: 'unresolved' }
  | { kind: 'passthrough' };

export interface ResolveDocLinkParams {
  /** 마크다운 링크의 raw href. */
  href: string;
  /** 이 링크가 들어있는 문서의 vault slug (예: `README`, `ontology/project`). */
  fromSlug: string;
  /** vault 에 존재하는 모든 slug 집합 (내부/외부 판별용). */
  vaultSlugs: Set<string>;
  /**
   * vault 외부 상대 경로를 GitHub blob URL 로 바꿀 때 쓰는 base
   * (예: `https://github.com/wlsdks/ontology-atlas/blob/main`).
   * 로컬 vault 처럼 repo 위치를 모르면 undefined — 그때는 unresolved.
   */
  repoBlobBase?: string;
  /**
   * 이 vault 가 repo 안에서 위치한 경로 (예: 번들 docs vault = `docs`).
   * repoBlobBase 와 함께 있어야 external URL 을 만든다.
   */
  vaultRepoRoot?: string;
}

/** posix 경로 정규화 — `.`·빈 세그먼트 제거, `..` 는 가능하면 상위 pop. */
function collapsePath(pathStr: string): string {
  const out: string[] = [];
  for (const seg of pathStr.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

export function resolveDocLink({
  href,
  fromSlug,
  vaultSlugs,
  repoBlobBase,
  vaultRepoRoot,
}: ResolveDocLinkParams): ResolvedDocLink {
  // 절대 URL · 프로토콜 · 앵커 only 는 리졸버 대상 아님.
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return { kind: 'passthrough' };
  }
  const [target, anchorRaw] = href.split('#');
  const anchor = anchorRaw || undefined;
  if (!target || !target.endsWith('.md')) {
    return { kind: 'passthrough' };
  }

  const fromDir = fromSlug.includes('/')
    ? fromSlug.slice(0, fromSlug.lastIndexOf('/'))
    : '';
  const rel = target.replace(/^\.\//, '');
  const joined = fromDir ? `${fromDir}/${rel}` : rel;

  // vault root 를 벗어났는지 판별하면서 정규화. `..` 가 빈 스택을 만나면 escape.
  const stack: string[] = [];
  let escaped = false;
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0 || stack[stack.length - 1] === '..') {
        escaped = true;
        stack.push('..');
      } else {
        stack.pop();
      }
      continue;
    }
    stack.push(seg);
  }

  if (!escaped) {
    const slug = stack.join('/').replace(/\.md$/, '');
    if (vaultSlugs.has(slug)) {
      return { kind: 'internal', slug, anchor };
    }
  }

  // 여기까지 왔으면 vault 외부(escape) 또는 내부지만 알 수 없는 slug.
  // repo 위치를 알면 GitHub blob 외부 링크로, 모르면 unresolved.
  if (repoBlobBase && vaultRepoRoot !== undefined) {
    const repoRel = collapsePath(`${vaultRepoRoot}/${joined}`);
    const base = repoBlobBase.replace(/\/+$/, '');
    const url = `${base}/${repoRel}${anchor ? `#${anchor}` : ''}`;
    return { kind: 'external', url };
  }
  return { kind: 'unresolved' };
}

/** 번들 docs vault(`docs/**`) 가 소속된 공개 repo 의 blob base 와 vault root. */
export const ONTOLOGY_ATLAS_REPO_BLOB_BASE =
  'https://github.com/wlsdks/ontology-atlas/blob/main';
export const DOCS_VAULT_REPO_ROOT = 'docs';

/** repo 루트 기준 경로를 GitHub blob URL 로. 캐노니컬 바로가기(mcp/README 등) 재사용. */
export function githubBlobUrl(
  repoRelativePath: string,
  base: string = ONTOLOGY_ATLAS_REPO_BLOB_BASE,
): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = repoRelativePath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}
