'use client';

import { useEffect, useState } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { extractProjectBody, findProjectVaultDoc } from '@/entities/docs-vault';
import { fetchServerDocContent } from '@/entities/docs-vault/lib/server-doc-content';

export interface UseProjectBodyState {
  /** project.md 의 실제 마크다운 본문. 없거나 아직 못 읽었으면 null. */
  body: string | null;
}

/**
 * /project/[slug] 상세 "본문" 카드 전용 lazy 본문 로더.
 *
 * `useProjects` (list 화면도 쓰는 공유 파생) 는 excerpt 까지만 필요해
 * 절대 본문 전체를 미리 읽지 않는다 — 이 hook 은 ProjectDetailPage 가
 * mount 된 시점, 그 슬러그에 대해서만 I/O 를 발생시킨다.
 *
 * - static: content.json 이 이미 번들에 있어 동기 lookup (추가 I/O 없음).
 * - local: FileSystemFileHandle.getFile() 로 실제 파일을 비동기 read —
 *   S4 노드 설명 편집(HomePage nodeBody)과 같은 기제 재사용.
 */
export function useProjectBody(slug: string | null): UseProjectBodyState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // 매니페스트와 본문을 **짝으로** 받는다 — 예전 결함이 정확히 "매니페스트는
  // storefront, 본문은 dogfood" 였다. 모듈 상수 한 벌을 그대로 돌려주므로
  // 참조가 안정적이라 effect 의존성에 넣어도 재실행 루프가 없다.
  const staticSource = useStaticVaultSource();
  const [resolved, setResolved] = useState<{ slug: string; body: string | null } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!slug) {
      window.queueMicrotask(() => {
        if (!cancelled) setResolved(null);
      });
      return () => {
        cancelled = true;
      };
    }

    if (mode === 'static') {
      const doc = findProjectVaultDoc(staticSource.manifest, slug);
      if (!doc) {
        window.queueMicrotask(() => {
          if (!cancelled) setResolved({ slug, body: null });
        });
        return () => {
          cancelled = true;
        };
      }

      // Gateway 문서만 동기 fallback map 에 들어 있다. 프로젝트 문서는
      // static export가 이미 복사한 public raw asset에서 읽어 초기 청크에
      // 전체 content.json을 싣지 않는다.
      fetchServerDocContent(doc.slug, {
        bundledContent: staticSource.content,
        locationHref: typeof window === 'undefined' ? undefined : window.location.href,
      })
        .then((raw) => {
          if (!cancelled) setResolved({ slug, body: extractProjectBody(raw) ?? null });
        })
        .catch(() => {
          if (!cancelled) setResolved({ slug, body: null });
        });
      return () => {
        cancelled = true;
      };
    }

    // local
    const doc = vault.manifest ? findProjectVaultDoc(vault.manifest, slug) : null;
    const fh = doc ? vault.fileHandles.get(doc.slug) : null;
    if (!fh) {
      window.queueMicrotask(() => {
        if (!cancelled) setResolved({ slug, body: null });
      });
      return () => {
        cancelled = true;
      };
    }
    fh.getFile()
      .then((file) => file.text())
      .then((raw) => {
        if (!cancelled) setResolved({ slug, body: extractProjectBody(raw) ?? null });
      })
      .catch(() => {
        if (!cancelled) setResolved({ slug, body: null });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, mode, vault.manifest, vault.fileHandles, staticSource]);

  return { body: resolved && resolved.slug === slug ? resolved.body : null };
}
