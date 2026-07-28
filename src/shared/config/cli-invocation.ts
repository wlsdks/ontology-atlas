/**
 * CLI 를 **어떻게 부르는가** — 화면이 복사해 주는 명령의 단일 출처.
 *
 * ## 왜 이 파일이 생겼나 (2026-07-29 실측)
 *
 * 앱과 웹이 사용자에게 `ontology-atlas validate .` 같은 명령을 복사시키고
 * 있었다. 그런데 `which ontology-atlas` → **not found** 다. npm 발행 계획은
 * 2026-07-27 에 폐기됐고(`docs/DECISIONS.md`), 그 이름의 전역 바이너리는
 * 이 세상 어디에도 없다. **복사해서 실행하면 404 가 아니라 "명령을 찾을 수
 * 없음" 이다** — 사용자는 자기가 뭘 잘못했는지 찾다가 시간을 버린다.
 *
 * 이 방언은 소스 22곳 116건에 흩어져 있었다. 기존 게이트
 * (`npm-channel-retired.contract.test.ts`)는 `npx ontology-atlas` 만 잡아서
 * **맨몸 호출은 통과**했다 — 룰이 있어도 사정거리가 짧으면 룰이 없는 것과 같다.
 *
 * ## 살아있는 채널은 소스 체크아웃 하나다
 *
 * `surfaces.md` 「배포 채널은 둘뿐이다」가 정본이다. 그 둘 중 **앱 번들은 MCP
 * 서버만** 싣는다(`mcp-server-launch.ts`) — CLI 는 번들에 없다. 그래서 CLI 를
 * 부르는 유일한 살아있는 형태는 소스 체크아웃이다:
 *
 *     node $ATLAS/cli/src/index.mjs <명령> [vault]
 *
 * ## 왜 경로를 우리가 안 채우나
 *
 * 우리는 이 컴퓨터의 체크아웃 위치를 **모른다.** 볼트 폴더와 Atlas 저장소는
 * 일반적으로 다른 경로이고, 앱은 볼트만 안다. 모르는 경로를 아는 척 채우면
 * 그게 정확히 지금 고치고 있는 문제(죽은 안내)의 재발이다.
 *
 * 대신 **채우는 방법을 아는 자리 표시**를 쓴다. `$ATLAS` 는 `export ATLAS=…`
 * 한 줄이면 그 뒤의 모든 명령이 손 볼 것 없이 그대로 도는 모양이라, "여기를
 * 채워야 하는구나" 와 "이렇게 채우면 된다" 를 동시에 말한다 —
 * `ontology-atlas` 처럼 **실행 가능해 보이는데 없는** 것보다 정직하고,
 * `<atlas>` 처럼 **채우고 나서야 도는** 것보다 빠르다.
 */

/**
 * 사용자가 채워야 하는 자리 — ontology-atlas 소스 체크아웃 루트.
 *
 * **꺾쇠(`<atlas>`)가 아니라 셸 변수인 이유가 둘 있다.**
 *
 * ① `<…>` 는 next-intl 메시지에서 **리치텍스트 태그로 파싱된다.** i18n 문자열에
 *    그대로 넣으면 화면에 안 나온다(실측: `/projects` 의 CLI 행이 통째로
 *    사라졌다). 명령 문자열은 코드와 메시지 양쪽에 사는데, 한쪽에서만 되는
 *    자리 표시는 자리 표시가 아니다.
 *
 * ② 꺾쇠는 **채워야 한다는 것만** 말하지만 변수는 **채우는 방법**까지 말한다.
 *    `export ATLAS=…` 한 줄이면 그 뒤의 명령들이 손 볼 것 없이 그대로 실행된다 —
 *    자리 표시가 실행 가능해진다. 이 저장소의 스타터 README 가 이미 같은
 *    문법(`ATLAS=<체크아웃>/cli/src/index.mjs`)을 쓰고 있다.
 */
export const ATLAS_CHECKOUT_PLACEHOLDER = "$ATLAS";

/** 명령 앞에 붙는 실행 형태. 이 문자열이 이 저장소의 유일한 CLI 호출 형태다. */
export const ATLAS_CLI = `node ${ATLAS_CHECKOUT_PLACEHOLDER}/cli/src/index.mjs`;

/**
 * `$ATLAS` 를 어떻게 채우는지 한 번 말해 주는 문장. 명령을 여러 줄 내보내는 표면은
 * 이걸 머리말로 함께 실어야 한다 — 자리 표시가 보이기만 하고 무엇을 채울지
 * 모르면 정직할 뿐 쓸모가 없다.
 */
export const ATLAS_CLI_HINT = `먼저 한 번: export ATLAS=<ontology-atlas 소스 체크아웃 경로>  (npm 패키지는 없습니다)`;

export const ATLAS_CLI_HINT_EN =
  "Set this once: export ATLAS=<path to your ontology-atlas source checkout>  (there is no npm package)";

/** `ATLAS_CLI` + 나머지. 호출부가 접두사를 손으로 붙이지 않게 한다. */
export function atlasCli(rest: string): string {
  return `${ATLAS_CLI} ${rest}`;
}
