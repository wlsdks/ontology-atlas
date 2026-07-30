/**
 * /download engraved fact-strip values that ARE real, checked-in facts —
 * not fabricated marketing numbers. Each one traces to an actual repo
 * source of truth:
 *
 * - `RELEASE_VERSION` — `package.json` / `src-tauri/tauri.conf.json`
 *   `version` (release-status tooling already enforces these three stay
 *   aligned — see `check-macos-release-status.mjs`'s `version_alignment`
 *   check).
 * - `RELEASE_MIN_MACOS` — `src-tauri/tauri.conf.json`
 *   `bundle.macOS.minimumSystemVersion`.
 * - `buildDmgName` — the real asset-naming convention enforced by
 *   `scripts/check-macos-download-release.mjs`
 *   (`ontology-atlas_<version>_<aarch64|x64>.dmg`, lowercase).
 *
 * Per-release facts that only exist once a build is published — DMG byte
 * size, SHA-256, download URL — deliberately do NOT live here. They come
 * from `model/macos-release.generated.ts`, written by
 * `pnpm download:release-facts` out of the real GitHub Release, and are read
 * through `lib/release-state.ts`. This file holds only what the repository
 * itself already knows before any build exists.
 *
 * `release-facts.test.ts` guards drift against `package.json` and
 * `tauri.conf.json` directly.
 */

// [W-2] CLI 명령 수는 cli/src/lib/cli-commands.mjs 의 CLI_COMMANDS 배열
// 길이가 단일 진실원 — 여기서 하드코딩한 숫자가 실제 명령 수와 갈라지면
// 다운로드 페이지가 거짓말을 하게 된다. cli-commands.mjs 는 의존성이 없는
// 순수 상수 모듈이라 정적 export 빌드에서도 그대로 트리셰이크된다.
export { CLI_COMMAND_COUNT } from "../../../../cli/src/lib/cli-commands.mjs";

/**
 * MCP 도구 수. `mcp/src/index.js` 의 `TOOLS` 배열이 단일 진실원이지만, 그
 * 모듈은 서버 진입점(stdio JSON-RPC)이라 웹 번들로 끌고 올 수 없다. 그래서
 * 값은 여기 두고 **드리프트는 테스트가 잡는다** — CLI 쪽과 같은 규율이다.
 * 도구를 추가/삭제하면 `release-facts.test.ts` 가 먼저 빨개진다.
 */
export const MCP_TOOL_COUNT = 32;

export const RELEASE_VERSION = "1.0.0-rc.4";
export const RELEASE_MIN_MACOS = "macOS 12";
export const RELEASE_ARCHES = ["aarch64", "x64"] as const;
export type ReleaseArch = (typeof RELEASE_ARCHES)[number];

/**
 * 서명·공증은 **워크플로의 성질**이지 마케팅 문구가 아니다.
 *
 * 2026-07-27 에 Developer ID 인증서가 발급되면서(`docs/DECISIONS.md`) 릴리스
 * 경로가 서명 경로로 돌아왔다. 그때까지 이 페이지가 하던
 * "아직 서명되지 않음 · 시스템 설정에서 「확인 없이 열기」" 안내는 **그날부로
 * 거짓**이 됐고, 같은 원장이 *"인증서가 생기면 … 그때 페이지 문구도 함께
 * 되돌린다"* 고 남겨 둔 미결 항목이었다.
 *
 * 값을 손으로 적어 두면 다음에 또 조용히 거짓이 되므로, 진실원은
 * `package.json` 의 `desktop:release-artifact` 체인이다 — 그 체인이
 * `desktop:sign` → `desktop:sign:dmg` → `desktop:notarize` →
 * `desktop:verify-release-dmg`(`--require-signed --require-notarized`) 로
 * 끝나기 때문에, **검증을 통과하지 못한 빌드는 릴리스 자산이 될 수 없다.**
 * 체인에서 한 단계라도 빠지면 `release-facts.test.ts` 가 먼저 실패한다.
 */
export const RELEASE_SIGNING = {
  /** Developer ID Application 인증서로 서명한다. */
  developerId: true,
  /** Apple 공증(notarytool)을 받고 티켓을 DMG 에 붙인다(stapler). */
  notarized: true,
} as const;

export function buildDmgName(arch: ReleaseArch): string {
  return `ontology-atlas_${RELEASE_VERSION}_${arch}.dmg`;
}
