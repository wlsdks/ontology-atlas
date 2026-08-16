/**
 * 채팅에 나온 이름 → 지도의 노드. **이름 공간이 둘이라서 필요하다.**
 *
 * ## 실물에서 본 것 (2026-08-17, 설치된 앱)
 *
 * codex 에게 *"이 폴더에 있는 개념들의 slug 를 전부 알려줘"* 라고 물었더니
 * 이렇게 답했다:
 *
 * ```
 * project
 * domains/example-domain
 * capabilities/example-capability
 * elements/example-element
 * ```
 *
 * 그 글자 위에 마우스를 올려도 **지도는 0픽셀도 안 변했다**(계기 검증: 같은
 * 방법으로 버튼에 올리면 2430픽셀이 바뀐다 — 호버 자체는 일어나고 있었다).
 *
 * 왜냐면 채팅이 집을 이름 목록을 **지도 내부 id** 로 만들고 있었기 때문이다:
 *
 * | | 생김새 | 누가 쓰나 |
 * |---|---|---|
 * | 지도 노드 id | `domain:example-domain` | 캔버스 · 선택 · 호버 |
 * | 에이전트 slug | `domains/example-domain` | **에이전트가 쓰고 읽는 이름** |
 *
 * 둘은 **절대 같아질 수 없다**(`derive-ontology-from-vault.ts` 가 id 를
 * `` `${kind}:${idSlug}` `` 로 만든다). 그러니 채팅에 나온 어떤 이름도 목록에
 * 걸리지 않았고, 기능은 배선만 있고 실제로는 죽어 있었다.
 *
 * ## 왜 검사가 못 잡았나
 *
 * 패널 검사가 `knownSlugs={new Set(['capabilities/invoice', …])}` 를 **직접**
 * 넘겼다 — 즉 **에이전트 이름공간**을 손으로 쥐여 줬다. 패널은 그 이름으로
 * 완벽히 동작했고, 그래서 초록불이었다. 틀린 곳은 패널이 아니라 **화면이 그
 * 목록을 만드는 자리**였는데 거기엔 검사가 없었다.
 *
 * > 두 이름 공간이 만나는 자리에 검사가 없으면, 양쪽 다 자기 이름으로는
 * > 멀쩡한 채로 서로를 못 만난다.
 *
 * 그래서 그 자리를 순수 함수로 꺼내 왔다. `chat-node-index.test.ts` 가
 * **두 이름이 실제로 다른지**부터 확인한다 — 같아져 버리면 이 검사는 아무것도
 * 안 재는 것이므로, 그날 검사가 먼저 터져야 한다.
 */

import type { KnowledgeGraphNode } from '../model/types';

/**
 * 채팅 글에서 집을 이름들과, 각 이름이 가리키는 지도 노드 id.
 *
 * **에이전트가 쓰는 이름을 먼저 넣는다.** 지도 id 도 함께 받는 이유는 값이
 * 공짜이고(같은 문자열이 키이자 값), 언젠가 에이전트가 id 를 그대로 옮겨
 * 적었을 때 조용히 안 걸리는 것보다는 걸리는 편이 낫기 때문이다.
 */
export function buildChatNodeIndex(
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const node of nodes ?? []) {
    if (typeof node?.id !== 'string' || node.id.length === 0) continue;
    // 지도 id 가 먼저 자리를 잡으면 안 된다 — 아래에서 덮어쓰지 않으므로
    // 에이전트 이름을 **먼저** 넣는다.
    const agentSlug = typeof node.agentSlug === 'string' ? node.agentSlug.trim() : '';
    if (agentSlug.length > 0 && !index.has(agentSlug)) index.set(agentSlug, node.id);
    if (!index.has(node.id)) index.set(node.id, node.id);
  }
  return index;
}
