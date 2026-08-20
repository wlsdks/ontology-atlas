/**
 * 앱 몫 Claude 로그인이 낡았을 때 **실제로 통하는 한 줄**.
 *
 * ## 2026-08-20 정정 — 종전 안내가 덫을 만들고 있었다
 *
 * 이 파일은 원래 `CLAUDE_CONFIG_DIR=<앱 폴더> claude /login` 을 내밀었다.
 * **그것이 결함의 원인이었다.**
 *
 * 앱은 Claude 를 전용 설정 폴더로 띄우고(그래야 폴더 밖 작업 전에 묻는다),
 * 로그인이 갈라지지 않게 `.credentials.json` 을 사용자의 것으로 **링크**한다.
 * 그 설계는 실제로 동작한다 — 2026-08-20 실측: 키체인 항목이 없는 새 폴더에
 * 링크만 걸고 `claude auth status` 를 물으면 `loggedIn: true` 가 나온다,
 * 사용자 계정 그대로. **재로그인이 필요 없다.**
 *
 * 문제는 Claude Code 가 **키체인을 파일보다 먼저 본다**는 것이다. 그래서 그
 * 폴더 앞으로 항목이 한 번 생기면 링크는 그 순간부터 읽히지 않는다. 그리고
 * 항목이 생기는 길은 딱 하나 — **사람이 그 폴더로 로그인했을 때.** 종전 안내가
 * 정확히 그것을 시켰고, 그 토큰이 회전되면 죽고, 죽으면 화면이 같은 안내를
 * 다시 했다. 사용자 눈에는 「쓸 때마다 로그인하라고 한다」로 보인다.
 *
 * 실측으로 뒤집었다: 그 항목을 지우자 같은 폴더가 곧바로 `loggedIn: true` 로
 * 돌아왔다(`authMethod: "claude.ai"`, 사용자 이메일 그대로).
 *
 * ## 그래서 지금 하는 일
 *
 * **앱이 스스로 걷는다.** 세션을 띄우기 전 `prepare_isolated_config` 가
 * 자격증명을 링크한 뒤, 그 폴더 앞으로 난 키체인 항목이 있으면 지운다
 * (`clear_shadowing_credentials`, `src-tauri/src/acp.rs`). 그러니 이 명령은
 * **앱이 그것마저 실패했을 때의 마지막 수단**이다 — 키체인 접근이 막힌
 * 환경에서만 사람 손이 필요하다.
 *
 * 이름이 `...LoginRepair` 인 채로 두는 이유: 이 자리가 하는 일(앱 몫 로그인을
 * 되살린다)은 그대로이고, 방법만 뒤집혔다.
 *
 * ## 왜 관문을 포기하지 않는가
 *
 * 두 대안을 재 봤고 **둘 다 관문을 세우지 못했다**(2026-08-16):
 * - 세션 `_meta` 로 권한 모드를 넘기기 → 어댑터가 모드를 디스크 설정에서 먼저
 *   정한다. 볼트 밖 쓰기가 카드 없이 나갔다.
 * - 세션 모드를 `Manual` 로 걸기 → 같은 결과.
 *
 * 전용 폴더가 오늘 유일한 관문이다. 이제 그 관문의 대가(로그인 분리)는
 * 링크 + 그림자 걷기로 없앴다.
 */

export const APP_BUNDLE_IDENTIFIER = 'dev.jinan.ontology-atlas';

/** 앱이 Claude 에게 주는 전용 설정 폴더(홈 기준) — Rust 의 `prepare_isolated_config` 와 같은 자리. */
export const CLAUDE_ISOLATED_CONFIG_SUBPATH = `Library/Application Support/${APP_BUNDLE_IDENTIFIER}/agent-config/claude-acp`;

/**
 * 앱이 그림자를 못 걷었을 때 사람이 쓸 **마지막 수단 한 줄**.
 *
 * 앱 전용 설정 폴더 앞으로 난 키체인 항목을 지운다. 지우면 그 자리는 링크해 둔
 * **사용자 자격증명**으로 떨어지고, 그건 터미널에서 계속 갱신되므로 다시 낡지
 * 않는다 — 종전의 「앱 몫으로 다시 로그인」이 회전 한 번마다 되돌아오던 것과
 * 정확히 반대다.
 *
 * 항목 이름은 `Claude Code-credentials-<설정폴더 절대경로의 sha256 앞 8자>` 다.
 * 해시를 여기 박아 두지 않고 셸이 계산하게 두는 이유: 홈 경로가 사람마다
 * 다르므로 박아 둔 값은 **그 기계에서만** 맞는다. 경로에 공백이 있어서
 * (`Application Support`) 따옴표가 필수다.
 */
export function claudeLoginRepairCommand(): string {
  const dir = `$HOME/${CLAUDE_ISOLATED_CONFIG_SUBPATH}`;
  return `security delete-generic-password -s "Claude Code-credentials-$(printf %s "${dir}" | shasum -a 256 | cut -c1-8)"`;
}
