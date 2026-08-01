import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 기본 샘플(예시 쇼핑몰)에서 **공방 스펙이 쓸 노드 하나**를 매니페스트에서
 * 유도한다.
 *
 * ## 왜 이름을 박지 않는가
 *
 * 이 스펙들은 오랫동안 `capability:order-create` 를 박고 있었다. 2026-08-01 에
 * 샘플 볼트를 규격대로 재생성하자 그 노드가 사라져 다섯 스펙이 한꺼번에
 * 죽었는데, **제품 결함은 0건**이었다 — 스펙이 재는 것은 「주문 생성이 열리는가」
 * 가 아니라 「딥링크가 도착하고, 위성이 걸어가고, 소켓을 채울 수 있는가」다.
 * 대상은 조건만 맞으면 아무 역량이나 되면 되고, 결정론만 있으면 된다.
 * 선례: `tests/e2e/topology-v2-smoke.spec.ts`.
 *
 * ## 조건
 *
 * 공방은 관계 종류를 고정 방위에 놓는다(UP=is_a · DOWN=contains · RIGHT=depends
 * · LEFT=relates). 그래서 스펙이 필요로 하는 것은 둘이다:
 *   - **RIGHT 위성이 하나는 있다** → `dependencies:` 가 비어 있지 않다
 *   - **빈 소켓이 하나는 있다** → 네 축 중 하나는 비어 있다
 * 둘 다 만족하는 역량 중 슬러그순 첫 번째를 고른다.
 */
function pickStorefrontCapability(): string {
  const manifestPath = path.resolve(
    __dirname,
    "../../src/entities/docs-vault/data/sample-storefront.manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    docs: Array<{ slug: string; frontmatter?: Record<string, unknown> }>;
  };

  const nonEmpty = (value: unknown) => Array.isArray(value) && value.length > 0;

  const candidates = manifest.docs
    .filter((doc) => doc.frontmatter?.kind === "capability")
    .filter((doc) => nonEmpty(doc.frontmatter?.dependencies))
    // 네 축 중 하나라도 비어야 채울 소켓이 생긴다.
    .filter((doc) =>
      ["broader", "elements", "relates"].some((key) => !nonEmpty(doc.frontmatter?.[key])),
    )
    .map((doc) => doc.slug.split("/").pop() as string)
    .sort();

  if (candidates.length === 0) {
    throw new Error(
      "샘플 매니페스트에 dependencies 를 가진 역량이 없다 — 볼트나 생성기가 깨졌다",
    );
  }
  // 지도·공방의 노드 id 는 `<kind>:<이름>` 이다 (볼트 슬러그의 `capabilities/` 접두와 다름).
  return `capability:${candidates[0]}`;
}

/** 공방 딥링크가 쓸 노드 id — 예: `capability:account-closure`. */
export const STOREFRONT_STUDIO_NODE_ID = pickStorefrontCapability();

/** `?node=` 에 그대로 넣을 수 있게 인코딩한 값. */
export const STOREFRONT_STUDIO_NODE_PARAM = encodeURIComponent(STOREFRONT_STUDIO_NODE_ID);
