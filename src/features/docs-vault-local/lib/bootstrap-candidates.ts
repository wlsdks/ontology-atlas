/**
 * "내 문서에서 온톨로지 시작하기" — 이미 스캔한 vault 매니페스트에서
 * 결정론적으로 온톨로지 후보를 파생한다 (AI 없음, 전송 없음, 부수효과 없음).
 *
 * PO 근거 (.qa-scratch/ontology-onboarding-2026-07/discovery.md): 스타터
 * 시드는 빈 폴더에서만 발동해, 기존 .md 를 가진 타겟 사용자(테크리드)는
 * "0 개념" 막다른 골목에 떨어진다 (F1~F6). 이 모듈은 그 순간(md ≥ 1 &&
 * 온톨로지 노드 0)에 사용자의 문서로 첫 그래프 후보를 만든다 — CLI
 * `bootstrap` / MCP `analyze_repo_structure` 의 브라우저 등가.
 *
 * 후보 규칙 (단순화가 의도 — kind 3종, 관계는 containment 만):
 * - 루트 README → project 제목 소스 (파일 자체는 손대지 않는다 — GitHub
 *   렌더링에 frontmatter 표가 노출되는 것을 피한다)
 * - 1뎁스 폴더 → domain 후보 (md 를 1개 이상 담은 폴더만)
 * - 그 외 모든 .md → element 후보, `domain:` = 자기 최상위 폴더
 * - 루트 레벨 .md (README 제외) → domain 없는 element. project.md 의
 *   `elements:` 배열이 직접 연결한다 (derive-ontology 의 elements[] 규칙)
 *
 * 그래프 연결 계약 (derive-ontology-from-vault.ts 와 정합):
 * - element 의 `domain: <이름>` → `domain:slugifyName(이름)` 스텁 노드 +
 *   domain→element contains 엣지
 * - project 의 `domains: [<이름>...]` → 같은 id 로 resolve → project→domain
 * - 두 경로의 slug 가 일치해야 그래프가 이어진다 — 같은 원문 이름을 쓴다.
 */

import { slugifyName } from '@/entities/docs-vault';

export interface BootstrapDocInput {
  slug: string;
  title: string;
  /** frontmatter — 이미 `kind:` 를 가진 문서는 후보에서 제외하기 위해. */
  frontmatter: Record<string, unknown>;
}

export interface BootstrapElementCandidate {
  slug: string;
  title: string;
  /** 최상위 폴더 이름 — 루트 문서는 null (project.md 가 직접 연결). */
  domain: string | null;
}

export interface BootstrapDomainCandidate {
  name: string;
  docCount: number;
}

export interface BootstrapPlan {
  projectTitle: string;
  /** 생성할 project 문서의 slug — 기존 파일과 충돌하면 대체 slug. */
  projectSlug: string;
  /**
   * 재검 마찰 A — vault 에 이미 `kind: project` 문서가 있으면 그 slug.
   * 이때 새 project 파일을 만들지 않고(이중 프로젝트 방지) 기존 문서의
   * `domains:` 에 승인 도메인을 덧붙인다.
   */
  existingProjectSlug: string | null;
  domains: BootstrapDomainCandidate[];
  elements: BootstrapElementCandidate[];
  /** 이미 kind: 를 가진 문서 수 — "부분 구축" vault 안내용. */
  alreadyTypedCount: number;
}

function hasOwnKind(fm: Record<string, unknown>): boolean {
  return typeof fm.kind === 'string' && fm.kind.trim() !== '';
}

function isRootReadme(slug: string): boolean {
  return slug.toLowerCase() === 'readme';
}

/**
 * 매니페스트 문서 목록 → 부트스트랩 계획. 입력이 이미 온톨로지 노드를
 * 가진 문서를 포함해도 안전하다 (그 문서들은 후보에서 빠지고
 * `alreadyTypedCount` 로만 집계).
 */
