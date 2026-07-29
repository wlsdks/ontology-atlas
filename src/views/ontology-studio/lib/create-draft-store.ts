"use client";

import type { CreateNodeKind, PendingRelation } from "./build-create-node";

/**
 * 생성 초안의 임시 보관 — **나가도 사라지지 않게.**
 *
 * ## 왜 필요한가
 *
 * 강화(enhance) 초안은 `studio-draft-store` 가 노드 id 로 붙들어 두고, 무대의
 * 「그만하기」 주석도 *"나가도 초안은 남고, 돌아오면 그대로다"* 라고 약속한다.
 * 그런데 **생성(create)에는 붙들 노드 id 가 없어서** 그 약속이 지켜지지
 * 않았다 — 이름과 관계를 채워 놓고 나가면 아무 말 없이 전부 사라졌다
 * (디자인 카운슬 「상호작용」 실측, 2026-07-29).
 *
 * 더 나쁜 건 같은 화면에 **그만두기가 둘**이라는 점이다. 실습 띠의 「실습
 * 그만두기」는 안내만 끄고 타이핑을 지키는데, 헤더의 「그만하기」는 화면을
 * 떠나며 초안을 버렸다. **더 파괴적인 쪽이 더 모호한 라벨**을 갖고 나란히
 * 서 있었다.
 *
 * ## 왜 확인 대화상자가 아닌가
 *
 * "정말 나가시겠어요?" 는 사용자에게 결정을 하나 더 시키고, 이 저장소가
 * 싫어하는 스택 표면을 하나 더 만든다. 잃을 것이 없으면 물어볼 것도 없다 —
 * 보관이 확인보다 낫다.
 *
 * ## 왜 세션 저장소인가
 *
 * 이건 **작업 중 상태이지 사용자의 데이터가 아니다.** 진실원은 언제나 디스크의
 * 마크다운이고(`local-first.md`), 여기 있는 것은 아직 저장을 안 누른 반쯤 쓴
 * 문장이다. 탭을 닫으면 같이 사라지는 것이 맞다 — 영구 저장소에 두면 몇 주 전
 * 유령 초안이 어느 날 되살아난다.
 */

const KEY = "ontology-atlas:studio-create-draft";

export interface CreateDraftSnapshot {
  title: string;
  kind: CreateNodeKind;
  domainValue: string | null;
  definition: string;
  secondaryName: string;
  relations: PendingRelation[];
}

/** 붙들 가치가 있는가 — 빈 초안은 저장하지 않는다(유령 방지). */
export function createDraftHasContent(snapshot: CreateDraftSnapshot): boolean {
  return (
    snapshot.title.trim() !== "" ||
    snapshot.definition.trim() !== "" ||
    snapshot.secondaryName.trim() !== "" ||
    snapshot.relations.length > 0
  );
}

export function saveCreateDraft(snapshot: CreateDraftSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    if (!createDraftHasContent(snapshot)) {
      window.sessionStorage.removeItem(KEY);
      return;
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // 용량 초과·프라이빗 모드 — 보관은 편의라 실패해도 편집을 막지 않는다.
  }
}

export function readCreateDraft(): CreateDraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreateDraftSnapshot>;
    // 모양이 어긋난 것은 **조용히 버린다** — 반쯤 복원된 초안이 사용자가 쓴
    // 것인 척하는 쪽이, 없는 쪽보다 나쁘다.
    if (typeof parsed?.title !== "string" || !Array.isArray(parsed.relations)) return null;
    return {
      title: parsed.title,
      kind: (parsed.kind ?? "capability") as CreateNodeKind,
      domainValue: parsed.domainValue ?? null,
      definition: typeof parsed.definition === "string" ? parsed.definition : "",
      secondaryName: typeof parsed.secondaryName === "string" ? parsed.secondaryName : "",
      relations: parsed.relations as PendingRelation[],
    };
  } catch {
    return null;
  }
}

export function clearCreateDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // 위와 같다.
  }
}
