import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  bundledProjectSlugs,
  deriveBundledProjects,
  deriveProjectsFromVault,
  resolveStaticVaultSource,
} from '@/entities/docs-vault';

/**
 * **Every** project node in a bundled sample has its own canonical address.
 *
 * ## Measured defect (2026-08-01)
 *
 * `/ko/project/storefront/` was a 404 because `generateStaticParams` took slugs from
 * the dogfood manifest only — the one demo the app promotes everywhere had no address
 * of its own, blocking sharing, bookmarks, and crawlers.
 * `/project/ontology-atlas/` was fine, so the defect was not "the route is missing"
 * but **only one vault was visible**, and opening the screen does not reveal it (you
 * have to type the address).
 *
 * Hence two gates:
 *   1. Does the enumeration function contain the project slugs of **every bundled
 *      sample** (behaviour)?
 *   2. Do the route files use that enumeration function? A regression back to a
 *      single manifest is not caught by (1) alone, which looks at the function and
 *      not at the routes.
 */

const PROJECT_ROUTE_FILES = [
  'app/[locale]/project/[slug]/page.tsx',
  'app/[locale]/project/[slug]/edit/page.tsx',
  'app/[locale]/project/[slug]/opengraph-image.tsx',
];

describe('번들 샘플 project 라우트 전집 계약', () => {
  it('전집이 dogfood 와 storefront 양쪽의 project slug 를 모두 담는다', () => {
    const slugs = bundledProjectSlugs();

    for (const source of ['dogfood', 'storefront'] as const) {
      const fromSource = deriveProjectsFromVault(resolveStaticVaultSource(source).manifest);
      // If a sample has a project node, its slug must be in the enumeration.
      expect(fromSource.length, `${source} 샘플에 kind: project 문서가 없다`).toBeGreaterThan(0);
      for (const project of fromSource) {
        expect(slugs, `${source} 의 ${project.slug} 가 정적 라우트 전집에서 빠졌다`).toContain(
          project.slug,
        );
      }
    }
  });

  it('전집에 중복 slug 가 없다 (같은 주소를 두 번 만들지 않는다)', () => {
    const slugs = bundledProjectSlugs();
    expect(slugs).toEqual([...new Set(slugs)]);
  });

  it('전집의 모든 slug 가 실제 Project 로 해석된다 (메타데이터·본문이 붙는다)', () => {
    const projects = deriveBundledProjects();
    const resolved = new Set(projects.map((p) => p.slug));
    for (const slug of bundledProjectSlugs()) {
      expect(resolved, `${slug} 는 라우트만 있고 Project 가 없다 (notFound 로 떨어진다)`).toContain(
        slug,
      );
    }
  });

  it('project 라우트 파일이 전집 함수를 쓴다 (단일 매니페스트로 되돌아가지 않는다)', () => {
    const offenders: string[] = [];
    for (const rel of PROJECT_ROUTE_FILES) {
      const source = readFileSync(path.join(process.cwd(), rel), 'utf8');
      if (!source.includes('bundledProjectSlugs')) {
        offenders.push(`${rel} — bundledProjectSlugs() 를 쓰지 않는다`);
      }
      if (/deriveProjectsFromVault\s*\(/.test(source)) {
        offenders.push(`${rel} — 매니페스트 하나에서 직접 유도한다`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
