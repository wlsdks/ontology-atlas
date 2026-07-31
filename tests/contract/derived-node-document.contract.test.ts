import { describe, expect, it } from "vitest";
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
  type VaultDoc,
  type VaultManifest,
} from "@/entities/docs-vault";
import { resolveNodeDocument } from "@/entities/knowledge-graph";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
} from "@/views/ontology-insights/lib/duplicate-pairs";
import { buildStudioItem } from "@/views/ontology-studio/lib/build-studio-item";

/**
 * 파생 노드(다른 문서의 관계 키에서 이름만 불린 개념)와 문서 노드의 구분 계약.
 *
 * 배경(2026-07-26 실측): dogfood 샘플은 294 개념 중 96 개만 자기 `.md` 를
 * 가졌고 나머지 198 개는 파생 노드였다. 그런데 지도의 첫 문장은 "모든 것이
 * 진짜 문서예요" 였고, 팝오버의 `문서` 버튼은 파생 노드에서 *그 노드를 인용한
 * 남의 문서* 를 열었다.
 *
 * ⚠️ 수술 (2026-08-01): 이 계약은 한때 dogfood 샘플에 파생 노드가 **실재해야**
 * (`derived.length > 0`) 통과했다 — 결함(미해석 참조)을 요구하는 게이트는
 * 결함을 보존한다. 규격을 지킨 볼트는 파생 노드 0 이 정상이다. 그래서 지금은
 * **조건부**다: 파생 노드가 존재하면 그것을 문서 노드라 부르지 않는다(거짓말
 * 차단은 유지). 파생 경로 자체는 dogfood 의 결함이 아니라 **합성 표본**(ghost
 * 문서 1장을 얹은 매니페스트)으로 항상 검증한다 — `launch-docs-current` 의
 * demoNote 수술("숫자를 말하면 참이어야 하지만 말할 의무는 없다")과 같은 꼴.
 *
 * 두 수를 상수로 못 박지 않는 이유: `docs/ontology/` 는 dogfood 라 매니페스트
 * 가 자주 재생성된다 — 고정 숫자는 볼트를 고칠 때마다 CI 를 깨뜨리는 소음이지
 * 게이트가 아니다. 대신 **드리프트할 수 없는 항등식**을 건다:
 * 자기 문서 보유 노드 수 == derive 가 세는 `sourceConceptCount`.
 * `hasOwnDocument` 가 파생 노드에서 잘못 true 가 되면 이 등식이 즉시 깨진다.
 */

/** dogfood 매니페스트에 미해석 참조 1건을 가진 ghost 문서를 얹는다. */
function withGhostDoc(manifest: VaultManifest): VaultManifest {
  const ghost: VaultDoc = {
    slug: "ontology/capabilities/ghost-parent",
    path: "docs/ontology/capabilities/ghost-parent.md",
    title: "Ghost parent",
    tags: [],
    frontmatter: {
      kind: "capability",
      title: "Ghost parent",
      elements: ["elements/ghost-node"],
    },
    headings: [],
    excerpt: "",
    wordCount: 2,
    updatedAt: "2026-08-01T00:00:00.000Z",
    linksOut: [],
  };
  return { ...manifest, docs: [...manifest.docs, ghost] };
}

