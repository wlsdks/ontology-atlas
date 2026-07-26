import type { VaultDoc } from "@/entities/docs-vault";

/**
 * 화면에 내보낼 수 있는 설명은 **사람이 설명으로 쓴 것** 하나다 — 본문 발췌는
 * 설명이 아니다.
 *
 * `Project.description` (`derive-projects-from-vault.ts`) 과
 * `KnowledgeGraphNode.summary` (`derive-ontology-from-vault.ts`) 는 둘 다
 * frontmatter 에 `description:` 이 없으면 `doc.excerpt`(본문 앞 ~320자)로
 * 떨어진다. 엔티티 계층의 일반 폴백으로는 합리적이지만, 결정 화면에 그대로
 * 흘리면 파일 맨 앞에 있었다는 이유만으로 내부 메모·전략 문구·은퇴한 컴포넌트
 * 이름·중간-단어 말줄임이 카드에 앉는다. 실측 두 건:
 * - 도그푸드 `docs/ontology/project.md` 카드가 「정체성 (2026-07):
 *   agent-native, human-sovereign …」 로 시작하는 기여자용 문구를 띄웠다.
 * - `/ko/projects` 「최근 활동」이 `VaultAgentSetupPanel (merged into
 *   AppSettingsMenu's vault / mcpAgents t…` 를 한 행으로 내보냈다.
 *
 * **이 판정은 한 곳에서만 한다.** 같은 규칙을 두 소비자가 각자 구현하면 한쪽만
 * 고쳐지고(2026-07-26 실측: 카드는 고쳐졌는데 같은 페이지의 최근 활동은
 * 남았다) 한 화면이 같은 사실을 두 가지로 말한다. 카드 본문과 최근 활동 행이
 * 모두 이 함수를 지난다.
 */
export function resolveAuthoredDescription(doc: VaultDoc | null | undefined): string | null {
  const raw = doc?.frontmatter?.description;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
