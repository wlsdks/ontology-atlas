import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { buildLibraryModel } from "@/entities/docs-vault/lib/vault-library";
import type { VaultDoc } from "@/entities/docs-vault/model/types";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";

import { answerSlug, buildAnswerPage } from "./answer-page";

const NOW = new Date("2026-09-07T03:00:00Z");

function asLibraryDoc(page: ReturnType<typeof buildAnswerPage>): VaultDoc {
  const { frontmatter } = parseFrontmatter(page.text);
  return {
    slug: page.slug, path: page.path, title: String(frontmatter.title), frontmatter,
    tags: [], headings: [], excerpt: "", wordCount: 12, updatedAt: NOW.toISOString(), linksOut: [],
  };
}

describe("filed answers do not mint source-read provenance", () => {
  const path = "sources/room-capacity.md";
  const oldBytes = "Capacity: 24 participants.\n";
  const newBytes = "Capacity: 18 participants; supersedes 24.\n";
  const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

  it.each([
    ["an unchanged source is not proof of a read", oldBytes],
    ["a revised source must not be rebound to an older answer", newBytes],
  ])("%s", (_case, bytes) => {
    // A passive measurement can arrive before or after the answer. Neither is a read receipt.
    const input = {
      question: "How many people can attend?",
      answer: `The room allows 24 participants. [[src:${path}#l1]]`,
      askedOn: null, writer: "agent:codex", now: NOW, knownSources: [path],
      hashes: new Map([[path, hash(bytes)]]),
    };
    const page = buildAnswerPage(input);
    expect(page.problems).toEqual([]);
    expect(page.text).toContain(input.answer);
    const doc = asLibraryDoc(page);
    expect(doc.frontmatter.source_hash).toEqual({ [path]: "unmeasured" });
    const model = buildLibraryModel({
      docs: [doc],
      sources: [{ path, name: "room-capacity.md", format: "md", bytes: bytes.length, mtime: NOW.getTime() }],
      hashes: input.hashes,
    });
    expect(model.pairing.writeUpsBySource.get(path)?.[0]?.freshness).toBe("behind");
    expect(model.sources[0]?.state).toBe("stale");
    expect(model.needsCompileCount).toBe(1);
  });

  it("retains an outstanding source revision when an answer is filed beside an older wiki page", () => {
    const page = buildAnswerPage({
      question: "Can we announce the capacity?",
      answer: `The room allows 24 participants. [[src:${path}#l1]]`,
      askedOn: "wiki/room", writer: "agent:codex", now: NOW, knownSources: [path],
    });
    const answer = asLibraryDoc(page);
    const original: VaultDoc = {
      ...answer, slug: "wiki/room", path: "wiki/room.md",
      frontmatter: { ...answer.frontmatter, source_hash: { [path]: hash(oldBytes) } },
    };
    const source = { path, name: "room-capacity.md", format: "md", bytes: newBytes.length, mtime: NOW.getTime() };
    const hashes = new Map([[path, hash(newBytes)]]);
    const before = buildLibraryModel({ docs: [original], sources: [source], hashes });
    const after = buildLibraryModel({ docs: [original, answer], sources: [source], hashes });
    expect(before.needsCompileCount).toBe(1);
    expect(after.needsCompileCount).toBe(1);
    expect(after.sources[0]?.state).toBe("stale");
    expect(after.pairing.writeUpsBySource.get(path)?.every((row) => row.freshness === "behind")).toBe(true);
  });
});

