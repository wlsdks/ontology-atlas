import { describe, expect, it } from "vitest";

import manifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";

/**
 * **예시 볼트도 검사받는다.**
 *
 * ## 무엇이 났나 (2026-08-09)
 *
 * `pnpm vault:validate` 는 도그푸드 볼트(`docs/ontology`)만 스캔한다 — 예시 볼트
 * (`samples/storefront`)는 **아무도 검사하지 않았다.** 그 구멍으로 방금 두 번
 * 빠졌다: 새로 쓴 역량 둘이 존재하지 않는 슬러그
 * (`capabilities/order-confirmation` · `capabilities/payment-authorization`)를
 * 가리켰는데 빌드도 통과하고 화면도 떴다. 실제 슬러그는
 * `order-placement` · `payment-authorize` 였다.
 *
 * 예시 볼트는 **처음 온 사람이 보는 유일한 데이터**다. 여기가 깨져 있으면 제품이
 * 깨져 보이고, 정작 우리는 도그푸드만 보고 있으니 알 수가 없다.
 *
 * ## 왜 매니페스트를 읽나
 *
 * 매니페스트는 `pnpm docs-vault:build` 가 `samples/storefront/**` 에서 **생성**한
 * 것이라, 이걸 검사하면 원본과 파서를 같이 검사하게 된다(`documentation.md` 의
 * 「생성한 뒤 대조」 갈래). 원본을 다시 파싱하는 둘째 파서를 만들지 않는다.
 */

interface SampleDoc {
  frontmatter?: Record<string, unknown>;
}

const DOCS = (manifest as { docs?: SampleDoc[] }).docs ?? [];

/** 슬러그를 가리키는 frontmatter 키 — 하나라도 없는 곳을 가리키면 그래프가 끊긴다. */
const REFERENCE_KEYS = [
  "capabilities",
  "elements",
  "domains",
  "dependencies",
  "relates",
  "domain",
] as const;

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value == null ? [] : [value]).filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );

describe("예시 볼트 무결성", () => {
  it("문서를 실제로 읽고 있다 — 빈 매니페스트로 통과하지 않는다", () => {
    expect(DOCS.length, "예시 볼트 문서를 하나도 못 읽었다 — 이 시험이 헛돈다").toBeGreaterThan(
      100,
    );
  });

  it("모든 참조가 실재하는 슬러그를 가리킨다", () => {
    const slugs = new Set(
      DOCS.map((doc) => doc.frontmatter?.slug).filter(
        (slug): slug is string => typeof slug === "string",
      ),
    );
    expect(slugs.size, "슬러그를 하나도 못 모았다").toBeGreaterThan(100);

    const broken: string[] = [];
    for (const doc of DOCS) {
      const frontmatter = doc.frontmatter ?? {};
      for (const key of REFERENCE_KEYS) {
        for (const ref of asList(frontmatter[key])) {
          if (!slugs.has(ref)) broken.push(`${String(frontmatter.slug)} → ${key}: ${ref}`);
        }
      }
    }
    expect(broken, `예시 볼트가 없는 슬러그를 가리킨다:\n${broken.join("\n")}`).toEqual([]);
  });

  it("uid 가 겹치지 않는다 — 겹치면 두 노드가 한 노드가 된다", () => {
    const uids = DOCS.map((doc) => doc.frontmatter?.uid).filter(
      (uid): uid is string => typeof uid === "string",
    );
    expect(uids.length, "uid 를 하나도 못 모았다").toBeGreaterThan(100);
    const seen = new Set<string>();
    const duplicates = uids.filter((uid) => (seen.has(uid) ? true : (seen.add(uid), false)));
    expect(duplicates, `uid 중복: ${duplicates.join(" · ")}`).toEqual([]);
  });

  /**
   * **예시가 제품이 드러내려는 것을 실제로 드러내는가.**
   *
   * 2026-08-09 소유자 지적의 뿌리가 이것이었다 — 도메인 구성비가 38~57% 로 거의
   * 평평해서, 「말은 많은데 증거가 얇은 영역」을 짚어 주는 막대가 데모에서는 할
   * 말이 없었다. 예시가 고르게 만들어져 있으면 **제품이 약해 보인다.**
   *
   * 값을 못박지 않고 **퍼짐**을 잰다 — 예시를 더 늘리거나 손봐도 퍼져 있기만 하면
   * 통과한다.
   */
  it("도메인 구성비가 퍼져 있다 — 평평한 예시는 제품을 약하게 보이게 한다", () => {
    const byDomain = new Map<string, { capability: number; element: number }>();
    for (const doc of DOCS) {
      const frontmatter = doc.frontmatter ?? {};
      const kind = frontmatter.kind;
      if (kind !== "capability" && kind !== "element") continue;
      for (const domain of asList(frontmatter.domain)) {
        const bucket = byDomain.get(domain) ?? { capability: 0, element: 0 };
        bucket[kind === "capability" ? "capability" : "element"] += 1;
        byDomain.set(domain, bucket);
      }
    }
    expect(byDomain.size, "도메인을 하나도 못 모았다").toBeGreaterThan(4);

    const ratios = [...byDomain.values()]
      .filter((b) => b.capability + b.element > 0)
      .map((b) => b.capability / (b.capability + b.element));
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(
      Number(spread.toFixed(2)),
      `구성비가 ${(Math.min(...ratios) * 100).toFixed(0)}%~${(Math.max(...ratios) * 100).toFixed(0)}% 로 뭉쳐 있다. ` +
        "예시가 고르면 도메인 막대가 데모에서 아무 말도 못 한다.",
    ).toBeGreaterThanOrEqual(0.4);
  });
});
