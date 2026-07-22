import { describe, expect, it } from "vitest";
import { buildOntologyBuilderNodeHrefFromGraphId } from "@/entities/knowledge-graph";
import { resolveBuilderQueryNodeSlug } from "./resolve-builder-query-node";

const docs = [
  {
    slug: "ontology/capabilities/topology-analysis-modes",
    frontmatter: { slug: "capabilities/topology-analysis-modes" },
  },
  {
    slug: "domains/views",
    frontmatter: { slug: "domains/views" },
  },
];

describe("resolveBuilderQueryNodeSlug", () => {
  it("keeps exact live-vault slugs", () => {
    expect(resolveBuilderQueryNodeSlug("domains/views", docs)).toBe("domains/views");
  });

  it("maps dogfood docs-vault slugs from canonical vault slugs", () => {
    expect(
      resolveBuilderQueryNodeSlug("capabilities/topology-analysis-modes", docs),
    ).toBe("ontology/capabilities/topology-analysis-modes");
  });

  it("accepts already-prefixed dogfood docs-vault slugs", () => {
    expect(
      resolveBuilderQueryNodeSlug(
        "ontology/capabilities/topology-analysis-modes",
        docs,
      ),
    ).toBe("ontology/capabilities/topology-analysis-modes");
  });

  // H5 URL 계약: canonical `<kind>:<slug>` 를 1급으로 받는다.
  it("accepts canonical `<kind>:<slug>` ids for live-vault nodes", () => {
    expect(resolveBuilderQueryNodeSlug("domain:views", docs)).toBe("domains/views");
  });

  it("accepts canonical `<kind>:<slug>` ids for dogfood nodes", () => {
    expect(
      resolveBuilderQueryNodeSlug("capability:topology-analysis-modes", docs),
    ).toBe("ontology/capabilities/topology-analysis-modes");
  });

  it("returns null for unknown or empty query nodes", () => {
    expect(resolveBuilderQueryNodeSlug("missing/node", docs)).toBeNull();
    expect(resolveBuilderQueryNodeSlug("unknown:node", docs)).toBeNull();
    expect(resolveBuilderQueryNodeSlug("", docs)).toBeNull();
    expect(resolveBuilderQueryNodeSlug(null, docs)).toBeNull();
  });
});

// 왕복 계약(H5 item 4): 발신부(`buildOntologyBuilderNodeHrefFromGraphId`, 인사이트·
// 팝오버가 쓰는 canonical 링크 빌더)가 만든 `?node=` 값을 수신부가 다시 doc 으로
// 풀어낸다. 두 끝이 같은 문법으로 만나는지 한 테스트로 못 박는다.
describe("builder deep-link round trip (canonical)", () => {
  function nodeParamFromHref(href: string): string {
    const query = href.slice(href.indexOf("?") + 1);
    return decodeURIComponent(new URLSearchParams(query).get("node") ?? "");
  }

  it("insights/popover canonical link resolves back to the dogfood doc", () => {
    const href = buildOntologyBuilderNodeHrefFromGraphId(
      "capability:topology-analysis-modes",
    );
    expect(href).toContain(
      encodeURIComponent("capability:topology-analysis-modes"),
    );
    expect(resolveBuilderQueryNodeSlug(nodeParamFromHref(href), docs)).toBe(
      "ontology/capabilities/topology-analysis-modes",
    );
  });

  it("canonical link resolves back to the live-vault doc", () => {
    const href = buildOntologyBuilderNodeHrefFromGraphId("domain:views");
    expect(resolveBuilderQueryNodeSlug(nodeParamFromHref(href), docs)).toBe(
      "domains/views",
    );
  });

  it("legacy plural-slash `?node=` alias still resolves (기존 공유 링크 하위호환)", () => {
    expect(
      resolveBuilderQueryNodeSlug("capabilities/topology-analysis-modes", docs),
    ).toBe("ontology/capabilities/topology-analysis-modes");
    expect(resolveBuilderQueryNodeSlug("domains/views", docs)).toBe("domains/views");
  });
});
