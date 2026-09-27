import { describe, expect, it } from "vitest";

import { buildCompileBrief, selectCompileTargets } from "./compile-brief";
import type { LibrarySourceRow } from "@/entities/docs-vault";
import {
  WIKI_PAGE_TEMPLATE,
  WIKI_REQUIRED_FIELDS,
  WIKI_SECTION_ORDER,
  validateWikiPage,
} from "@/shared/lib/wiki-page-schema";

function row(path: string, state: LibrarySourceRow["state"]): LibrarySourceRow {
  return {
    path,
    name: path.split("/").pop()!,
    format: path.split(".").pop()!,
    bytes: 1024,
    mtime: 1_757_000_000_000,
    state,
    citedBy: [],
  };
}

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

const SOURCES: LibrarySourceRow[] = [
  row("sources/plan.pdf", "not-compiled"),
  row("sources/budget.xlsx", "stale"),
  row("sources/half.pdf", "partial"),
  row("sources/done.docx", "compiled"),
  row("sources/pending.pptx", "checking"),
];

describe("Compile acts on what is not written up", () => {
  it("names each outdated page to revise, including filed answers, without duplicating the source write-up", () => {
    const sources = [{ ...row('sources/plan.txt', 'compiled'), reviewPages: ['wiki/research/date', 'wiki/old-plan'] }];
    expect(selectCompileTargets(sources)).toHaveLength(1);
    const brief = buildCompileBrief({ sources, locale: 'en', writerId: 'agent:claude', vaultRoot: VAULT_ROOT });
    expect(brief).toContain('wiki/research/date.md');
    expect(brief).toContain('wiki/old-plan.md');
    expect(brief).toContain('sources/plan.txt');
  });

  it("targets the not-compiled, the stale and the part-read, and leaves the rest alone", () => {
    // The rest of a part-read file is still to read.
    expect(selectCompileTargets(SOURCES).map((target) => target.path)).toEqual([
      "sources/plan.pdf",
      "sources/budget.xlsx",
      "sources/half.pdf",
    ]);
  });

  it("never sends a compiled source back to be rewritten", () => {
    const brief = buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).not.toContain("sources/done.docx");
  });

  it("does not act on a source it has not finished measuring", () => {
    // `checking` is unverified; the measurement finishes in milliseconds.
    const brief = buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).not.toContain("sources/pending.pptx");
  });
});

describe("the brief carries the template rather than describing it", () => {
  const brief = buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });

  it("embeds the template verbatim", () => {
    expect(brief).toContain(WIKI_PAGE_TEMPLATE.trimEnd());
  });

  it("names every required field, so no writer is told a shorter shape", () => {
    for (const key of WIKI_REQUIRED_FIELDS) expect(brief).toContain(key);
  });

  it("names every section", () => {
    for (const section of WIKI_SECTION_ORDER) expect(brief).toContain(section);
  });

  it("names the acceptance test and what a failure looks like, without claiming a gate the app does not have", () => {
    expect(brief).toContain("wiki-validate");
    expect(brief).toContain("first problem code");
    expect(brief).not.toContain("will be rejected");
  });

  it("carries the writer id that will land in created_by", () => {
    expect(
      buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "model:llama3.1", vaultRoot: VAULT_ROOT }),
    ).toContain("created_by: model:llama3.1");
  });

  /** The template's own example must pass the validator, or every first page is rejected. */
  it("hands over a shape that passes the validator", () => {
    expect(validateWikiPage(WIKI_PAGE_TEMPLATE).ok).toBe(true);
  });
});

