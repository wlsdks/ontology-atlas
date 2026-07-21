import {
  buildDomainMarkdown,
  buildProjectMarkdown,
  domainDocSlug,
  selectedElements,
  type BootstrapPlan,
} from './bootstrap-candidates';

/**
 * 부트스트랩("내 문서에서 온톨로지 시작하기") 승인분을 vault 에 쓰는
 * 오케스트레이션 — HomePage 모듈화 1차로 인라인 runBootstrap 에서 추출.
 *
 * 계약 (전부 회귀 이력 있음 — 테스트가 고정):
 * - 모든 쓰기는 skipRefresh, 마지막에 refresh() 정확히 1회 (batch — 마지막
 *   쓰기가 no-op 이어도 반영 보장).
 * - 요소: frontmatter 만 추가 (본문 무변경).
 * - 도메인(재검 마찰 D): 실제 .md 생성 — 같은 경로/동명 domain 문서가
 *   있으면 생략.
 * - 프로젝트(재검 마찰 A): 기존 kind:project 가 있으면 두 번째 파일 대신
 *   그 문서의 domains 에 승인분 병합.
 */

/**
 * vault write 표면의 최소 계약 — use-local-vault 반환값의 부분집합 (fake 로
 * 테스트 가능). 메서드 축약 표기 — use-local-vault 의 더 넓은
 * FrontmatterUpdateValue 시그니처가 그대로 대입되도록.
 */
export interface BootstrapVaultWriter {
  manifest: {
    docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>;
  } | null;
  updateFrontmatter(
    slug: string,
    updates: Record<string, string | string[]>,
    opts?: { skipRefresh?: boolean },
  ): Promise<void>;
  createDoc(slug: string, content: string, opts?: { skipRefresh?: boolean }): Promise<void>;
  refresh(): Promise<void>;
}

export interface ExecuteBootstrapResult {
  /** 기존 프로젝트에 덧붙였는가 (토스트 분기용). */
  addedToExisting: boolean;
  /** 승격된 요소 수. */
  elementCount: number;
}

export async function executeBootstrapPlan(
  vault: BootstrapVaultWriter,
  basePlan: BootstrapPlan,
  input: { projectTitle: string; acceptedDomains: ReadonlySet<string> },
): Promise<ExecuteBootstrapResult | null> {
  if (!vault.manifest) return null;
  const plan = { ...basePlan, projectTitle: input.projectTitle };
  const elements = selectedElements(plan, input.acceptedDomains);

  for (const el of elements) {
    await vault.updateFrontmatter(
      el.slug,
      el.domain ? { kind: 'element', title: el.title, domain: el.domain } : { kind: 'element', title: el.title },
      { skipRefresh: true },
    );
  }

  const acceptedDomainCandidates = plan.domains.filter((d) => input.acceptedDomains.has(d.name));
  for (const domain of acceptedDomainCandidates) {
    const slug = domainDocSlug(domain.name);
    const tail = slug.split('/').pop();
    const taken =
      vault.manifest.docs.some((d) => d.slug === slug) ||
      vault.manifest.docs.some(
        (d) => d.frontmatter.kind === 'domain' && d.slug.split('/').pop() === tail,
      );
    if (!taken) await vault.createDoc(slug, buildDomainMarkdown(domain), { skipRefresh: true });
  }

  if (plan.existingProjectSlug) {
    const existing = vault.manifest.docs.find((d) => d.slug === plan.existingProjectSlug);
    const prevDomains = Array.isArray(existing?.frontmatter.domains)
      ? (existing.frontmatter.domains as string[])
      : [];
    const accepted = acceptedDomainCandidates.map((d) => d.name);
    const mergedDomains = [...new Set([...prevDomains, ...accepted])];
    await vault.updateFrontmatter(plan.existingProjectSlug, { domains: mergedDomains }, { skipRefresh: true });
  } else {
    await vault.createDoc(plan.projectSlug, buildProjectMarkdown(plan, input.acceptedDomains), {
      skipRefresh: true,
    });
  }

  await vault.refresh();
  return { addedToExisting: plan.existingProjectSlug !== null, elementCount: elements.length };
}
