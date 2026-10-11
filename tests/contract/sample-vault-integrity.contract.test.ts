import { describe, expect, it } from "vitest";

import manifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";

/**
 * The sample vault is the only data a first-time visitor sees, and `pnpm vault:validate` scans
 * only the dogfood vault. The generated manifest is read so source and parser are checked together.
 */

interface SampleDoc {
  frontmatter?: Record<string, unknown>;
}

const DOCS = (manifest as { docs?: SampleDoc[] }).docs ?? [];

/** Frontmatter keys that point at slugs — one pointing nowhere breaks the graph. */
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
   * Measures the spread of domain composition ratios rather than pinning a value: an evenly built
   * sample leaves nothing to point out in the demo.
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
      `The shares are bunched between ${(Math.min(...ratios) * 100).toFixed(0)}% and ${(Math.max(...ratios) * 100).toFixed(0)}%. ` +
        "When the sample is this even, the domain bars say nothing in the demo.",
    ).toBeGreaterThanOrEqual(0.4);
  });
});