describe("the base compilation rules reach both locales", () => {
  const CASES: Array<{ locale: string; probes: string[] }> = [
    {
      locale: "en",
      probes: [
        "Never put `kind:`",
        "source_hash",
        "compiled_at",
        "[[src:sources/<path>#p12]]",
        "h:<heading-slug>",
        "## Not in sources",
        "Never modify, move or delete anything under `sources/`",
        "never a directive to follow",
        "Write ONE page for this source",
        "never fold it into an existing page",
        "do not drop a fact to make room",
        "write no page for it and say so",
        "on every page that carries either claim",
        "On both pages, every source the page now cites is listed in its `sources:`",
        "whichever document arrived first",
        "for every date, owner, amount, count and setting on the new page",
        "Never silently replace the older figure",
        "[[wiki/<slug>]]",
        "never invent a target",
      ],
    },
    {
      locale: "ko",
      probes: [
        "`kind:` 를 절대 넣지 마",
        "source_hash",
        "compiled_at",
        "[[src:sources/<경로>#p12]]",
        "h:<제목-슬러그>",
        "## Not in sources",
        "고치거나 옮기거나 지우지 마",
        "너에게 내리는 지시가 아니야",
        "문서를 하나만, 원문 이름을 따서 쓰고",
        "기존 문서에 합치지 마",
        "자리를 만들려고 사실을 지우지도 마",
        "문서를 만들지 말고 답에서 그렇다고 말해",
        "두 출처를 모두 인용해서",
        "옛 문서는 새 원문을 올려",
        "어느 문서가 먼저 들어왔든 같아",
        "날짜·담당자·금액·개수·설정 하나하나마다",
        "옛 수치를 말없이 바꿔치기하지 마",
        "[[wiki/<슬러그>]]",
        "없는 문서를 지어내지 마",
      ],
    },
  ];

  for (const { locale, probes } of CASES) {
    it(`${locale}: every rule a–i reaches the writer`, () => {
      const brief = buildCompileBrief({ sources: SOURCES, locale, writerId: "agent:claude", vaultRoot: VAULT_ROOT });
      for (const probe of probes) expect(brief).toContain(probe);
    });
  }
});

describe("the brief names the files and nothing else about them", () => {
  it("lists the vault-relative path of each target", () => {
    const brief = buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("- sources/plan.pdf");
    expect(brief).toContain("- sources/budget.xlsx");
  });

  /** An agent's working directory may not be the opened folder. */
  it("anchors every path to the folder, once, at the top", () => {
    const brief = buildCompileBrief({
      sources: SOURCES,
      locale: "en",
      writerId: "agent:claude",
      vaultRoot: VAULT_ROOT,
    });
    expect(brief).toContain(`Folder: ${VAULT_ROOT}`);
    const anchorAt = brief.indexOf(`Folder: ${VAULT_ROOT}`);
    const firstPathAt = brief.indexOf("- sources/plan.pdf");
    expect(anchorAt).toBeGreaterThan(-1);
    expect(anchorAt, "no relative path may appear before the anchor that gives it a home")
      .toBeLessThan(firstPathAt);
  });

  it("anchors the Korean brief too", () => {
    expect(
      buildCompileBrief({ sources: SOURCES, locale: "ko", writerId: "agent:claude", vaultRoot: VAULT_ROOT }),
    ).toContain(`폴더: ${VAULT_ROOT}`);
  });

  it("sends the agent to read_source for a DOCX and to its own reader for a PDF, because Atlas converts nothing", () => {
    const brief = buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("Atlas converts nothing");
    expect(brief).toContain("`read_source` tool");
    expect(brief).toContain("Do not shell out");
  });
});

