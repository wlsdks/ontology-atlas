import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import {
  countMarkdownFiles,
  dogfoodVaultCensus,
  dogfoodVaultCensusFromDocs,
  dogfoodVaultGraphSummary,
} from "./vault-census.mjs";

function withTempDir(fn) {
  const root = mkdtempSync(join(tmpdir(), "ontology-atlas-vault-census-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("vault-census", () => {
  it("counts markdown files recursively and ignores non-markdown files", () => {
    withTempDir((root) => {
      mkdirSync(join(root, "nested"), { recursive: true });
      writeFileSync(join(root, "README.md"), "# Root\n");
      writeFileSync(join(root, "nested", "node.md"), "# Node\n");
      writeFileSync(join(root, "nested", "notes.txt"), "not ontology\n");

      assert.equal(countMarkdownFiles(root), 2);
    });
  });

  it("counts a single markdown file path and ignores a non-markdown file path", () => {
    withTempDir((root) => {
      const markdown = join(root, "node.md");
      const text = join(root, "node.txt");
      writeFileSync(markdown, "# Node\n");
      writeFileSync(text, "not ontology\n");

      assert.equal(countMarkdownFiles(markdown), 1);
      assert.equal(countMarkdownFiles(text), 0);
    });
  });

  it("treats missing folders as empty", () => {
    withTempDir((root) => {
      assert.equal(countMarkdownFiles(join(root, "missing")), 0);
      assert.deepEqual(dogfoodVaultCensus(root), {
        files: 0,
        total: 0,
        byKind: {
          capabilities: 0,
          document: 0,
          domains: 0,
          elements: 0,
          project: 0,
          "vault-readme": 0,
        },
      });
    });
  });

  it("derives the dogfood vault census from frontmatter kinds", () => {
    withTempDir((root) => {
      const ontology = join(root, "docs", "ontology");
      mkdirSync(join(ontology, "domains"), { recursive: true });
      mkdirSync(join(ontology, "capabilities"), { recursive: true });
      mkdirSync(join(ontology, "elements"), { recursive: true });
      writeFileSync(join(ontology, "README.md"), "---\nkind: vault-readme\n---\n# Vault\n");
      writeFileSync(join(ontology, "project.md"), "---\nkind: project\n---\n# Project\n");
      writeFileSync(join(ontology, "domains", "auth.md"), "---\nkind: domain\n---\n# Auth\n");
      writeFileSync(join(ontology, "capabilities", "login.md"), "---\nkind: capability\n---\n# Login\n");
      writeFileSync(join(ontology, "elements", "token.md"), "---\nkind: element\n---\n# Token\n");

      assert.deepEqual(dogfoodVaultCensus(root), {
        files: 5,
        total: 5,
        byKind: {
          capabilities: 1,
          document: 0,
          domains: 1,
          elements: 1,
          project: 1,
          "vault-readme": 1,
        },
      });
    });
  });

  it("counts frontmatter kind rather than folder placement", () => {
    withTempDir((root) => {
      const ontology = join(root, "docs", "ontology");
      mkdirSync(join(ontology, "capabilities"), { recursive: true });
      writeFileSync(join(ontology, "capabilities", "misplaced-domain.md"), "---\nkind: domain\n---\n# Misplaced\n");
      writeFileSync(join(ontology, "capabilities", "no-kind.md"), "# No kind\n");

      assert.deepEqual(dogfoodVaultCensus(root), {
        files: 2,
        total: 1,
        byKind: {
          capabilities: 0,
          document: 0,
          domains: 1,
          elements: 0,
          project: 0,
          "vault-readme": 0,
        },
      });
    });
  });

  it("derives the dogfood vault census from already loaded docs", () => {
    const docs = [
      { frontmatter: { kind: "capability" } },
      { frontmatter: { kind: "domain" } },
      { frontmatter: { kind: "element" } },
      { frontmatter: { kind: "project" } },
      { frontmatter: { kind: "vault-readme" } },
      { frontmatter: { kind: "note" } },
    ];

    assert.deepEqual(dogfoodVaultCensusFromDocs(docs), {
      files: 6,
      total: 5,
      byKind: {
        capabilities: 1,
        document: 0,
        domains: 1,
        elements: 1,
        project: 1,
        "vault-readme": 1,
      },
    });
  });

  it("ignores loaded docs without frontmatter instead of throwing", () => {
    const docs = [
      { frontmatter: { kind: "capability" } },
      {},
      null,
      { frontmatter: null },
    ];

    assert.deepEqual(dogfoodVaultCensusFromDocs(docs), {
      files: 4,
      total: 1,
      byKind: {
        capabilities: 1,
        document: 0,
        domains: 0,
        elements: 0,
        project: 0,
        "vault-readme": 0,
      },
    });
  });

  it("treats non-array loaded docs and invalid file counts as empty", () => {
    assert.deepEqual(dogfoodVaultCensusFromDocs(null), {
      files: 0,
      total: 0,
      byKind: {
        capabilities: 0,
        document: 0,
        domains: 0,
        elements: 0,
        project: 0,
        "vault-readme": 0,
      },
    });

    assert.deepEqual(dogfoodVaultCensusFromDocs([{ frontmatter: { kind: "domain" } }], -1), {
      files: 1,
      total: 1,
      byKind: {
        capabilities: 0,
        document: 0,
        domains: 1,
        elements: 0,
        project: 0,
        "vault-readme": 0,
      },
    });
  });
});

describe("dogfoodVaultGraphSummary", () => {
  const docs = [
    {
      frontmatter: {
        kind: "project",
        slug: "atlas",
        title: "Atlas",
        domains: ["auth", "billing"],
      },
    },
    {
      frontmatter: {
        kind: "domain",
        slug: "domains/auth",
        title: "Auth",
        capabilities: ["login", "capabilities/session"],
        elements: ["token-store"],
        relates: ["domains/billing"],
      },
    },
    {
      frontmatter: {
        kind: "domain",
        slug: "domains/billing",
        title: "Billing",
        capabilities: ["invoice"],
        relates: ["auth", "not-a-domain"],
      },
    },
    {
      frontmatter: {
        kind: "capability",
        slug: "capabilities/login",
        title: "Login",
        relates: ["capabilities/session"],
      },
    },
    {
      frontmatter: {
        kind: "capability",
        slug: "capabilities/session",
        title: "Session",
      },
    },
    {
      frontmatter: {
        kind: "capability",
        slug: "capabilities/invoice",
        title: "Invoice",
      },
    },
    { frontmatter: { kind: "element", slug: "elements/token-store", title: "Token Store" } },
    { frontmatter: { kind: "vault-readme", slug: "README", title: "Vault" } },
    { frontmatter: { kind: "note", slug: "scratch", title: "Scratch" } },
    null,
  ];

  it("counts concept nodes excluding vault-readme and unknown kinds", () => {
    const summary = dogfoodVaultGraphSummary(docs);
    // project 1 + domain 2 + capability 3 + element 1 = 7
    assert.equal(summary.concepts, 7);
  });

  it("counts containment and typed relation entries as relations", () => {
    const summary = dogfoodVaultGraphSummary(docs);
    // project.domains 2 + auth(capabilities 2 + elements 1 + relates 1)
    // + billing(capabilities 1 + relates 2) + login.relates 1 = 10
    assert.equal(summary.relations, 10);
  });

  it("lists domains with normalized slugs sorted alphabetically", () => {
    const summary = dogfoodVaultGraphSummary(docs);
    assert.deepEqual(summary.domains, [
      { slug: "auth", title: "Auth" },
      { slug: "billing", title: "Billing" },
    ]);
  });

  it("keeps only undirected deduped relates pairs between real domains", () => {
    const summary = dogfoodVaultGraphSummary(docs);
    // auth→billing and billing→auth collapse to one pair; "not-a-domain" dropped.
    assert.deepEqual(summary.domainRelates, [["auth", "billing"]]);
  });

  it("picks the most referenced capability as the hub with its owning domain", () => {
    const summary = dogfoodVaultGraphSummary(docs);
    // session referenced by auth.capabilities + login.relates = 2;
    // login and invoice referenced once each. auth contains session.
    assert.deepEqual(summary.hub, { slug: "session", title: "Session", domain: "auth" });
  });

  it("returns an empty summary for non-array input", () => {
    assert.deepEqual(dogfoodVaultGraphSummary(null), {
      concepts: 0,
      relations: 0,
      domains: [],
      domainRelates: [],
      hub: null,
    });
  });
});