describe("파생 노드와 문서 노드의 구분 (번들 샘플)", () => {
  it("자기 문서 노드는 frontmatter 문서와 1:1 이고, 파생 노드는 (있다면) 문서 노드로 세지 않는다", () => {
    const derivation = deriveOntologyFromVault(
      resolveStaticVaultSource("dogfood").manifest,
    );
    const own = derivation.nodes.filter((n) => n.hasOwnDocument);
    const derived = derivation.nodes.filter((n) => !n.hasOwnDocument);

    // 항등식 — 자기 문서 노드는 frontmatter `kind:` 를 가진 문서와 정확히 1:1.
    expect(own).toHaveLength(derivation.sourceConceptCount);
    // 파생 노드 수는 요구하지 않는다 — 깨끗한 볼트는 0 이 정답이다.
    expect(own.length + derived.length).toBe(derivation.nodes.length);
  });

  it("이름만 불린 참조는 파생 노드로 나타나되 문서 노드라 불리지 않는다 (합성 표본)", () => {
    const derivation = deriveOntologyFromVault(
      withGhostDoc(resolveStaticVaultSource("dogfood").manifest),
    );
    const ghost = derivation.nodes.find((n) => n.id === "element:ghost-node");
    expect(ghost).toBeTruthy();
    expect(ghost!.hasOwnDocument).toBe(false);
    const resolved = resolveNodeDocument({
      evidenceIds: [ghost!.sourceSlug],
      hasOwnDocument: false,
    });
    expect(resolved.ownSlug).toBeNull();
  });

  it("파생 노드의 sourceSlug 는 남의 문서라 자기 문서로 승격되지 않는다", () => {
    // 합성 표본으로 돌린다 — 깨끗한 dogfood 에서는 파생 노드가 0 이라 이
    // 루프가 공회전하고, 공회전하는 게이트는 아무것도 지키지 않는다.
    const derivation = deriveOntologyFromVault(
      withGhostDoc(resolveStaticVaultSource("dogfood").manifest),
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
    // [수술 2026-08-01] 종전의 `suspectCount === 11` 고정 숫자는 삭제 —
    // dogfood 를 고칠 때마다 깨지는 소음이었고, 정의 통합 회귀는 위의 집합
    // 동일성이 이미 잡는다. 여기서는 자료형 계약만 남긴다.
    expect(buildDuplicatePairs(insight.nodes, insight.edges, 3).suspectCount)
      .toBeGreaterThanOrEqual(0);
  });
});

/**
 * 읽기보다 비싼 쪽 — **쓰기**. 위 계약이 "파생 노드의 근거 slug 는 남의 문서"
 * 임을 고정한다면, 여기서는 공방의 저장이 그 남의 문서로 가지 않는다는 것을
 * 볼트 전체에 대해 고정한다.
 *
 * 2026-07-26 재현: `payment-gateway`(자기 `.md` 없음)를 공방에서 열고 관계를
 * 저장하니 `capabilities/card-payment.md` 에 `dependencies: [capabilities/refund]`
 * 가 적혔다. 사용자가 한 적 없는 주장이 남의 문서에 사실로 앉은 것이고,
 * 되돌리려면 남의 파일을 손으로 고쳐야 한다.
 */
describe("공방 쓰기 대상 (번들 샘플)", () => {
  it("공방에서 열 수 있는 모든 노드의 쓰기 대상이 남의 문서가 아니다", () => {
    // [수술 2026-08-01] 문서 없는 노드(missing writeTarget)를 dogfood 결함으로
    // 요구하던 것을 합성 표본(ghost 문서)으로 바꿨다 — 깨끗한 볼트에서도
    // missing 분기가 항상 검증된다.
    const insight = derivationToInsight(
      deriveOntologyFromVault(
        withGhostDoc(resolveStaticVaultSource("dogfood").manifest),
      ),
    );
    // 자기 문서 slug → 그 문서를 소유한 노드 id.
    const ownerOfDoc = new Map<string, string>();
    for (const node of insight.nodes) {
      const own = resolveNodeDocument(node).ownSlug;
      if (own) ownerOfDoc.set(own, node.id);
    }

    let missingCount = 0;
    for (const node of insight.nodes) {
      const item = buildStudioItem(node.id, insight.nodes, insight.edges);
      expect(item).not.toBeNull();
      const target = item!.node.writeTarget;
      if (target.status === "missing") {
        missingCount += 1;
        // 문서가 없는 개념의 예정 경로는 아직 아무도 안 쓰는 자리여야 한다.
        expect(ownerOfDoc.has(target.slug)).toBe(false);
        continue;
      }
      // 문서가 있는 개념은 **자기** 문서를 가리켜야 한다.
      expect(ownerOfDoc.get(target.slug)).toBe(node.id);
    }

    // 합성 ghost 참조가 missing 분기를 최소 1회 강제로 태운다 — dogfood 가
    // 깨끗해도 이 게이트는 공회전하지 않는다.
    expect(missingCount).toBeGreaterThan(0);
  });
});
