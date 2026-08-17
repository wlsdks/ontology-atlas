/**
 * 실행기마다 **관문을 어떻게 세우나** — 기계마다 방식이 다르다.
 *
 * ## 두 가지 방식이 있고, 도구마다 되는 것이 다르다 (2026-08-16 실측)
 *
 * | | Claude | Codex |
 * |---|---|---|
 * | 설정 격리(`CLAUDE_CONFIG_DIR` / `CODEX_HOME`) | **먹힌다** | 읽히긴 하는데 **승인 정책은 무시된다** |
 * | 세션 모드(`session/set_mode`) | 「읽기 전용」이 없다 | **`read-only` 가 먹힌다** |
 *
 * codex 쪽 실측이 특히 뜻밖이었다. 격리한 `CODEX_HOME` 에
 * `approval_policy = "untrusted"` · `sandbox_mode = "workspace-write"` 를 넣어도
 * **권한 요청 0회에 볼트 밖 파일이 그대로 생겼다.** 그런데 같은 폴더에 넣은
 * `model` 값은 반영됐다 — 즉 우리 설정을 **읽기는 하는데 승인 정책만 어댑터의
 * 세션 모드가 덮어쓴다.**
 *
 * 그래서 codex 는 세션이 선 직후 모드를 바꿔서 관문을 세운다.
 *
 * ## `read-only` 인데 왜 지도는 써지나
 *
 * 그 모드가 막는 것은 **에이전트가 직접 파일을 만지는 것**이고, 우리 볼트 쓰기는
 * 전부 **우리가 꽂아 준 MCP 서버**를 지난다. 실측에서 `read-only` 로 두고도
 * `mcp.atlas-vault.list_concepts` 는 정상 동작했고, 볼트 밖 쓰기만 물어본 뒤
 * 막혔다. 원장의 결정 ⑤(*"쓰기는 어떤 경우에도 Atlas MCP 도구로만"*)와 정확히
 * 같은 모양이라, 이 모드는 기능을 깎는 것이 아니라 **그 결정을 강제하는 것**이다.
 */

/**
 * 세션이 서면 이 모드로 바꾼다. 여기 없는 실행기는 안 바꾼다 —
 * **재 보지 않은 도구에 임의로 모드를 걸지 않는다**(그 도구에서 그 이름이
 * 무슨 뜻인지 모르는 채로 거는 것은 짐작이다).
 */
export const GATED_SESSION_MODE: Readonly<Record<string, string>> = {
  'codex-acp': 'read-only',
};

/**
 * 이 실행기에 **관문이 있는가** — 화면이 그렇게 말해도 되는가.
 *
 * 두 방식 중 **하나라도** 되면 참이다. `isolated` 는 Rust 가 판정한 설정 격리
 * 가능 여부이고, 여기서 더하는 것은 세션 모드로 세우는 갈래다. 이 함수가 유일한
 * 통로여야 한다 — 화면의 문장과 실제로 거는 동작이 갈리면, 화면이 지키지 못할
 * 약속을 하게 된다.
 */
export function isGuardedRuntime(runtimeId: string, isolated: boolean): boolean {
  return isolated || runtimeId in GATED_SESSION_MODE;
}
