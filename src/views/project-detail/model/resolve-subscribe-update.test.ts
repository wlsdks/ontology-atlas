import { describe, expect, it } from "vitest";
import type { Project } from "@/entities/project";
import { resolveSubscribeUpdate } from "./resolve-subscribe-update";

function makeProject(slug: string, name: string): Project {
  const now = new Date("2026-04-22T00:00:00Z");
  return {
    slug,
    name,
    category: "in-progress",
    status: "developing",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

describe("resolveSubscribeUpdate", () => {
  const iam = makeProject("iam", "IAM");
  const reactor = makeProject("reactor", "Reactor");
  const fallback = [iam, reactor];

  it("returns next=null when subscribe list does not contain slug", () => {
    // regression: 비로그인·데모 세션 으로 인해 구독한 스코프에 iam
    // 이 없으면 next 가 null 이 되어 호출측이 setProject 를 건너뛴다.
    const result = resolveSubscribeUpdate(
      [makeProject("other", "Other")],
      "iam",
      fallback,
    );
    expect(result.next).toBeNull();
  });

  it("returns project when subscribe list contains slug", () => {
    const freshIam = makeProject("iam", "IAM fresh");
    const result = resolveSubscribeUpdate([freshIam], "iam", fallback);
    expect(result.next).toBe(freshIam);
  });

  it("falls back to fallbackProjects for related when latest is empty", () => {
    const result = resolveSubscribeUpdate([], "iam", fallback);
    expect(result.related).toBe(fallback);
    // fallback 에 iam 이 있으므로 next 는 fallback 의 iam 이 돼야 한다.
    expect(result.next).toBe(iam);
  });

  it("uses latest for related when latest is non-empty (even if slug missing)", () => {
    const latest = [makeProject("other", "Other")];
    const result = resolveSubscribeUpdate(latest, "iam", fallback);
    expect(result.related).toBe(latest);
    expect(result.next).toBeNull();
  });

  it("prefers latest over fallback when both contain the slug", () => {
    const freshIam = makeProject("iam", "IAM fresh");
    const result = resolveSubscribeUpdate([freshIam], "iam", fallback);
    expect(result.next?.name).toBe("IAM fresh");
  });
});
