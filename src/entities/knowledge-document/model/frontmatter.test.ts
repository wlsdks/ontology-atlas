import { describe, expect, it } from "vitest";
import {
  buildKnowledgeMetadataPreview,
  parseKnowledgeFrontmatter,
  resolveKnowledgeCanonicalMetadata,
  resolveKnowledgeFormatScore,
} from "./frontmatter";

describe("parseKnowledgeFrontmatter", () => {
  it("extracts simple scalar and list values from markdown frontmatter", () => {
    const parsed = parseKnowledgeFrontmatter(`---
title: Auth Spec
kind: spec
projectIds:
  - reactor
  - iam
domain: authentication
capabilities:
  - login
  - session
elements:
  - auth-api
relates:
  - iam-policy
---
# Heading
body`);

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({
      title: "Auth Spec",
      kind: "spec",
      projectIds: ["reactor", "iam"],
      domain: "authentication",
      capabilities: ["login", "session"],
      elements: ["auth-api"],
      relates: ["iam-policy"],
    });
    expect(parsed.body).toContain("# Heading");
  });

  it("returns an empty frontmatter object when markdown has no header", () => {
    const parsed = parseKnowledgeFrontmatter("# Plain body");
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("# Plain body");
  });
});

describe("resolveKnowledgeCanonicalMetadata", () => {
  it("prefers frontmatter values over UI input", () => {
    const canonical = resolveKnowledgeCanonicalMetadata(
      {
        title: "UI Title",
        kind: "note",
        projectIds: ["aslan-maps"],
      },
      {
        title: "Frontmatter Title",
        kind: "spec",
        projectIds: ["reactor", "iam"],
      },
    );

    expect(canonical).toEqual({
      title: "Frontmatter Title",
      kind: "spec",
      projectIds: ["reactor", "iam"],
      source: "frontmatter",
    });
  });

  it("falls back to UI values when frontmatter is absent", () => {
    const canonical = resolveKnowledgeCanonicalMetadata(
      {
        title: "UI Title",
        kind: "note",
        projectIds: ["aslan-maps"],
      },
      {},
    );

    expect(canonical).toEqual({
      title: "UI Title",
      kind: "note",
      projectIds: ["aslan-maps"],
      source: "ui",
    });
  });
});

describe("buildKnowledgeMetadataPreview", () => {
  it("marks conflicts when UI values and frontmatter values diverge", () => {
    const rows = buildKnowledgeMetadataPreview(
      {
        title: "UI Title",
        kind: "note",
        projectIds: ["reactor"],
      },
      {
        title: "Frontmatter Title",
        kind: "spec",
        projectIds: ["iam"],
      },
    );

    expect(rows.every((row) => row.isConflict)).toBe(true);
  });
});

describe("resolveKnowledgeFormatScore", () => {
  it("rewards frontmatter that contains all canonical fields", () => {
    expect(
      resolveKnowledgeFormatScore({
        title: "Auth Spec",
        kind: "spec",
        projectIds: ["reactor"],
        domain: "authentication",
        capabilities: ["login"],
        elements: ["auth-api"],
        relates: ["iam-policy"],
      }),
    ).toBe(100);
  });
});
