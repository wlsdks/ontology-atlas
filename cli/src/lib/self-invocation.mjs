// CLI 가 **자기를 부르는 법** — 화면에 찍는 명령이 실제로 실행되게 한다.
//
// ## 왜 있나 (2026-07-28 도그푸딩 실측)
//
// `init` 의 「Next steps」가 `ontology-atlas list` 를 안내했는데, 그대로 붙여
// 넣으면 `command not found` (exit 127) 다. 이 이름은 **레지스트리에 없고
// 앞으로도 없다** (`docs/DECISIONS.md` 2026-07-27 「앱이 MCP 를 품는다 … npm
// 발행 계획 폐기」). 살아 있는 채널은 앱 번들과 소스 체크아웃 둘뿐이다.
//
// 더 이상한 것은 **같은 `init` 이 만드는 README 는 옳게 적혀 있었다**는 점이다
// (`node <checkout>/cli/src/index.mjs …`). 생성물과 생성 도구 자신의 안내가
// 서로 다른 규칙을 따르고 있었다.
//
// ## 규율
//
// 화면에 찍는 문자열은 두 종류다:
//
// - **복사해 실행하라는 것**(청록색 명령 줄, 「Next steps」, 「next」 힌트) —
//   반드시 이 함수를 통과한다. 그래야 실행된다.
// - **명령을 이름으로 부르는 산문**(usage 시놉시스, 오류 메시지의 "did you
//   mean", 주석) — 그대로 둔다. 거기서 `ontology-atlas add` 는 실행할 값이
//   아니라 하위 명령의 이름이고, 절대 경로를 끼워 넣으면 오히려 읽기 어렵다.
//
// 라벨 장식 게이트가 화살표를 글리프가 아니라 **위치**로 판별하는 것과 같은
// 원리다 — 같은 문자열이라도 자리가 뜻을 정한다.

import path from 'node:path';

/**
 * 이 프로세스를 실행한 진짜 명령. `process.argv[1]` 이 이 스크립트의 경로라,
 * 사용자가 어떤 체크아웃에서 부르든 그 체크아웃을 가리킨다.
 *
 * **절대 경로로 준다.** init 안내는 사용자에게 `cd <vault>` 를 먼저 시키므로,
 * 상대 경로로 주면 다음 줄에서 깨진다.
 *
 * @param {{ argv?: string[], cwd?: string }} [io] 테스트 주입용.
 */
export function cliInvocation(io = {}) {
  const argv = io.argv ?? process.argv;
  const entry = argv[1];
  if (!entry) return 'node cli/src/index.mjs';
  return `node ${shellQuoteIfNeeded(path.resolve(entry))}`;
}

/** 공백·따옴표가 든 경로만 감싼다: 멀쩡한 경로에 따옴표를 붙이면 읽기 나쁘다. */
export function shellQuoteIfNeeded(value) {
  return /[\s"'$`\\]/.test(value) ? `'${value.replace(/'/g, `'\\''`)}'` : value;
}

/**
 * 복사해 실행할 명령 한 줄. `cmd('list')` → `node /abs/cli/src/index.mjs list`.
 *
 * @param {...string} parts 하위 명령과 인자.
 */
export function cliCommand(...parts) {
  return [cliInvocation(), ...parts.filter(Boolean)].join(' ');
}
