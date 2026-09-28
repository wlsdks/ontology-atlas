import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { rankProjectMatches } from "./match-projects";

function project(input: Partial<Project> & { slug: string; name: string }): Project {
  return {
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-20T00:00:00Z"),
    ...input,
  } as Project;
}

const cart = project({ slug: "cart", name: "장바구니", description: "결제 전 담아 두는 곳" });

function scoreOf(query: string, projects: Project[] = [cart]): number | undefined {
  return rankProjectMatches(projects, query)[0]?.score;
}

describe("rankProjectMatches", () => {
  it("matches a decomposed query and a decomposed name as if composed", () => {
    expect(scoreOf("장바구니".normalize("NFD"))).toBe(7);
    expect(scoreOf("장바구니", [project({ slug: "cart", name: "장바구니".normalize("NFD") })])).toBe(7);
    expect(scoreOf("결제".normalize("NFD"))).toBe(2);
  });

  it("matches consonant initials alone", () => {
    expect(scoreOf("ㅈㅂㄱㄴ")).toBe(4);
    expect(scoreOf("ㅂㄱ")).toBe(3);
  });

  it("matches a half-typed last syllable from either keyboard layout", () => {
    expect(scoreOf("장바ㄱ")).toBe(4);
    expect(scoreOf("장박")).toBe(4);
    expect(scoreOf("장바군")).toBe(4);
  });

  it("ranks names 7 to 5, descriptive fields 2 and the slug 1, best first", () => {
    const ranked = rankProjectMatches(
      [
        project({ slug: "by-slug-store", name: "Alpha" }),
        project({ slug: "by-stack", name: "Beta", stack: ["Store Kit"] }),
        project({ slug: "by-substring", name: "Online Store" }),
        project({ slug: "by-exact", name: "Store" }),
        project({ slug: "by-prefix", name: "Storefront" }),
      ],
      "store",
    );
    expect(ranked.map((m) => [m.project.slug, m.score])).toEqual([
      ["by-exact", 7],
      ["by-prefix", 6],
      ["by-substring", 5],
      ["by-stack", 2],
      ["by-slug-store", 1],
    ]);
  });

  it("names the project field that carried each match", () => {
    const full = project({
      slug: "shop-api",
      name: "쇼핑몰",
      nameEn: "Shop",
      description: "Sells parcels",
      tags: ["retail"],
      stack: ["Next.js"],
      category: "commerce",
    });
    const sourceOf = (query: string) => rankProjectMatches([full], query)[0];
    expect(sourceOf("shop")).toMatchObject({ source: "nameEn", field: "name", text: "Shop" });
    expect(sourceOf("parcel")).toMatchObject({ source: "description", field: "summary" });
    expect(sourceOf("retail")).toMatchObject({ source: "tags", field: "summary", text: "retail" });
    expect(sourceOf("next")).toMatchObject({ source: "stack", field: "summary", text: "Next.js" });
    expect(sourceOf("commerce")).toMatchObject({ source: "category", field: "summary" });
    expect(sourceOf("api")).toMatchObject({ source: "slug", field: "id", text: "shop-api" });
    expect(sourceOf("쇼핑")).toMatchObject({ source: "name", field: "name", text: "쇼핑몰" });
  });

  it("breaks a score tie by the most recently updated project", () => {
    const older = project({ slug: "older", name: "Store A", updatedAt: new Date("2026-04-01T00:00:00Z") });
    const newer = project({ slug: "newer", name: "Store B", updatedAt: new Date("2026-04-02T00:00:00Z") });
    expect(rankProjectMatches([older, newer], "store").map((m) => m.project.slug)).toEqual(["newer", "older"]);
  });

  it("returns no matches for an empty query", () => {
    expect(rankProjectMatches([cart], "   ")).toEqual([]);
  });
});
