/**
 * 서버 버전 — **상수로 박아 둔다**.
 *
 * 왜 `package.json` 을 런타임에 읽지 않는가: 이 서버는 `bun build --compile` 로
 * 단일 자기완결 바이너리가 되어 macOS 앱 번들에 실린다
 * (`scripts/build-mcp-binary.mjs`). 컴파일된 바이너리 옆에는 `package.json` 이
 * 없으므로 런타임 read 는 그 배포 형태에서 부팅 자체를 깨뜨린다.
 *
 * 동기화는 테스트가 지킨다 — `scripts/check-package-contracts.test.mjs` 가
 * 이 상수와 `mcp/package.json` 의 `version` 이 같은지 강제한다. 버전을 올릴 때는
 * 두 곳을 함께 고친다.
 */
export const SERVER_VERSION = '0.13.0';
