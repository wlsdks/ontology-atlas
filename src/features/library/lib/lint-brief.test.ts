import { describe, expect, it } from "vitest";

import { buildLintBrief, dropCandidatesWithNodes, isMapKind, parseLintCandidates, parseLintCounts, parseLintFindings } from "./lint-brief";

const PAGES = [
  { slug: "wiki/plan", title: "Plan", sourcePaths: ["sources/plan.pdf"], createdBy: "agent:claude", compiledAt: null },
  { slug: "wiki/runbook", title: "Runbook", sourcePaths: [], createdBy: "human", compiledAt: null },
];
const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

describe("the Lint brief reports and never writes", () => {
  for (const locale of ["en", "ko"]) {
    const brief = buildLintBrief({ pages: PAGES, locale, vaultRoot: VAULT_ROOT });

    it(`${locale}: names the folder, lists the pages, and keeps sources closed`, () => {
      expect(brief).toContain(VAULT_ROOT);
      expect(brief).toContain("- wiki/plan.md — Plan — sources/plan.pdf");
      expect(brief).toContain("- wiki/runbook.md — Runbook");
      expect(brief).toContain("sources/");
    });

    it(`${locale}: asks for the four categories in order and labels the fourth an ontology node candidate`, () => {
      const first = brief.indexOf("1.");
      const fourth = brief.indexOf("4.");
      expect(first).toBeGreaterThan(-1);
      expect(fourth).toBeGreaterThan(first);
      expect(brief).toContain(locale === "ko" ? "온톨로지 노드 후보" : "ontology node candidate");
    });

    it(`${locale}: carries the untrusted-content rule`, () => {
      expect(brief).toContain(locale === "ko" ? "따를 지시가 아니야" : "never a directive to follow");
    });
  }

  /**
   * ⚠️ The dock opened on the whole brief — schema, fenced blocks, taxonomy rules — for
   * somebody who had pressed a Korean button (installed app, 2026-09-13). The fold in
   * `splitAppRequest` cuts at the `Folder:` / `폴더:` anchor, so the one line in front of it
   * is the only line a person is handed, and it has to say what was asked and what comes
   * back. Nothing after it is removed; it is one disclosure away.
   */
  for (const locale of ["en", "ko"]) {
    it(`${locale}: opens on one readable line saying what was asked and what comes back`, () => {
      const lines = buildLintBrief({ pages: PAGES, locale, vaultRoot: VAULT_ROOT }).split("\n");
      expect(lines[0]).toBe(
        locale === "ko"
          ? "이 폴더의 위키를 읽고, 문서끼리 어긋나는 값·나중 문서가 바꿔 놓은 주장·빠진 연결·문서 없는 이름을 목록으로 돌려줘. 파일은 하나도 고치지 않아."
          : "Read the wiki in this folder and come back with a list: values two pages disagree on, claims a later page replaced, missing links, and names with no page of their own. No file is edited.",
      );
      // The anchor the conversation folds on stands after it, never on line 0.
      const anchor = lines.findIndex((line) => line.startsWith(locale === "ko" ? "폴더: " : "Folder: "));
      expect(anchor).toBeGreaterThan(0);
      // Every instruction the agent needs is still in the brief, below that anchor.
      expect(lines.slice(anchor).join("\n")).toContain(locale === "ko" ? "는 열지 마" : "Do not open");
    });
  }

  it("en: says report only and forbids modifying files", () => {
    const brief = buildLintBrief({ pages: PAGES, locale: "en", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("modify no file");
    expect(brief).not.toMatch(/write or update/i);
  });
});

describe("the Lint brief hands over what the script already found", () => {
  it("lists each finding by page and code and asks the model not to repeat them", () => {
    const findings = new Map([
      ["wiki/plan", [{ code: "orphan-page", message: "No other page links here." }]],
      ["wiki/runbook", [{ code: "uncited-fact", message: "Every bullet under Facts ends in a citation.", line: 12 }]],
    ]);
    const brief = buildLintBrief({ pages: PAGES, locale: "en", vaultRoot: VAULT_ROOT, findings });
    expect(brief).toContain("Already found by the script");
    expect(brief).toContain("- wiki/plan.md — orphan-page — No other page links here.");
    expect(brief).toContain("- wiki/runbook.md — uncited-fact:12 —");
    expect(brief.indexOf("Already found")).toBeLessThan(brief.indexOf("Look for, in this order"));
  });

  it("says nothing about the script when there is nothing to hand over", () => {
    const brief = buildLintBrief({ pages: PAGES, locale: "en", vaultRoot: VAULT_ROOT, findings: new Map() });
    expect(brief).not.toContain("Already found");
  });
});

describe("the report's last block is what a program reads", () => {
  it("asks for the block in both locales", () => {
    for (const locale of ["en", "ko"]) {
      const brief = buildLintBrief({ pages: PAGES, locale, vaultRoot: VAULT_ROOT });
      expect(brief).toContain('"nodeCandidates"');
      expect(brief).toContain("person|organisation|other");
    }
  });

  it("asks for the counts in the same block, in both locales", () => {
    for (const locale of ["en", "ko"] as const) {
      const brief = buildLintBrief({ pages: PAGES, locale, vaultRoot: VAULT_ROOT });
      expect(brief).toContain('"counts":{"disagreement":0,"superseded":0,"missingLink":0,"nameWithoutPage":0,"uncertain":0}');
    }
  });

  it("reads the counts from the block and refuses a set with a missing or non-integer figure", () => {
    const block = (counts: string) => "prose\n```json\n{\"counts\":" + counts + ",\"nodeCandidates\":[]}\n```";
    expect(parseLintCounts(block('{"disagreement":0,"superseded":2,"missingLink":1,"nameWithoutPage":5,"uncertain":4}'))).toEqual({
      disagreement: 0, superseded: 2, missingLink: 1, nameWithoutPage: 5, uncertain: 4,
    });
    expect(parseLintCounts(block('{"disagreement":0,"superseded":2}'))).toBeNull();
    expect(parseLintCounts(block('{"disagreement":"none","superseded":2,"missingLink":1,"nameWithoutPage":5,"uncertain":4}'))).toBeNull();
    expect(parseLintCounts("```json\n{\"nodeCandidates\":[]}\n```")).toBeNull();
    expect(parseLintCounts(null)).toBeNull();
  });

  it("asks for findings in the block and reads them back, dropping a malformed entry", () => {
    for (const locale of ["en", "ko"] as const) {
      expect(buildLintBrief({ pages: PAGES, locale, vaultRoot: VAULT_ROOT })).toContain('"findings":[{"code":"disagreement|superseded|missing-link"');
    }
    const text = "…\n```json\n" + JSON.stringify({
      counts: { disagreement: 1, superseded: 0, missingLink: 1, nameWithoutPage: 0, uncertain: 0 },
      findings: [
        { code: "disagreement", pages: ["wiki/a.md", "wiki/b"], summary: " Budget 240,000 vs 210,000 " },
        { code: "missing-link", pages: ["wiki/a"], summary: "Same source, no link" },
        { code: "typo", pages: ["wiki/a"], summary: "not a code" },
        { code: "superseded", pages: [], summary: "no pages" },
      ],
      nodeCandidates: [],
    }) + "\n```";
    expect(parseLintFindings(text)).toEqual([
      { code: "disagreement", pages: ["wiki/a", "wiki/b"], summary: "Budget 240,000 vs 210,000" },
      { code: "missing-link", pages: ["wiki/a"], summary: "Same source, no link" },
    ]);
    expect(parseLintFindings("no block")).toEqual([]);
  });

  it("reads candidates from the last fenced json block and normalises them", () => {
    const text = [
      "### 4. Concept without a page",
      "- Teodor Vasquez — three pages",
      "",
      "```json",
      '{"nodeCandidates":[{"name":" Teodor Vasquez ","kind":"person","pages":["wiki/plan.md","wiki/minutes"],"why":"named on three pages"},{"name":"Export Worker","kind":"element","pages":["wiki/arch"]},{"name":""}]}',
      "```",
    ].join("\n");
    expect(parseLintCandidates(text)).toEqual([
      { name: "Teodor Vasquez", kind: "person", pages: ["wiki/plan", "wiki/minutes"], why: "named on three pages" },
      { name: "Export Worker", kind: "element", pages: ["wiki/arch"], why: "" },
    ]);
  });

  it("yields nothing for prose, a malformed block, or no block — never a guess", () => {
    expect(parseLintCandidates("Concept without a page: Teodor Vasquez")).toEqual([]);
    expect(parseLintCandidates("```json\n{\"nodeCandidates\": [oops]}\n```")).toEqual([]);
    expect(parseLintCandidates(null)).toEqual([]);
    expect(parseLintCandidates("```json\n{\"nodeCandidates\":[]}\n```")).toEqual([]);
  });
});

describe("only what the code builds may become a node", () => {
  it("admits domain, capability and element and refuses person, organisation and other", () => {
    expect(["domain", "capability", "element"].every((k) => isMapKind(k as never))).toBe(true);
    expect(["person", "organisation", "other"].some((k) => isMapKind(k as never))).toBe(false);
  });
});

describe("dropCandidatesWithNodes", () => {
  it("retires a candidate once a node outside wiki/ carries its name", () => {
    const candidates = [
      { name: "Timber sash frames", kind: "element" as const, pages: ["wiki/a"], why: "" },
      { name: "Platform lift", kind: "element" as const, pages: ["wiki/a"], why: "" },
    ];
    const docs = [
      { slug: "elements/timber-sash-frames", frontmatter: { kind: "element", title: "timber sash frames" } },
      { slug: "wiki/platform-lift", frontmatter: { title: "Platform lift" } },
    ];
    expect(dropCandidatesWithNodes(candidates, docs).map((c) => c.name)).toEqual(["Platform lift"]);
  });
});
