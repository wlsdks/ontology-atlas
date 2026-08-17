/**
 * 앱 몫 Claude 로그인이 낡았을 때 **실제로 통하는 한 줄**.
 *
 * ## 왜 필요한가 (2026-08-17 실측, 소유자 보고)
 *
 * 앱 안 Claude 대화가 `OAuth session expired and could not be refreshed` 로
 * 계속 실패했다. 터미널의 `claude` 는 멀쩡했고 토큰도 다섯 시간 더 유효했다.
 * 화면은 *"터미널에서 그 도구를 한 번 실행해 다시 로그인하세요"* 라고 안내했고,
 * 사용자는 그렇게 했고, **그래도 안 고쳐졌다**. 막다른 안내였다.
 *
 * 원인: 이 앱은 Claude 를 **전용 설정 폴더**로 띄운다(그래야 폴더 밖 작업 전에
 * 묻는다 — 사용자의 `~/.claude/settings.json` 이 `defaultMode: "auto"` ·
 * `Bash(*)` · `Write(*)` 를 열어 두고 있어서, 그것을 물려받으면 관문이 없다).
 * 그런데 Claude Code 는 자격증명을 **설정 폴더별 키체인 항목**에 넣는다 —
 * 이름이 `Claude Code-credentials-<설정폴더 절대경로의 sha256 앞 8자>` 다.
 * 실측한 두 항목의 접미사가 `sha256("~/.claude")` · `sha256("<앱 전용 폴더>")`
 * 와 정확히 일치했다.
 *
 * 그래서 로그인이 **둘**이고, 터미널 로그인은 사용자 몫만 갱신한다. 앱 몫은
 * 갱신 토큰이 회전된 뒤 되살아나지 못한다. 링크해 둔 `.credentials.json` 은
 * 키체인에 밀려 읽히지도 않는다.
 *
 * ## 왜 앱이 대신 지우지 않는가
 *
 * 재 봤다: 다른 프로그램이 만든 키체인 항목이라 macOS 가 **승인 창을 띄운다**
 * (`-128 User canceled`). 세션마다 창이 뜨는 것은 관문이 아니라 마찰이다.
 *
 * ## 왜 관문을 포기하지 않는가
 *
 * 두 대안을 재 봤고 **둘 다 관문을 세우지 못했다**:
 * - 세션 `_meta` 로 설정을 넘기기 → 어댑터가 권한 모드를 디스크 설정에서 먼저
 *   정하고 `_meta` 는 그 뒤 SDK 질의에만 닿는다. 볼트 밖 쓰기가 카드 없이 나갔다.
 * - 세션 모드를 `Manual` 로 걸기(codex 에 쓰는 방식) → 같은 결과. 카드 없이 나갔다.
 *
 * 그래서 전용 폴더가 오늘 유일한 관문이고, 대신 **고치는 법을 정확히 알려 준다.**
 */

/**
 * 앱 번들 식별자 — `src-tauri/tauri.conf.json` 의 `identifier` 와 같아야 한다.
 * 사본이 둘이므로 계약 검사가 둘을 묶는다
 * (`tests/contract/claude-login-repair.contract.test.ts`).
 */
export const APP_BUNDLE_IDENTIFIER = 'dev.jinan.ontology-atlas';

/** 앱이 Claude 에게 주는 전용 설정 폴더(홈 기준) — Rust 의 `prepare_isolated_config` 와 같은 자리. */
export const CLAUDE_ISOLATED_CONFIG_SUBPATH = `Library/Application Support/${APP_BUNDLE_IDENTIFIER}/agent-config/claude-acp`;

/**
 * 앱 몫 로그인을 되살리는 한 줄.
 *
 * **지우는 것이 아니라 다시 로그인하는 쪽**을 준다 — 지우면 그 자리는 링크해 둔
 * 사용자 자격으로 떨어지는데, 그것도 회전되면 같은 자리에 다시 온다. 앱 몫
 * 폴더에서 직접 로그인하면 그 폴더가 자기 갱신 토큰을 갖는다.
 *
 * 경로에 공백이 있어서 따옴표가 필수다(`Application Support`).
 */
export function claudeLoginRepairCommand(): string {
  return `CLAUDE_CONFIG_DIR="$HOME/${CLAUDE_ISOLATED_CONFIG_SUBPATH}" claude /login`;
}
