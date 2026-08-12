import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **CLI 와 MCP 의 스키마 사본은 바이트까지 같아야 한다** (2026-08-13 위생 소탕).
 *
 * `mcp/src/schema.mjs`(정본)와 `cli/src/lib/schema.mjs` 는 **의도된 복제**다 —
 * 어느 쪽도 상대를 import 하지 않는다. npm 미발행이라 공유 패키지가 없고, 둘 다
 * 자기 실행 진입점(MCP 서버 spawn / CLI 직접 실행)에 박혀야 하기 때문이다.
 * import 그래프 도구는 이 결합을 못 본다(둘이 서로 안 부르므로 「독립된 두
 * 파일」로 읽는다) — 그래서 어긋나도 **어떤 검사도 잡지 못하는** 상태였다.
 *
 * 위생 소탕(2026-08-13) 실측: 두 파일 578줄/24,226바이트 완전 동일. 그런데 같은
 * 관계의 형제들(absorb · parse-frontmatter · interop-format)은 전용 동기화
 * 계약이 있고 **schema.mjs 만 없었다.** 사본이 둘인데 게이트가 없으면 어긋나는
 * 쪽이 기본값이다 — 이 저장소가 스킬 사본(`agents:check` 의 skill-copy)에서
 * 이미 배운 그 규율의 코드판이다.
 *
 * 어긋나면: **정본은 mcp 쪽이다** (`AGENTS.md` — 스키마의 단일 출처는
 * `mcp/src/schema.mjs`). mcp 쪽을 고쳤다면 cli 로 복사하고, cli 쪽만 고쳤다면
 * 그 변경을 mcp 에 먼저 넣어라.
 */
describe("schema.mjs 사본 동기화", () => {
  const canonical = join(process.cwd(), "mcp", "src", "schema.mjs");
  const copy = join(process.cwd(), "cli", "src", "lib", "schema.mjs");

  it("두 사본이 바이트까지 같다", () => {
    const canonicalBody = readFileSync(canonical, "utf-8");
    const copyBody = readFileSync(copy, "utf-8");

    /*
     * 공회전 차단: 빈 파일 두 개도 「같다」이다. 이 스키마는 다섯 kind 와 관계
     * 키 전부를 담아 수만 바이트다 — 그 실체가 있는지 먼저 확인한다.
     */
    expect(
      canonicalBody.length,
      "정본 스키마가 비어 있다 — 이 계약이 공회전한다",
    ).toBeGreaterThan(10_000);

    if (canonicalBody !== copyBody) {
      // 어긋난 «자리»를 알려 준다 — 24KB 전체 diff 를 사람이 눈으로 찾게 하지 않는다.
      const canonicalLines = canonicalBody.split("\n");
      const copyLines = copyBody.split("\n");
      const firstDiff = canonicalLines.findIndex((line, i) => line !== copyLines[i]);
      expect.fail(
        `cli/src/lib/schema.mjs 가 정본(mcp/src/schema.mjs)과 어긋났다 — ` +
          `첫 차이는 ${firstDiff + 1}번째 줄. 정본은 mcp 쪽이다: ` +
          `mcp 를 고쳤으면 cli 로 복사하고, cli 만 고쳤으면 그 변경을 mcp 에 먼저 넣어라.\n` +
          `  mcp: ${JSON.stringify(canonicalLines[firstDiff] ?? "(파일 끝)")}\n` +
          `  cli: ${JSON.stringify(copyLines[firstDiff] ?? "(파일 끝)")}`,
      );
    }
  });
});
