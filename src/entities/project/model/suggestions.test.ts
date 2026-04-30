import { describe, expect, it } from "vitest";
import { computeSuggestedDependencies } from "./suggestions";
import type { Project } from "./types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "root",
    name: "Root",
    category: "platform",
    status: "live",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("computeSuggestedDependencies", () => {
  it("description 안의 다른 프로젝트 이름을 찾아 제안한다", () => {
    const current = makeProject({
      slug: "checkout-api",
      name: "Checkout API",
      description: "IAM Core 와 Payment Gateway 를 연동합니다.",
    });
    const candidates: Project[] = [
      makeProject({ slug: "iam-core", name: "IAM Core" }),
      makeProject({ slug: "payment-gateway", name: "Payment Gateway" }),
      makeProject({ slug: "unrelated", name: "Unrelated" }),
    ];

    const result = computeSuggestedDependencies(current, candidates);

    expect(result.map((r) => r.slug)).toEqual(["iam-core", "payment-gateway"]);
  });

  it("이미 dependencies 에 있는 프로젝트는 제외한다", () => {
    const current = makeProject({
      slug: "checkout-api",
      description: "IAM Core 와 Payment Gateway 를 씁니다.",
      dependencies: ["iam-core"],
    });
    const candidates: Project[] = [
      makeProject({ slug: "iam-core", name: "IAM Core" }),
      makeProject({ slug: "payment-gateway", name: "Payment Gateway" }),
    ];

    const result = computeSuggestedDependencies(current, candidates);

    expect(result.map((r) => r.slug)).toEqual(["payment-gateway"]);
  });

  it("자기 자신은 후보에서 제외한다", () => {
    const current = makeProject({
      slug: "self-ref",
      name: "Self Ref",
      description: "Self Ref 자기 자신 언급.",
    });
    const candidates: Project[] = [makeProject({ slug: "self-ref", name: "Self Ref" })];

    expect(computeSuggestedDependencies(current, candidates)).toEqual([]);
  });

  it("detail (markdown) 텍스트도 검사한다", () => {
    const current = makeProject({
      slug: "app",
      description: "설명.",
      detail: "내부적으로 Ingest Worker 를 호출합니다.",
    });
    const candidates: Project[] = [
      makeProject({ slug: "ingest-worker", name: "Ingest Worker" }),
    ];

    const result = computeSuggestedDependencies(current, candidates);
    expect(result.map((r) => r.slug)).toEqual(["ingest-worker"]);
  });

  it("이름이 2자 이하인 프로젝트는 매칭 대상에서 제외한다 (오검출 방지)", () => {
    const current = makeProject({
      slug: "consumer",
      description: "AI 와 UI 를 개선했습니다.",
    });
    const candidates: Project[] = [
      makeProject({ slug: "ai", name: "AI" }),
      makeProject({ slug: "ui", name: "UI" }),
    ];

    expect(computeSuggestedDependencies(current, candidates)).toEqual([]);
  });

  it("영문 이름은 단어 경계 기준으로 매칭한다 (부분 매칭 방지)", () => {
    const current = makeProject({
      slug: "consumer",
      description: "We use Stripe for payments.",
    });
    const candidates: Project[] = [
      // "Strip" 이 Stripe 안에 포함돼도 매칭되면 안 됨
      makeProject({ slug: "strip", name: "Strip" }),
      makeProject({ slug: "stripe", name: "Stripe" }),
    ];

    const result = computeSuggestedDependencies(current, candidates);
    expect(result.map((r) => r.slug)).toEqual(["stripe"]);
  });

  it("영문 매칭은 대소문자 무시", () => {
    const current = makeProject({
      description: "we rely on stripe.",
    });
    const candidates: Project[] = [makeProject({ slug: "stripe", name: "Stripe" })];

    expect(computeSuggestedDependencies(current, candidates).map((r) => r.slug)).toEqual([
      "stripe",
    ]);
  });

  it("nameEn 도 매칭 대상에 포함한다", () => {
    const current = makeProject({
      description: "connects to Payment Gateway service",
    });
    const candidates: Project[] = [
      makeProject({
        slug: "pg",
        name: "결제 게이트웨이",
        nameEn: "Payment Gateway",
      }),
    ];

    expect(computeSuggestedDependencies(current, candidates).map((r) => r.slug)).toEqual([
      "pg",
    ]);
  });

  it("중복 매칭을 제거하고 slug 기준 1회만 반환한다", () => {
    const current = makeProject({
      description: "IAM Core 는 중요합니다. IAM Core 를 통해 인증.",
    });
    const candidates: Project[] = [makeProject({ slug: "iam-core", name: "IAM Core" })];

    const result = computeSuggestedDependencies(current, candidates);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("iam-core");
  });

  it("발견된 문맥 excerpt 을 함께 반환한다", () => {
    const current = makeProject({
      description: "우리는 IAM Core 로 인증합니다. 문장 계속.",
    });
    const candidates: Project[] = [makeProject({ slug: "iam-core", name: "IAM Core" })];

    const [first] = computeSuggestedDependencies(current, candidates);
    expect(first.excerpt).toContain("IAM Core");
  });
});
