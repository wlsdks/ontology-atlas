import { describe, expect, it } from "vitest";
import { WRITER_CASES } from "../fixtures/frontmatter-writer-cases.mjs";
import {
  buildMarkdown as buildMcpMarkdown,
  parseFrontmatter as parseMcpFrontmatter,
  serializeFrontmatter as serializeMcpFrontmatter,
} from "../../mcp/src/parser.mjs";
import {
  buildMarkdown as buildCliMarkdown,
  parseFrontmatter as parseCliFrontmatter,
  serializeFrontmatter as serializeCliFrontmatter,
} from "../../cli/src/lib/parse-frontmatter.mjs";

/**
 * Writer contract — MCP write tools and CLI add/import write the same markdown.
 *
 * The packages are published separately, so this test is the effective shared
 * contract for serializeFrontmatter/buildMarkdown. Parser parity is covered by
 * parse-frontmatter.contract.test.ts; this file catches write-shape drift.
 */

describe("frontmatter writer contract — MCP and CLI agree", () => {
  for (const c of WRITER_CASES) {
    it(c.name, () => {
      expect(buildMcpMarkdown(c.input)).toBe(c.expected);
      expect(buildCliMarkdown(c.input)).toBe(c.expected);

      expect(serializeMcpFrontmatter(c.input.frontmatter)).toBe(
        serializeCliFrontmatter(c.input.frontmatter),
      );
      expect(parseMcpFrontmatter(c.expected)).toEqual(parseCliFrontmatter(c.expected));
    });
  }
});

/**
 * **왕복이 닫힌다** — `parse(build(x)) === x`.
 *
 * 이 계약이 없어서 두 결함이 살아 있었다(2026-07-28 실측):
 *
 * 1. serializer 는 `"` 를 이스케이프하는데 파서는 언이스케이프를 안 했다.
 *    `patch_concept` 가 프론트매터를 재직렬화할 때마다 백슬래시가 **배가**됐다
 *    (3회 왕복: 1개 → 2개 → 4개). 저장 반복이 곧 오염 증식이다.
 * 2. 인라인 리스트/객체를 무조건 콤마로 쪼개서 값 안의 콤마가 데이터를 잘랐다
 *    (`labels: { ko: "지도, 검색" }` → `"지도"`).
 *
 * 왜 기존 매트릭스가 못 잡았나: 파서 계약은 **입력 → 파스 결과**만 보고,
 * 작성 계약은 **입력 → 문자열**만 봤다. 둘을 이어 붙인 "쓰고 다시 읽으면
 * 같은가" 는 어느 쪽 사정거리에도 없었다.
 *
 * 세 번 도는 이유: 한 번은 통과하면서 **누적**되는 종류가 있기 때문이다.
 * 위 1번이 정확히 그랬다.
 */
const ROUND_TRIP_CASES: Array<{ name: string; frontmatter: Record<string, unknown> }> = [
  { name: "따옴표 든 값 — 이스케이프가 누적되지 않는다", frontmatter: { kind: "capability", title: 'say "hello"' } },
  { name: "배열 항목 안의 콤마", frontmatter: { kind: "capability", tags: ["a, b", "c"] } },
  { name: "객체 값 안의 콤마", frontmatter: { kind: "capability", labels: { ko: "지도, 검색", en: "Map" } } },
  { name: "역슬래시 든 값", frontmatter: { kind: "capability", title: "C:\\path, x" } },
  { name: "따옴표와 콤마 혼합", frontmatter: { kind: "capability", labels: { ko: '지도, "검색"', en: "Map" } } },
  { name: "콜론 든 값", frontmatter: { kind: "capability", title: "a: b" } },
];

describe("왕복 계약 — 쓰고 다시 읽으면 같다 (누적 오염 차단)", () => {
  for (const c of ROUND_TRIP_CASES) {
    it(c.name, () => {
      for (const [label, build, parse] of [
        ["mcp", buildMcpMarkdown, parseMcpFrontmatter],
        ["cli", buildCliMarkdown, parseCliFrontmatter],
      ] as const) {
        let current = c.frontmatter;
        // 세 번 — 한 번은 통과하면서 누적되는 종류를 잡는다.
        for (let round = 1; round <= 3; round += 1) {
          const markdown = build({ frontmatter: current, body: "본문" });
          current = parse(markdown).frontmatter as Record<string, unknown>;
          expect(current, `${label} round ${round}`).toEqual(c.frontmatter);
        }
      }
    });
  }
});