export function deriveBootstrapPlan(
  docs: readonly BootstrapDocInput[],
  vaultName: string,
): BootstrapPlan {
  const existingSlugs = new Set(docs.map((d) => d.slug));
  const existingProject = docs.find(
    (d) => typeof d.frontmatter.kind === 'string' && d.frontmatter.kind.trim() === 'project',
  );
  let projectTitle = vaultName.trim() || 'my-project';
  let alreadyTypedCount = 0;
  const domainCounts = new Map<string, number>();
  const elements: BootstrapElementCandidate[] = [];

  for (const doc of docs) {
    if (hasOwnKind(doc.frontmatter)) {
      alreadyTypedCount += 1;
      continue;
    }
    if (isRootReadme(doc.slug)) {
      if (doc.title.trim()) projectTitle = doc.title.trim();
      continue;
    }
    const segments = doc.slug.split('/');
    const topFolder = segments.length > 1 ? segments[0] : null;
    if (topFolder) domainCounts.set(topFolder, (domainCounts.get(topFolder) ?? 0) + 1);
    elements.push({
      slug: doc.slug,
      title: doc.title.trim() || segments[segments.length - 1],
      domain: topFolder,
    });
  }

  const domains = [...domainCounts.entries()]
    .map(([name, docCount]) => ({ name, docCount }))
    .sort((a, b) => b.docCount - a.docCount || a.name.localeCompare(b.name));

  return {
    projectTitle: existingProject
      ? String(existingProject.frontmatter.title ?? projectTitle) || projectTitle
      : projectTitle,
    projectSlug: existingSlugs.has('project') ? 'ontology-project' : 'project',
    existingProjectSlug: existingProject?.slug ?? null,
    domains,
    elements,
    alreadyTypedCount,
  };
}

/** 선택 상태를 반영해 실제로 기록될 요소 목록을 계산한다. */
export function selectedElements(
  plan: BootstrapPlan,
  acceptedDomains: ReadonlySet<string>,
): BootstrapElementCandidate[] {
  return plan.elements.filter((el) => el.domain === null || acceptedDomains.has(el.domain));
}

/**
 * 생성할 project.md 본문. `domains:` 는 승인된 도메인만, `elements:` 는
 * 루트 레벨 문서의 마지막 세그먼트(derive 의 elements[] 가 element 노드
 * id 로 resolve 하는 형태)만 노출한다.
 */
/**
 * 재검 마찰 D — 승격 시 도메인을 스텁이 아닌 실제 .md 로 만든다.
 * 파일 tail 은 derive 의 `domain:slugifyName(name)` ref 와 일치해야
 * 그래프가 이어진다 (같은 slugify 규칙 import).
 */
export function domainDocSlug(name: string): string {
  const tail = slugifyName(name);
  return `${name}/${tail}`;
}

export function buildDomainMarkdown(domain: BootstrapDomainCandidate): string {
  return [
    '---',
    'kind: domain',
    `title: ${domain.name}`,
    '---',
    '',
    `# ${domain.name}`,
    '',
    `\`${domain.name}/\` 폴더의 문서 ${domain.docCount}개를 묶는 도메인입니다.`,
    '이 파일의 frontmatter 가 곧 그래프입니다 — 설명을 자유롭게 채우세요.',
    '',
  ].join('\n');
}

export function buildProjectMarkdown(
  plan: BootstrapPlan,
  acceptedDomains: ReadonlySet<string>,
): string {
  const lines: string[] = ['---', 'kind: project', `title: ${plan.projectTitle}`];
  const domains = plan.domains.filter((d) => acceptedDomains.has(d.name));
  if (domains.length > 0) {
    lines.push('domains:');
    for (const d of domains) lines.push(`  - ${d.name}`);
  }
  const rootElements = plan.elements.filter((el) => el.domain === null);
  if (rootElements.length > 0) {
    lines.push('elements:');
    for (const el of rootElements) {
      lines.push(`  - ${el.slug.split('/').pop()}`);
    }
  }
  lines.push('---', '', `# ${plan.projectTitle}`, '');
  lines.push('이 문서는 "내 문서에서 온톨로지 시작하기"가 만든 프로젝트 노드입니다.');
  lines.push('제목·설명을 자유롭게 고치세요 — 이 파일의 frontmatter 가 곧 그래프입니다.');
  lines.push('');
  return lines.join('\n');
}
