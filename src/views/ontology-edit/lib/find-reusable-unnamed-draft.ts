import { isUntitledTitle } from "./is-untitled-title";

/**
 * 팔레트에서 D/C/E 를 눌러 새 임시 노드를 만들려 할 때, 이미 이름을 안 붙인
 * 임시 노드("(이름 입력)" placeholder 그대로)가 있으면 그 id 를 돌려준다 —
 * 없으면 null.
 *
 * Why (감사 #10): 미명명 드래프트가 있는데 또 D/C/E 를 누르면 이름 없는
 * "(이름 필요)" 노드가 캔버스에 계속 쌓였다. 저장 시 slugify 가 placeholder 를
 * 파일명으로 만들 위험 + 화면 잡음. caller 는 이 함수가 id 를 주면 새 노드를
 * 만드는 대신 그 노드를 재선택하고 이름 입력에 포커스한다 — 한 번에 하나의
 * 미명명 드래프트만 존재하도록 강제한다.
 *
 * placeholder 판정은 `isUntitledTitle` 에 위임(단일 진실원). 여러 개가 이미
 * 쌓여 있던 레거시 상태여도 첫 번째만 돌려주면 되므로 find 로 충분하다.
 */
export function findReusableUnnamedDraft(
  nodes: ReadonlyArray<{ id: string; title: string }>,
  placeholder: string,
): string | null {
  const match = nodes.find((node) => isUntitledTitle(node.title, placeholder));
  return match ? match.id : null;
}
