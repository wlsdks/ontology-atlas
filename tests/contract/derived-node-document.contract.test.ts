import { describe, expect, it } from "vitest";
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
} from "@/entities/docs-vault";
import { resolveNodeDocument } from "@/entities/knowledge-graph";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
} from "@/views/ontology-insights/lib/duplicate-pairs";

/**
 * 번들 샘플 볼트가 **두 종류의 노드를 모두** 담고 있다는 계약.
 *
 * 배경(2026-07-26 실측): dogfood 샘플은 294 개념 중 96 개만 자기 `.md` 를
 * 가졌고 나머지 198 개는 다른 문서의 관계 키에서 이름만 불린 파생 노드다.
 * 그런데 지도의 첫 문장은 "모든 것이 진짜 문서예요" 였고, 팝오버의 `문서`
 * 버튼은 파생 노드에서 *그 노드를 인용한 남의 문서* 를 열었다.
 *
 * 두 수를 상수로 못 박지 않는 이유: `docs/ontology/` 는 dogfood 라 매니페스트
 * 가 자주 재생성된다 — 고정 숫자는 볼트를 고칠 때마다 CI 를 깨뜨리는 소음이지
 * 게이트가 아니다. 대신 **드리프트할 수 없는 항등식**을 건다:
 * 자기 문서 보유 노드 수 == derive 가 세는 `sourceConceptCount`.
 * `hasOwnDocument` 가 파생 노드에서 잘못 true 가 되면 이 등식이 즉시 깨진다.
 */
describe("파생 노드와 문서 노드의 구분 (번들 샘플)", () => {
  it("dogfood 샘플은 자기 문서 노드와 파생 노드를 둘 다 담는다", () => {
    const derivation = deriveOntologyFromVault(
      resolveStaticVaultSource("dogfood").manifest,
    );
    const own = derivation.nodes.filter((n) => n.hasOwnDocument);
    const derived = derivation.nodes.filter((n) => !n.hasOwnDocument);

    // 항등식 — 자기 문서 노드는 frontmatter `kind:` 를 가진 문서와 정확히 1:1.
    expect(own).toHaveLength(derivation.sourceConceptCount);
    // 파생 노드가 다수라는 사실 자체가 D6/D7 의 근거다 — 0 이 되면 이 계약의
    // 전제가 사라진 것이므로 카피/링크 처리를 다시 판단해야 한다.
    expect(derived.length).toBeGreaterThan(0);
    expect(own.length + derived.length).toBe(derivation.nodes.length);
  });

  it("파생 노드의 sourceSlug 는 남의 문서라 자기 문서로 승격되지 않는다", () => {
    const derivation = deriveOntologyFromVault(
      resolveStaticVaultSource("dogfood").manifest,
    );
    const ownSlugs = new Set(
      derivation.nodes.filter((n) => n.hasOwnDocument).map((n) => n.sourceSlug),
    );
    const derived = derivation.nodes.filter((n) => !n.hasOwnDocument);

    for (const stub of derived) {
      const resolved = resolveNodeDocument({
        evidenceIds: [stub.sourceSlug],
        hasOwnDocument: stub.hasOwnDocument,
      });
      expect(resolved.ownSlug).toBeNull();
      // 그 slug 는 실제로 *다른 노드의* 문서다 — 링크는 살아 있되 라벨이
      // "이 노드의 문서" 라고 말하면 거짓이 되는 이유.
      expect(ownSlugs.has(stub.sourceSlug)).toBe(true);
    }
  });

  /**
   * "자기 문서를 가졌는가" 의 정의는 **하나**여야 한다. 중복 의심 카드는
   * 한때 "id 꼬리 == 문서 slug 꼬리" 로 따로 추정했고, 그 추정은 프로젝트
   * 노드를 놓쳤다(프로젝트 id 는 frontmatter `slug:` 로 만들어진다). 지금은
   * 두 표면 모두 `resolveNodeDocument` 하나만 본다.
   */
  it("중복 의심 후보 집합 == 자기 문서 보유 노드 집합", () => {
    const insight = derivationToInsight(
      deriveOntologyFromVault(resolveStaticVaultSource("dogfood").manifest),
    );
    const candidates = buildSimilarityCandidates(insight.nodes, insight.edges);
    const documented = insight.nodes.filter(
      (n) => resolveNodeDocument(n).ownSlug !== null,
    );

    expect(candidates.size).toBe(documented.length);
    expect([...candidates.keys()].sort()).toEqual(
      documented.map((n) => n.id).sort(),
    );
    // 파생 노드가 후보에 섞이면 합치기 제안이 엉뚱한 파일을 가리킨다.
    expect(
      [...candidates.keys()].some(
        (id) => insight.nodes.find((n) => n.id === id)?.hasOwnDocument === false,
      ),
    ).toBe(false);
    // 의심 건수는 정의 통합 전후로 같다(도그푸드 11건, 2026-07-26 실측).
    expect(buildDuplicatePairs(insight.nodes, insight.edges, 3).suspectCount).toBe(11);
  });
});
