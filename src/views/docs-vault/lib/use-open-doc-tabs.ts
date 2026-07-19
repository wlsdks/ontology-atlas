"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeDocTab,
  openOrActivateDocTab,
  pruneMissingDocTabs,
  readStoredDocTabs,
  storeDocTabs,
  type DocTab,
} from "./doc-tabs";
import { scheduleStateSync } from "./persistence";

/**
 * `doc-tabs.ts` 의 순수 로직을 `DocsVaultPage` state 에 연결하는 React
 * hook — 컴포넌트는 이 hook 만 소비하고 localStorage / effect 타이밍은
 * 여기서 캡슐화한다.
 *
 * 연결 계약: 이 hook 은 활성 탭을 스스로 판단하지 않는다(진실원은 URL
 * `?slug=` → `selectedSlug` state). 호출부가 `selectedSlug` 변화를 관찰해
 * `openTab` 을 부르고, 탭 스트립의 `×` 클릭이 `closeTab` 을 부른다.
 */

export interface UseOpenDocTabsArgs {
  /** vault 별 분리 키 — `useDocsVaultPersistence` 의 `recentKey` 재사용
   *  ('server' | `local:<handle.name>`). 같은 규약을 새로 만들지 않는다. */
  sourceKey: string;
  /** 현재 vault 에 실재하는 slug 집합 — 사라진 문서 탭을 조용히 정리한다. */
  validSlugs: ReadonlySet<string>;
}

export interface UseOpenDocTabsResult {
  tabs: DocTab[];
  /** 이미 열려 있으면 activate(+title 갱신)만, 없으면 새 탭 추가(+LRU). */
  openTab: (slug: string, title: string) => void;
  /** 탭을 닫는다. 다음에 activate 해야 할 slug(또는 마지막 탭이면 null)를
   *  동기적으로 반환 — 호출부가 URL/selectedSlug 를 옮기는 데 사용한다. */
  closeTab: (slug: string, activeSlug: string | null) => string | null;
}

export function useOpenDocTabs({
  sourceKey,
  validSlugs,
}: UseOpenDocTabsArgs): UseOpenDocTabsResult {
  const [tabs, setTabs] = useState<DocTab[]>([]);
  // storeDocTabs 호출 시점에 "지금" sourceKey 를 참조하기 위한 ref —
  // openTab/closeTab 을 sourceKey 변경마다 재생성하지 않기 위해 state 대신 ref.
  const sourceKeyRef = useRef(sourceKey);

  // sourceKey(=vault) 가 바뀌면 그 vault 의 탭 세트로 완전히 교체 — 샘플
  // 탭이 로컬 vault 로, 혹은 그 반대로 새지 않게 격리.
  useEffect(() => {
    sourceKeyRef.current = sourceKey;
    scheduleStateSync(() => setTabs(readStoredDocTabs(sourceKey)));
  }, [sourceKey]);

  // vault 의 실재 slug 목록이 바뀔 때(문서 rename/delete, vault 최초 로드)
  // 마다 사라진 문서 탭을 정리. validSlugs 가 아직 비어 있는 로딩 중 상태에서
  // 섣불리 전체를 비우지 않도록 가드.
  useEffect(() => {
    if (validSlugs.size === 0) return;
    setTabs((prev) => {
      const next = pruneMissingDocTabs(prev, validSlugs);
      if (next !== prev) storeDocTabs(sourceKeyRef.current, next);
      return next;
    });
  }, [validSlugs]);

  const openTab = useCallback((slug: string, title: string) => {
    setTabs((prev) => {
      const next = openOrActivateDocTab(prev, { slug, title });
      storeDocTabs(sourceKeyRef.current, next);
      return next;
    });
  }, []);

  // closeTab 은 다음 activate 대상을 "동기적으로" 반환해야 호출부가 같은
  // 이벤트 핸들러 안에서 바로 handleSelect 를 부를 수 있다 — setState 의
  // 함수형 업데이터는 커밋 타이밍이 보장되지 않으므로 여기서는 현재 `tabs`
  // state 를 직접 읽어 계산한다(하나의 이벤트 핸들러에서만 호출되는 액션이라
  // stale closure 위험이 없다).
  const closeTab = useCallback(
    (slug: string, activeSlug: string | null): string | null => {
      const result = closeDocTab(tabs, slug, activeSlug);
      setTabs(result.tabs);
      storeDocTabs(sourceKeyRef.current, result.tabs);
      return result.nextActiveSlug;
    },
    [tabs],
  );

  return { tabs, openTab, closeTab };
}
