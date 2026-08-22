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

/**
 * The static-mode fallback (15 `SEED_PROJECTS`) was removed. Those seeds described **already-removed
 * features as fact** (Firebase Hosting, Sigma/WebGL, a whitelist admin), and since `/project/[slug]`
 * routes are generated from the vault those slugs were unreachable to begin with. Better to say "it does
 * not exist" than to describe a product that does not.
 */
describe("resolveSubscribeUpdate", () => {
  it("현재 목록에 slug 가 없으면 next=null — 호출부의 not-found 상태가 뜬다", () => {
    const result = resolveSubscribeUpdate([makeProject("other", "Other")], "iam");
    expect(result.next).toBeNull();
  });

  it("현재 목록에 slug 가 있으면 그 프로젝트를 돌려준다", () => {
    const freshIam = makeProject("iam", "IAM fresh");
    const result = resolveSubscribeUpdate([freshIam], "iam");
    expect(result.next).toBe(freshIam);
  });

  it("목록이 비면 related 도 빈 배열 — 시드 데이터로 채우지 않는다", () => {
    const result = resolveSubscribeUpdate([], "iam");
    expect(result.next).toBeNull();
    expect(result.related).toEqual([]);
  });

  it("related 는 항상 현재 목록 그대로 — 두 진실원을 섞지 않는다", () => {
    const list = [makeProject("iam", "IAM"), makeProject("reactor", "Reactor")];
    const result = resolveSubscribeUpdate(list, "iam");
    expect(result.related).toBe(list);
  });
});
