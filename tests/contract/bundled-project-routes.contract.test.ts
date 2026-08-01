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
 * 번들된 샘플의 project 노드는 **전부** 자기 정본 주소를 가진다.
 *
 * ## 실측 결함 (2026-08-01)
 *
 * `/ko/project/storefront/` 가 404 였다. `generateStaticParams` 가 dogfood
 * 매니페스트에서만 slug 를 뽑았기 때문이다 — 앱 곳곳이 홍보하는 유일한 데모가
 * 자기 주소를 못 가졌고, 공유·북마크·크롤러가 전부 막혔다. `/project/
 * ontology-atlas/` 는 멀쩡했으므로 "라우트가 없다" 가 아니라 **한 볼트만
 * 보였다** 는 결함이고, 화면을 열어 봐도 안 보인다(주소를 직접 쳐야 보인다).
 *
 * 그래서 게이트가 둘이다:
 *   1. 전집 함수가 **번들된 모든 샘플**의 project slug 를 담는가 (동작)
 *   2. 라우트 파일들이 그 전집 함수를 쓰는가 — 한 매니페스트로 되돌아가는
 *      회귀는 1번만으로는 안 잡힌다(1번은 함수만 보고 라우트는 안 본다)
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
      // 샘플에 project 노드가 있다면 그 slug 는 반드시 전집에 있어야 한다.
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
