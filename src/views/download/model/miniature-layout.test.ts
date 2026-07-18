import { describe, expect, it } from "vitest";
import { buildMiniatureLayout } from "./miniature-layout";

const census = {
  domains: [
    { slug: "auth", title: "Auth" },
    { slug: "billing", title: "Billing" },
    { slug: "views", title: "Views" },
  ],
  domainRelates: [["auth", "billing"]],
  hub: { slug: "session", title: "Session", domain: "auth" },
};

describe("buildMiniatureLayout", () => {
  it("places the project plate at the canvas center", () => {
    const layout = buildMiniatureLayout(census);
    expect(layout.project.x).toBe(layout.width / 2);
    expect(layout.project.y).toBe(layout.height / 2);
  });

  it("spreads domain chips evenly on a ring around the project", () => {
    const layout = buildMiniatureLayout(census);
    expect(layout.domains).toHaveLength(3);
    const distances = layout.domains.map((d) =>
      Math.hypot(d.x - layout.project.x, d.y - layout.project.y),
    );
    for (const distance of distances) {
      expect(distance).toBeCloseTo(distances[0], 6);
    }
    // 첫 칩은 -60° (오른쪽 위) — 정북/정남 라벨 레인을 비우는 결정적 배치.
    expect(layout.domains[0].x).toBeGreaterThan(layout.project.x);
    expect(layout.domains[0].y).toBeLessThan(layout.project.y);
  });

  it("maps relates pairs onto the matching chip coordinates", () => {
    const layout = buildMiniatureLayout(census);
    expect(layout.relates).toHaveLength(1);
    const [edge] = layout.relates;
    const auth = layout.domains.find((d) => d.slug === "auth")!;
    const billing = layout.domains.find((d) => d.slug === "billing")!;
    expect(edge).toEqual({ x1: auth.x, y1: auth.y, x2: billing.x, y2: billing.y });
  });

  it("drops relates pairs that reference unknown domains", () => {
    const layout = buildMiniatureLayout({
      ...census,
      domainRelates: [["auth", "ghost"]],
    });
    expect(layout.relates).toHaveLength(0);
  });

  it("anchors the hub outward from its owning domain chip", () => {
    const layout = buildMiniatureLayout(census);
    const auth = layout.domains.find((d) => d.slug === "auth")!;
    expect(layout.hub).not.toBeNull();
    const hub = layout.hub!;
    expect(hub.slug).toBe("session");
    expect(hub.anchor).toEqual({ x: auth.x, y: auth.y });
    // colinear: 허브는 project→domain 방향의 연장선 위, 칩 밖.
    const domainDistance = Math.hypot(auth.x - layout.project.x, auth.y - layout.project.y);
    const hubDistance = Math.hypot(hub.x - layout.project.x, hub.y - layout.project.y);
    expect(hubDistance).toBeGreaterThan(domainDistance);
  });

  it("omits the hub when the census has none or the owning domain is unknown", () => {
    expect(buildMiniatureLayout({ ...census, hub: null }).hub).toBeNull();
    expect(
      buildMiniatureLayout({
        ...census,
        hub: { slug: "x", title: "X", domain: "ghost" },
      }).hub,
    ).toBeNull();
  });

  it("returns an empty ring for a domainless census", () => {
    const layout = buildMiniatureLayout({ domains: [], domainRelates: [], hub: null });
    expect(layout.domains).toEqual([]);
    expect(layout.relates).toEqual([]);
    expect(layout.hub).toBeNull();
  });
});
