import { describe, expect, it } from "vitest";

import {
  detectMeaningFindingGaps,
  detectMeaningGaps,
  type ConceptDocFacts,
} from "./meaning-gaps";

const doc = (partial: Partial<ConceptDocFacts> = {}): ConceptDocFacts => ({
  findings: [],
  domainRef: "billing",
  mtime: null,
  ...partial,
});

describe("detectMeaningGaps", () => {
  it("뜻 없음은 검사가 적어 둔 definition-missing 일 때만", () => {
    expect(detectMeaningGaps({ kind: "capability" }, doc())).toEqual([]);
    expect(
      detectMeaningGaps({ kind: "capability" }, doc({ findings: ["definition-missing"] })),
    ).toEqual(["missing-definition"]);
  });

  it("다른 소견은 뜻 없음으로 번지지 않는다", () => {
    expect(
      detectMeaningGaps({ kind: "capability" }, doc({ findings: ["boundary-missing"] })),
    ).toEqual([]);
  });

  it("뜻이 먼저, 소속이 다음 — 순서는 사람이 답할 수 있는 순서다", () => {
    expect(
      detectMeaningGaps(
        { kind: "capability" },
        doc({ findings: ["definition-missing"], domainRef: null }),
      ),
    ).toEqual(["missing-definition", "missing-domain"]);
  });

  it("도메인·프로젝트·문서는 상위가 없어도 온전하다", () => {
    expect(detectMeaningGaps({ kind: "domain" }, doc({ domainRef: null }))).toEqual([]);
  });
});

describe("detectMeaningFindingGaps", () => {
  it("코드를 자리 이름으로 옮긴다 — 정해진 순서로", () => {
    expect(
      detectMeaningFindingGaps(
        doc({
          findings: [
            "slug-outside-kind-folder",
            "uncertainty-missing",
            "epistemic-exclusion",
            "boundary-missing",
          ],
        }),
      ),
    ).toEqual([
      "missing-boundary",
      "missing-uncertainty",
      "epistemic-exclusion",
      "slug-outside-kind-folder",
    ]);
  });

  it("경계 양쪽이 비어도 한 줄이다 — 자리 하나에 문서 하나", () => {
    expect(
      detectMeaningFindingGaps(
        doc({ findings: ["boundary-missing", "boundary-missing"] }),
      ),
    ).toEqual(["missing-boundary"]);
  });

  it("뜻 없음은 여기 오지 않는다 — 그 자리는 쓰는 줄이 따로 있다", () => {
    expect(detectMeaningFindingGaps(doc({ findings: ["definition-missing"] }))).toEqual([]);
  });

  it("모르는 코드는 조용히 넘긴다 — 없는 자리를 지어내지 않는다", () => {
    expect(detectMeaningFindingGaps(doc({ findings: ["folder-only-evidence"] }))).toEqual([]);
  });
});
