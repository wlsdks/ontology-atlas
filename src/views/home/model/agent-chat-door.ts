/**
 * 대화창의 **문 하나** — 어느 갈래가 그 창을 갖는지 정하는 산수.
 *
 * ## 왜 이게 함수여야 하나 (2026-08-16 소유자 실보고)
 *
 * 여기에는 대화를 하는 갈래가 둘이다: 내 컴퓨터에 깔린 코딩 에이전트와
 * 이야기하는 것(ACP), 그리고 넣어 둔 API 키로 이야기하는 것. 종전에는 둘이
 * **각자 자기 문과 자기 열림 상태**를 갖고 있었고 서로를 몰랐다. 그래서
 * 지도 오른쪽에 비슷하게 생긴 대화창이 **둘 뜰 수 있었다** — 소유자가 본 그
 * 화면이다: *"이 에이전트랑 다른 거지? 이 대화창은? 뭔가 헷갈리는데... 대화창
 * 하나만 쓰자."*
 *
 * 갈래가 둘인 것은 사실이고 문제가 아니다. 문이 둘이고 창이 둘인 것이
 * 문제였다. 그래서 판정을 여기 한 곳으로 모으고, **동시에 열리지 않는다**를
 * 화면이 아니라 이 파일이 보장한다 — 5,600줄짜리 화면 안의 조건식으로 두면
 * 다음 사람이 한쪽만 고치고 그 사실을 아무도 모른다.
 *
 * ## 규칙 셋
 *
 * 1. 코딩 에이전트를 쓸 수 있으면 **그쪽**이 창을 갖는다 — 이 폴더의 도구를
 *    그대로 쓰고, 사용자가 이미 쓰던 구독과 설정을 탄다
 * 2. 없으면 키 갈래가 창을 갖는다 — 코딩 에이전트를 안 쓰는 사람에게 남는 길
 * 3. 주소가 들고 온 「이거 물어봐」도 같은 규칙을 탄다. 종전에는 이 요청만
 *    키 갈래를 따로 열어서, 칩으로 여는 창과 노드에서 여는 창이 **서로 다른
 *    창**이었다
 */

export interface AgentChatDoorInput {
  /** 관문이 붙은 코딩 에이전트가 잡혔고, 그 대화에 줄 폴더가 있나. */
  hasRuntime: boolean;
  /** 코딩 에이전트 대화를 열어 둔 상태인가. */
  runtimeOpen: boolean;
  /** 키 갈래 패널을 열어 둔 상태인가. */
  keyOpen: boolean;
  /** 주소가 「이 개념을 물어보라」를 들고 있나. */
  hasAskIntent: boolean;
}

export interface AgentChatDoor {
  /** 코딩 에이전트 대화가 그 창을 갖는다. */
  runtime: boolean;
  /** 키 갈래가 그 창을 갖는다. */
  key: boolean;
  /** 지금 대화창이 떠 있나 — 칩의 눌림 상태가 읽는 값. */
  open: boolean;
}

export function agentChatDoor({
  hasRuntime,
  runtimeOpen,
  keyOpen,
  hasAskIntent,
}: AgentChatDoorInput): AgentChatDoor {
  const runtime = hasRuntime && (runtimeOpen || hasAskIntent);
  // `!runtime` 이 이 함수의 전부다 — 둘이 동시에 참이 되는 길을 문법으로 막는다.
  const key = !runtime && (keyOpen || hasAskIntent);
  return { runtime, key, open: runtime || key };
}