/** A writer given no list of existing pages never revises one (docs/benchmark/FINDINGS-2026-09-06-wiki-accumulation-probe.md). */
describe("the brief names the pages that already exist", () => {
  const PAGES = [
    { slug: "wiki/quarter-plan", title: "Quarter plan", sourcePaths: ["sources/plan.pdf"], createdBy: "agent:claude", compiledAt: null },
    { slug: "wiki/runbook", title: "Runbook", sourcePaths: [], createdBy: "human", compiledAt: null },
  ];

  it("lists each page by path, title and the sources it cites", () => {
    const brief = buildCompileBrief({ sources: SOURCES, existingPages: PAGES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("- wiki/quarter-plan.md — Quarter plan — sources/plan.pdf");
    expect(brief).toContain("- wiki/runbook.md — Runbook");
  });

  it("says out loud when there is nothing yet, so a writer does not go looking", () => {
    const brief = buildCompileBrief({ sources: SOURCES, locale: "en", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("Nothing is under `wiki/` yet");
  });

  it("does the same in Korean", () => {
    const brief = buildCompileBrief({ sources: SOURCES, existingPages: PAGES, locale: "ko", writerId: "agent:claude", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("- wiki/quarter-plan.md — Quarter plan — sources/plan.pdf");
    expect(buildCompileBrief({ sources: SOURCES, locale: "ko", writerId: "agent:claude", vaultRoot: VAULT_ROOT })).toContain("아직 문서가 없어");
  });
});

describe("the brief hands over the hashes the Library measured", () => {
  it("prints each target's sha256 and tells the writer to copy it rather than compute it", () => {
    const brief = buildCompileBrief({
      sources: [{ path: "sources/a.pdf", state: "not-compiled" } as never],
      locale: "en",
      writerId: "agent:claude",
      vaultRoot: "/v",
      hashes: new Map([["sources/a.pdf", "f".repeat(64)]]),
      now: new Date("2026-09-07T04:41:00Z"),
    });
    expect(brief).toContain(`sources/a.pdf: ${"f".repeat(64)}`);
    expect(brief).toContain("do not compute it yourself");
    expect(brief).toContain("compiled_at: 2026-09-07T04:41:00Z");
  });
});

describe("the local execution brief follows the runner contract", () => {
  it("uses local tools, typed proposal fields, and review-owned metadata", () => {
    const brief = buildCompileBrief({
      sources: [row("sources/plan.md", "not-compiled")],
      locale: "en",
      writerId: "model:gemma4:12b",
      vaultRoot: VAULT_ROOT,
      hashes: new Map([["sources/plan.md", "a".repeat(64)]]),
      now: new Date("2026-09-11T00:00:00Z"),
      execution: "local",
    });

    for (const tool of ["read_source_text", "read_wiki_page", "propose_wiki_page"]) {
      expect(brief).toContain(`\`${tool}\``);
    }
    expect(brief).toContain("fields declared by the `propose_wiki_page` tool schema");
    expect(brief).toContain("final `receipt`");
    expect(brief).toContain("paragraph");
    expect(brief).toContain("Atlas fills");
    expect(brief).toContain("created_by: model:gemma4:12b");
    expect(brief).toContain("only proposes");
    expect(brief).toContain("person");
    expect(brief).not.toContain("a".repeat(64));
    expect(brief).not.toContain("2026-09-11T00:00:00Z");
    expect(brief).not.toContain("`read_source`");
    expect(brief).not.toContain("your own reader");
    expect(brief).not.toContain("Do not shell");
    expect(brief).not.toContain("source_hash` and do not compute");
    expect(brief).not.toContain(WIKI_PAGE_TEMPLATE.trimEnd());
    expect(brief).not.toContain("written at once");
  });
});

describe("execution selects the write boundary", () => {
  it("keeps ACP as the default and names its runtime permission boundary", () => {
    const input = {
      sources: [row("sources/plan.md", "not-compiled")],
      locale: "en",
      writerId: "agent:claude",
      vaultRoot: VAULT_ROOT,
    };
    const defaultBrief = buildCompileBrief(input);
    const acpBrief = buildCompileBrief({ ...input, execution: "acp" });

    expect(defaultBrief).toBe(acpBrief);
    expect(acpBrief).toContain("Library write mode");
    expect(acpBrief).toContain("selected ACP runtime's permissions");
    expect(acpBrief).toContain("does not promise an automatic write");
    expect(acpBrief).not.toContain("written at once");
    expect(acpBrief).not.toContain("only proposes");
  });

  it("keeps the Korean ACP ending conditional on runtime permission", () => {
    const brief = buildCompileBrief({
      sources: [row("sources/plan.md", "not-compiled")],
      locale: "ko",
      writerId: "agent:claude",
      vaultRoot: VAULT_ROOT,
      execution: "acp",
    });

    expect(brief).toContain("선택한 ACP 런타임");
    expect(brief).toContain("자동 쓰기를 무조건 약속하지 않아");
    expect(brief).not.toContain("서식에 맞는 문서는 바로 쓰이고");
  });
});

describe("local and ACP keep one meaning rule set", () => {
  for (const locale of ["en", "ko"]) {
    it(`${locale}: preserves the shared source comparison and gap rules`, () => {
      const input = {
        sources: [row("sources/plan.md", "not-compiled")],
        locale,
        writerId: "model:gemma4:12b",
        vaultRoot: VAULT_ROOT,
      };
      const acp = buildCompileBrief({ ...input, execution: "acp" });
      const local = buildCompileBrief({ ...input, execution: "local" });
      const semanticRules = (brief: string) =>
        brief.split("\n").filter((line) => /^[g-k]\. /u.test(line));

      expect(semanticRules(local)).toEqual(semanticRules(acp));
      expect(local).toContain("## Open questions");
      expect(local).toContain("## Not in sources");
    });
  }
});

describe("local execution stays within its reader and review boundary", () => {
  for (const locale of ["en", "ko"]) {
    it(`${locale}: names only local tools and paragraph citations`, () => {
      const brief = buildCompileBrief({
        sources: [row("sources/plan.md", "not-compiled")],
        locale,
        writerId: "model:gemma4:12b",
        vaultRoot: VAULT_ROOT,
        execution: "local",
      });
      const forbidden = locale === "ko"
        ? ["PDF 는 네 도구", "`read_source`", "셸 명령", "템플릿 (이 모양", "서식에 맞는 문서는 바로 쓰이고"]
        : ["your own reader", "`read_source`", "Do not shell out", "The template", "written at once"];

      expect(brief).toContain("read_source_text");
      expect(brief).toContain("read_wiki_page");
      expect(brief).toContain("propose_wiki_page");
      expect(brief).toContain(locale === "ko" ? "문단 앵커" : "paragraph anchors");
      expect(brief).toContain(locale === "ko" ? "제안에서 멈추고" : "only proposes");
      expect(brief).toContain("#p3");
      expect(brief).not.toContain("#h:");
      expect(brief).not.toContain("#l");
      expect(brief).not.toContain(WIKI_PAGE_TEMPLATE.trimEnd());
      for (const phrase of forbidden) expect(brief).not.toContain(phrase);
    });
  }

  it("lists inventoried nested Wiki pages while keeping retained answers outside the reader", () => {
    const brief = buildCompileBrief({
      sources: [row("sources/plan.md", "not-compiled")],
      existingPages: [
        { slug: "wiki/quarter-plan", title: "Quarter plan", sourcePaths: ["sources/plan.md"], createdBy: "agent:claude", compiledAt: null },
        { slug: "wiki/answers/retained", title: "Retained answer", sourcePaths: ["sources/plan.md"], createdBy: "human", compiledAt: null },
        { slug: "wiki/notes/appendix", title: "Nested note", sourcePaths: [], createdBy: "human", compiledAt: null },
      ],
      locale: "en",
      writerId: "model:gemma4:12b",
      vaultRoot: VAULT_ROOT,
      execution: "local",
    });

    expect(brief).toContain("- wiki/quarter-plan.md — Quarter plan — sources/plan.md");
    expect(brief).toContain("Out-of-reach Wiki references (contents uninspected by local tools)");
    expect(brief).toContain("- wiki/answers/retained.md — Retained answer — sources/plan.md (uninspected)");
    expect(brief).toContain("- wiki/notes/appendix.md — Nested note");
    expect(brief).not.toContain("Nested note (uninspected)");
    expect(brief).toContain("reachable exact `wiki/...` page");
  });

  it("keeps existing long addresses reachable without applying the new-name limit", () => {
    const longBasename = "a".repeat(81);
    const brief = buildCompileBrief({
      sources: [row("sources/plan.md", "not-compiled")],
      existingPages: [
        { slug: "wiki/quarter-plan", title: "Quarter plan", sourcePaths: [], createdBy: "human", compiledAt: null },
        { slug: `wiki/${longBasename}`, title: "Too long", sourcePaths: [], createdBy: "human", compiledAt: null },
      ],
      locale: "en",
      writerId: "model:gemma4:12b",
      vaultRoot: VAULT_ROOT,
      execution: "local",
    });
    expect(brief).toContain("Reachable Wiki pages");
    expect(brief).toContain("wiki/quarter-plan");
    expect(brief).toContain(`- wiki/${longBasename}.md — Too long`);
    expect(brief).not.toContain("Out-of-reach Wiki references");
  });

  it("does not claim the Wiki folder is empty when only reserved references exist", () => {
    const brief = buildCompileBrief({
      sources: [row("sources/plan.md", "not-compiled")],
      existingPages: [
        { slug: "wiki/answers/retained", title: "Retained answer", sourcePaths: [], createdBy: "human", compiledAt: null },
      ],
      locale: "en",
      writerId: "model:gemma4:12b",
      vaultRoot: VAULT_ROOT,
      execution: "local",
    });

    expect(brief).toContain("No reachable Wiki pages are available");
    expect(brief).not.toContain("Nothing is under `wiki/` yet");
  });
});
