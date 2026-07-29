import { describe, expect, it } from "vitest";

import { RELATION_EDGE_TYPE } from "@/views/ontology-studio/lib/build-create-node";
import { WRITE_RELATION_TYPE_VALUES } from "../../mcp/src/ontology-engine.mjs";

/**
 * **공방이 내보내는 관계 타입은 서버가 받는 값이어야 한다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29)
 *
 * 공방의 패킷 빌더가 나침반 LEFT(비슷한 것)를 `related_to` 로 내보내고 있었다.
 * 그런데 MCP 서버의 `WRITE_RELATION_TYPE_VALUES` 에 그 값은 없다 — `relates` 다.
 * 그래서 그 방위로 만든 패킷은 **전량 `invalid_arguments` 로 반려**됐다.
 *
 * 하필 그 패킷이 **읽기 전용 볼트의 유일한 쓰기 경로**다. 볼트를 아직 안 고른
 * 사람(웹 관문의 첫 방문자)에게 공방이 주는 것이 그 문자열 하나인데, 그 중 한
 * 방위가 통째로 죽어 있었다.
 *
 * 단위 테스트는 이걸 못 잡았다 — **틀린 값을 기대값으로 적어 두었기 때문이다.**
 * 두 파일이 같은 오해를 공유하면 서로를 검증하지 못한다.
 *
 * ## 그래서 서버의 목록을 직접 import 한다
 *
 * 값을 여기 복제하면 그 복제본이 언젠가 서버와 갈라지고, 게이트가 사각지대를
 * 만든다. 파서 3-way·검증기 2-way 계약이 같은 이유로 같은 형태를 쓴다.
 */

describe("공방 패킷 — 관계 타입은 MCP 쓰기 계약 안에 있다", () => {
  const accepted = new Set(WRITE_RELATION_TYPE_VALUES as readonly string[]);

  it.each(Object.entries(RELATION_EDGE_TYPE))(
    "%s → %s 는 서버가 받는 값이다",
    (_bearing, edgeType) => {
      expect(
        accepted.has(edgeType),
        `공방이 "${edgeType}" 를 내보내는데 MCP 쓰기 계약에는 없다.\n` +
          `받는 값: ${[...accepted].join(", ")}\n` +
          `이 패킷은 읽기 전용 볼트의 유일한 쓰기 경로다 — 여기서 갈리면 그 방위가 통째로 죽는다.`,
      ).toBe(true);
    },
  );

  /**
   * **탐지기가 조용히 무력화되는 것을 막는 프로브.** 위 검사는 맵이 비면 0건을
   * 돌며 통과한다. 방위가 실제로 셋 다 살아 있는지 여기서 고정한다.
   */
  it("probe: every writable bearing is still covered", () => {
    expect(Object.keys(RELATION_EDGE_TYPE).sort()).toEqual([
      "contains",
      "dependsOn",
      "relates",
    ]);
    // is_a 는 엣지가 아니라 `broader` frontmatter 로 간다 — 그래서 이 맵에 없다.
    expect(RELATION_EDGE_TYPE).not.toHaveProperty("isA");
  });
});