describe("buildAnswerPage files an answer back as a wiki page", () => {
  it('normalizes text-file colon line citations and preserves both range endpoints', () => {
    const page = buildAnswerPage({
      question: 'Can we announce the workshop?',
      answer: 'Approval is missing (`sources/plan.md:7`). The hold expires soon (sources/venue.txt:5-6).',
      askedOn: null, writer: 'agent:claude-code', now: NOW,
      knownSources: ['sources/plan.md', 'sources/venue.txt'],
    });
    expect(page.problems).toEqual([]);
    expect(page.text).toContain('[[src:sources/plan.md#l7]]');
    expect(page.text).toContain('[[src:sources/venue.txt#l5]]–[[src:sources/venue.txt#l6]]');
    expect(asLibraryDoc(page).frontmatter.source_hash).toEqual({
      'sources/plan.md': 'unmeasured', 'sources/venue.txt': 'unmeasured',
    });
  });

  it.each(['sources/report.pdf:7', 'sources/report.docx:7', 'sources/plan.md:0', 'sources/plan.md:7:2', 'sources/plan.md:9-3', 'sources/plan.md:7.5', 'https://example.com/sources/plan.md:7', '[link](sources/plan.md:7)'])('does not infer a citation from %s', (citation) => {
    const page = buildAnswerPage({
      question: 'Where is the approval?', answer: `Approval is recorded (${citation}).`,
      askedOn: null, writer: 'agent:claude-code', now: NOW,
      knownSources: ['sources/report.pdf', 'sources/report.docx', 'sources/plan.md'],
    });
    expect(page.problems[0]?.code).toBe('no-cited-fact');
  });

  it("retains cited lines and source paths with unmeasured provenance, and keeps uncited lines separate", () => {
    const page = buildAnswerPage({
      question: "Why was the reopening moved?",
      answer: [
        "The change request moved the reopening to 2027-05-15 [[src:sources/change-request.docx#p1]].",
        "Retaining the sashes adds eleven weeks [[src:sources/site-survey.pdf#p2]] [[src:sources/change-request.docx#p1]].",
        "I could not find who signed the survey.",
      ].join("\n"),
      askedOn: "wiki/change-request",
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/change-request.docx", "sources/site-survey.pdf"],
    });
    expect(page.slug).toMatch(/^wiki\/answers\/2026-09-07-why-was-the-reopening-moved-[0-9a-f-]{36}$/);
    expect(page.text).toContain("sources:\n  - sources/change-request.docx\n  - sources/site-survey.pdf");
    expect(page.text).toContain("sources/site-survey.pdf: unmeasured");
    expect(page.text).toContain("## Facts\n\n- The change request moved");
    expect(page.text).toContain("## Not in sources\n\n- I could not find who signed the survey.");
    expect(page.text).toContain("Asked while reading [[wiki/change-request]].");
  });

  it("preserves explicit canonical sections, including cited uncertainty and human decisions", () => {
    const page = buildAnswerPage({
      question: "Can we announce the room capacity?",
      answer: [
        "## Summary",
        "The capacity is recorded, but approval is still pending.",
        "",
        "## Facts",
        "- The room holds 18 participants. [[src:sources/room.md#l1]]",
        "",
        "## Decisions",
        "- Human decision: wait for owner approval before announcing.",
        "",
        "## Open questions",
        "- Whether the 18-person limit includes staff remains unresolved. [[src:sources/plan.md#l3]]",
        "",
        "## Not in sources",
        "- No signed approval was provided.",
      ].join("\n"),
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/room.md", "sources/plan.md"],
    });
    expect(page.problems).toEqual([]);
    const body = parseFrontmatter(page.text).body;
    const section = (title: string) => {
      const start = body.indexOf(`## ${title}`);
      const next = body.indexOf("\n## ", start + 1);
      return body.slice(start, next < 0 ? undefined : next);
    };
    expect(section("Summary")).toContain("The capacity is recorded, but approval is still pending.");
    expect(section("Facts")).toContain("The room holds 18 participants.");
    expect(section("Facts")).not.toContain("Whether the 18-person limit");
    expect(section("Decisions")).toContain("Human decision: wait for owner approval");
    expect(section("Decisions")).not.toContain("The room holds 18 participants");
    expect(section("Open questions")).toContain("Whether the 18-person limit includes staff remains unresolved.");
    expect(section("Not in sources")).toContain("No signed approval was provided.");
    expect(page.text).toContain("sources:\n  - sources/room.md\n  - sources/plan.md");
  });

  it("fills absent canonical sections while preserving the sections that were supplied", () => {
    const page = buildAnswerPage({
      question: "What is the current capacity?",
      answer: [
        "## Facts",
        "- The room holds 18 participants. [[src:sources/room.md#l1]]",
        "",
        "## Open questions",
        "- Approval of the announcement remains unresolved. [[src:sources/plan.md#l3]]",
      ].join("\n"),
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/room.md", "sources/plan.md"],
    });
    expect(page.problems).toEqual([]);
    expect(page.text).toContain("## Summary\n\nWhat is the current capacity?");
    expect(page.text).toContain("## Facts\n\n- The room holds 18 participants. [[src:sources/room.md#l1]]");
    expect(page.text).toContain("## Decisions\n\n## Open questions\n\n- Approval of the announcement remains unresolved.");
    expect(page.text).toContain("## Not in sources\n\n");
  });

  it("keeps cited preamble text in Summary instead of dropping or promoting it", () => {
    const page = buildAnswerPage({
      question: "Can we announce the capacity?",
      answer: [
        "Background from the intake note: the owner has not approved the announcement. [[src:sources/intake.md#l1]]",
        "",
        "## Open questions",
        "- Whether the announcement is ready remains unresolved. [[src:sources/plan.md#l2]]",
      ].join("\n"),
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/intake.md", "sources/plan.md"],
    });
    expect(page.problems).toEqual([]);
    const summaryEnd = page.text.indexOf("\n## Facts\n\n");
    const summary = page.text.slice(page.text.indexOf("## Summary"), summaryEnd);
    const facts = page.text.slice(summaryEnd, page.text.indexOf("\n## Decisions\n\n", summaryEnd));
    expect(summary).toContain("Background from the intake note: the owner has not approved the announcement.");
    expect(facts).not.toContain("Background from the intake note");
    expect(page.text).toContain("## Open questions\n\n- Whether the announcement is ready remains unresolved.");
    expect(page.text).toContain("sources:\n  - sources/intake.md\n  - sources/plan.md");
  });

  it("keeps an unknown heading and its cited context in Summary", () => {
    const page = buildAnswerPage({
      question: "What remains open?",
      answer: [
        "## Background",
        "The audit note records a prior owner statement. [[src:sources/audit.md#l1]]",
        "",
        "## Open questions",
        "- The current owner statement is still unresolved. [[src:sources/audit.md#l2]]",
      ].join("\n"),
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/audit.md"],
    });
    expect(page.problems).toEqual([]);
    const summaryEnd = page.text.indexOf("\n## Facts\n\n");
    const summary = page.text.slice(page.text.indexOf("## Summary"), summaryEnd);
    const facts = page.text.slice(summaryEnd, page.text.indexOf("\n## Decisions\n\n", summaryEnd));
    expect(summary).toContain("## Background");
    expect(summary).toContain("The audit note records a prior owner statement. [[src:sources/audit.md#l1]]");
    expect(facts).not.toContain("The audit note records a prior owner statement");
  });

  it("does not let a fenced literal Facts heading change the active section", () => {
    const page = buildAnswerPage({
      question: "What remains open?",
      answer: [
        "## Summary",
        "The answer includes a literal example:",
        "```markdown",
        "## Facts",
        "- A sample fact from the example. [[src:sources/example.md#l1]]",
        "```",
        "",
        "## Open questions",
        "- The real question remains unresolved. [[src:sources/plan.md#l2]]",
      ].join("\n"),
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/example.md", "sources/plan.md"],
    });
    expect(page.problems).toEqual([]);
    const summaryEnd = page.text.indexOf("\n## Facts\n\n");
    const summary = page.text.slice(page.text.indexOf("## Summary"), summaryEnd);
    const facts = page.text.slice(summaryEnd, page.text.indexOf("\n## Decisions\n\n", summaryEnd));
    expect(summary).toContain("```markdown\n## Facts\n- A sample fact from the example. [[src:sources/example.md#l1]]\n```");
    expect(facts).not.toContain("A sample fact from the example");
    expect(page.text).toContain("## Open questions\n\n- The real question remains unresolved.");
  });

  it("keeps keyword-only decision and question prose on the unstructured fallback", () => {
    const page = buildAnswerPage({
      question: "Can we announce the capacity?",
      answer: [
        "Decision: wait for the owner. [[src:sources/plan.md#l2]]",
        "Open question: does the limit include staff? [[src:sources/plan.md#l3]]",
      ].join("\n"),
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/plan.md"],
    });
    expect(page.problems).toEqual([]);
    expect(page.text).toContain(
      "## Facts\n\n- Decision: wait for the owner. [[src:sources/plan.md#l2]]\n- Open question: does the limit include staff? [[src:sources/plan.md#l3]]",
    );
    expect(page.text).toContain("## Decisions\n\n## Open questions\n\n## Not in sources");
  });

  it("points at the pages that already write up a cited source, so the folder check has nothing to raise", () => {
    const page = buildAnswerPage({
      question: "Why was the reopening moved?",
      answer: "Retaining the sashes adds eleven weeks [[src:sources/site-survey.pdf#p2]] [[src:sources/change-request.docx#p1]].",
      askedOn: "wiki/change-request",
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/change-request.docx", "sources/site-survey.pdf"],
      pagesForSource: (path) =>
        path === "sources/site-survey.pdf" ? ["wiki/site-survey", "wiki/change-request"] : ["wiki/change-request"],
    });
    expect(page.problems).toEqual([]);
    expect(page.text).toContain("Asked while reading [[wiki/change-request]]. See also [[wiki/site-survey]].");
    expect(page.problems).toEqual([]);
  });

  it("reads a citation written loosely, bare or in backticks, and files it in the wiki form", () => {
    const page = buildAnswerPage({
      question: "Where does this come from?",
      answer: [
        "The five facts all point at one place, `sources/change-request-CR3.docx#p1`, and the summary draws on it.",
        "The approval date is in the header: src:sources/change-request-CR3.docx#p1.",
        "A row of the quote table: [[sources/contractor-quotes.csv#r3]].",
      ].join("\n"),
      askedOn: "wiki/change-request-CR3",
      writer: "agent:claude-code",
      now: NOW,
      knownSources: ["sources/change-request-CR3.docx", "sources/contractor-quotes.csv"],
    });
    expect(page.problems).toEqual([]);
    expect(page.text).toContain("one place, [[src:sources/change-request-CR3.docx#p1]], and the summary");
    expect(page.text).toContain("in the header: [[src:sources/change-request-CR3.docx#p1]].");
    expect(page.text).toContain("quote table: [[src:sources/contractor-quotes.csv#r3]].");
    expect(page.text).toContain("sources:\n  - sources/change-request-CR3.docx\n  - sources/contractor-quotes.csv");
    expect(page.text).toContain("sources/contractor-quotes.csv: unmeasured");
  });

  it("refuses an answer with no citation by name instead of planting a bullet the validator would reject", () => {
    const page = buildAnswerPage({
      question: "What is the budget?",
      answer: "The budget is 221,400.",
      askedOn: null,
      writer: "agent:claude-code",
      now: NOW,
      knownSources: [],
    });
    expect(page.problems[0]?.code).toBe("no-cited-fact");
    expect(page.text).toContain("## Facts\n\n## Decisions");
    expect(page.text).toContain("## Not in sources\n\n- The budget is 221,400.");
  });

  it("makes a stable slug from the question's first words and the day", () => {
    expect(answerSlug("Is this figure final?!", NOW)).toBe("wiki/answers/2026-09-07-is-this-figure-final");
    expect(answerSlug("이 숫자 맞아?", NOW)).toBe("wiki/answers/2026-09-07-이-숫자-맞아");
  });

  it('gives repeated questions fresh bounded destinations while keeping their full human title', () => {
    const question = '𐐀'.repeat(120);
    const input = { question, answer: 'A fact [[src:sources/plan.md#l1]].', askedOn: null, writer: 'agent:test', now: NOW, knownSources: ['sources/plan.md'] };
    const first = buildAnswerPage(input);
    const second = buildAnswerPage(input);
    expect(second.path).not.toBe(first.path);
    expect(new TextEncoder().encode(first.path.split('/').at(-1)!).length).toBeLessThan(200);
    expect(parseFrontmatter(first.text).frontmatter.title).toBe(question);
  });
});
