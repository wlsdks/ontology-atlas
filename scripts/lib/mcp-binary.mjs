/**
 * 번들 MCP 바이너리의 이름·경로·컴파일 인자 계약.
 *
 * 앱은 MCP 서버를 **자기 번들 안에 싣는다** — 사용자는 node 도, npx 도, 소스
 * 체크아웃도 없이 에이전트를 붙일 수 있어야 한다. Tauri 의 `externalBin` 은
 * `<name>-<rust-target-triple>` 파일을 찾아 `Contents/MacOS/<name>` 으로
 * 굽는다. 그 이름 계약을 한 곳에서만 정의한다.
 *
 * 왜 `Contents/MacOS` 인가: Apple 은 실행 파일을 `Contents/Resources` 가 아닌
 * 실행 디렉토리에 두기를 요구한다 (공증 시 Resources 안의 실행 파일은 경고
 * 대상). `externalBin` 이 그 자리를 써 준다.
 */

/** 번들 안에서·설정 파일 안에서 쓰이는 바이너리 이름. */
export const MCP_BINARY_NAME = 'ontology-atlas-mcp';

/** `externalBin` 이 참조하는 저장소 상대 경로 (triple 접미사 없이). */
export const MCP_BINARY_EXTERNAL_BIN_REF = `binaries/${MCP_BINARY_NAME}`;

/** 컴파일 산출물이 놓이는 디렉토리 (gitignore 대상 — 빌드 산출물). */
export const MCP_BINARY_OUTPUT_DIR = 'src-tauri/binaries';

/** MCP 서버 엔트리 — 컴파일 입력. */
export const MCP_SERVER_ENTRY = 'mcp/src/index.js';

/**
 * Rust target triple → bun `--target` 값.
 * 하나만 지원해도 되지만 매핑을 명시해 두면 x64 확장 시 추측이 없다.
 */
const BUN_TARGET_BY_TRIPLE = Object.freeze({
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
});

export const SUPPORTED_TARGET_TRIPLES = Object.freeze(Object.keys(BUN_TARGET_BY_TRIPLE));

/** node 의 플랫폼·아키텍처 → Rust target triple. */
export function hostTargetTriple(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  return null;
}

export function bunTargetForTriple(triple) {
  return BUN_TARGET_BY_TRIPLE[triple] ?? null;
}

/** `externalBin` 이 실제로 찾는 파일명. */
export function binaryFileNameForTriple(triple) {
  const extension = triple.includes('-windows-') ? '.exe' : '';
  return `${MCP_BINARY_NAME}-${triple}${extension}`;
}

/** bun compile 인자 — 스크립트와 테스트가 같은 배열을 본다. */
export function bunCompileArgs({ triple, entry = MCP_SERVER_ENTRY, outfile }) {
  const bunTarget = bunTargetForTriple(triple);
  if (!bunTarget) {
    throw new Error(
      `Unsupported target triple: ${triple}. Supported: ${SUPPORTED_TARGET_TRIPLES.join(', ')}`,
    );
  }
  return ['build', '--compile', '--minify', `--target=${bunTarget}`, entry, '--outfile', outfile];
}
