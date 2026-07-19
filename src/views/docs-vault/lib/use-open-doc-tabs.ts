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
  //
  // 저장소 읽기를 updater 안에서 하는 이유: React 의 setState updater 는
  // "호출 시점" 이 아니라 "다음 렌더 시점" 에 실행된다. 값으로 읽어 넘기면
  // 같은 배치에 먼저 예약된 openTab updater 가 쓴 결과를 못 보고 덮어쓴다.
  useEffect(() => {
    sourceKeyRef.current = sourceKey;
    scheduleStateSync(() => setTabs(() => readStoredDocTabs(sourceKey)));
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

  // 병합 기준은 항상 **저장소**다(메모리 state 아님). 마운트 시 호출부의 문서
  // 선택 effect 가 하이드레이션보다 먼저 돌아 prev 가 빈 배열인 구간이 있고,
  // vault 전환 직후에는 prev 가 "이전 vault" 의 탭이라 그대로 쓰면 새 vault 로
  // 샌다. 저장소를 진실원으로 두면 두 레이스가 함께 사라진다 — 소유자 계약
  // "앱을 다시 켜도 탭이 그대로". 비용은 문서 열 때 localStorage 1회 읽기.
  const openTab = useCallback((slug: string, title: string) => {
    setTabs(() => {
      const key = sourceKeyRef.current;
      const next = openOrActivateDocTab(readStoredDocTabs(key), { slug, title });
      storeDocTabs(key, next);
      return next;
    });
  }, []);

  // closeTab 은 다음 activate 대상을 "동기적으로" 반환해야 호출부가 같은
  // 이벤트 핸들러 안에서 바로 handleSelect 를 부를 수 있다. 기준은 openTab 과
  // 동일하게 저장소 — 동기 읽기라 반환 타이밍 계약을 그대로 지키면서 state
  // 의존을 없애 콜백이 안정적으로 유지된다.
  const closeTab = useCallback(
    (slug: string, activeSlug: string | null): string | null => {
      const key = sourceKeyRef.current;
      const result = closeDocTab(readStoredDocTabs(key), slug, activeSlug);
      setTabs(result.tabs);
      storeDocTabs(key, result.tabs);
      return result.nextActiveSlug;
    },
    [],
  );

  return { tabs, openTab, closeTab };
}
