import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import {
  countMarkdownFiles,
  dogfoodVaultCensus,
  dogfoodVaultCensusFromDocs,
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
        domains: 1,
        elements: 0,
        project: 0,
        "vault-readme": 0,
      },
    });
  });
});
