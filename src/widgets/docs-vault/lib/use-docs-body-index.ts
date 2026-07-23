'use client';

import { useEffect, useRef, useState } from 'react';
import { vaultContent, type VaultDoc } from '@/entities/docs-vault';
import {
  buildBodyEntry,
  docBodyCacheKey,
  type DocsBodyEntry,
  type DocsBodyIndex,
} from './body-index';
import { fetchServerDocContent } from './server-doc-content';

/** 동시에 열어두는 본문 읽기 수 — FSA/fetch 폭주 방지. */
const READ_CONCURRENCY = 6;

/** 인덱스 구축을 초기 렌더/매니페스트 빌드와 겹치지 않게 미루는 기본 지연. */
const DEFAULT_START_DELAY_MS = 250;

interface Options {
  docs: VaultDoc[];
  /**
   * 로컬 볼트의 slug → raw md 리더 (DocsVaultPage 의 viewer resolver 와 동일
   * 소스: FileSystemFileHandle.getFile().text()). 미지정이면 static 볼트로
   * 보고 번들 content.json + /docs-vault/{slug}.md fetch 로 폴백 — viewer 의
   * 본문 소스와 같은 우선순위.
   */
  getDocContent?: (slug: string) => Promise<string>;
  /** 테스트용 — 구축 시작 지연 override. */
  startDelayMs?: number;
}

/**
 * 팔레트 본문 검색용 인메모리 인덱스. vault 로드(docs 배열 교체) 시 전 문서
 * 본문을 읽어 소문자 정규화해 두고, 폴링 diff 재빌드 후에는
 * {@link docBodyCacheKey} (slug+mtime) 가 같은 문서의 재독을 건너뛴다 —
 * 변경 파일만 다시 읽는다.
 *
 * 크기 감각: 305 docs × ~6KB × (raw+lower) ≈ 3.5MB 메모리, 구축 I/O 는
 * 매니페스트 빌드가 이미 하는 전 파일 읽기와 같은 차수. 검색 자체는
 * `search.ts` 의 선형 스캔 (~0.1–0.2ms/키 실측).
 */
export function useDocsBodyIndex({
  docs,
  getDocContent,
  startDelayMs = DEFAULT_START_DELAY_MS,
}: Options): { bodyIndex: DocsBodyIndex; indexing: boolean } {
  const [bodyIndex, setBodyIndex] = useState<DocsBodyIndex>(() => new Map());
  const [indexing, setIndexing] = useState(false);
  /** slug → entry 캐시. docs 배열이 갈려도 key 가 같으면 재사용. */
  const cacheRef = useRef<Map<string, DocsBodyEntry>>(new Map());
  /** 실패한 key — 같은 mtime 에 대한 재시도 폭주 방지 (변경되면 재시도). */
  const failedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    const failed = failedKeysRef.current;

    const stale = docs.filter((d) => {
      const key = docBodyCacheKey(d);
      return cache.get(d.slug)?.key !== key && !failed.has(key);
    });

    const publish = () => {
      if (cancelled) return;
      const next = new Map<string, DocsBodyEntry>();
      for (const d of docs) {
        const entry = cache.get(d.slug);
        if (entry) next.set(d.slug, entry);
      }
      setBodyIndex(next);
    };

    if (stale.length === 0) {
      publish();
      setIndexing(false);
      return;
    }

    setIndexing(true);
    const readBody =
      getDocContent ??
      ((slug: string) =>
        fetchServerDocContent(slug, {
          bundledContent: vaultContent as Record<string, string>,
          locationHref:
            typeof window === 'undefined' ? undefined : window.location.href,
        }));

    const run = async () => {
      const queue = [...stale];
      const worker = async () => {
        for (;;) {
          const doc = queue.shift();
          if (!doc || cancelled) return;
          const key = docBodyCacheKey(doc);
          try {
            const raw = await readBody(doc.slug);
            if (cancelled) return;
            cache.set(doc.slug, buildBodyEntry(raw, key));
          } catch {
            // 읽기 실패 문서는 인덱스에서 제외 — 같은 버전 재시도는 skip.
            failed.add(key);
            cache.delete(doc.slug);
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(READ_CONCURRENCY, queue.length) },
          worker,
        ),
      );
      if (cancelled) return;
      publish();
      setIndexing(false);
    };

    const timer = setTimeout(() => void run(), startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [docs, getDocContent, startDelayMs]);

  return { bodyIndex, indexing };
}
