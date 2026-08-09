import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../../messages/en.json";
import koMessages from "../../../../../messages/ko.json";
import type { VaultDoc } from "@/entities/docs-vault";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { DocFrontmatterBlock } from "./DocFrontmatterBlock";

const doc: VaultDoc = {
  slug: "capabilities/cli-developer-entry",
  path: "docs/ontology/capabilities/cli-developer-entry.md",
  title: "CLI Developer Entry",
  tags: [],
  frontmatter: {
    kind: "capability",
    slug: "capabilities/cli-developer-entry",
    title: "CLI Developer Entry",
    domain: "developer-experience",
    // uid 가 여기 있어야 이 픽스처가 정말로 «깨끗»하다 (2026-08-04). 종전엔
    // uid 가 없었는데도 「깨끗한 frontmatter」 라고 불렸다 — 화면이 오류를
    // 걸러 내고 있었으니 테스트도 그 거짓을 그대로 물려받았던 것이다.
    uid: "0f0e5f1a-6c53-4a1b-9c2f-2f0f7b6a1d34",
    status: "active",
    depends_on: ["mcp-server"],
  },
  headings: [],
  excerpt: "",
  wordCount: 11114,
  updatedAt: "2026-05-04T00:00:00.000Z",
  linksOut: [],
};

function renderBlock(locale: "en" | "ko" = "ko") {
  const messages = locale === "ko" ? koMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocFrontmatterBlock doc={doc} />
    </NextIntlClientProvider>,
  );
}

describe("DocFrontmatterBlock", () => {
  it("starts collapsed with a plain summary of kind, slug, and field count", () => {
    renderBlock();
    const details = screen.getByTestId("doc-frontmatter-block").querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    const summary = within(screen.getByTestId("doc-frontmatter-summary"));
    expect(summary.getByText("capability")).toBeInTheDocument();
    expect(summary.getByText("capabilities/cli-developer-entry")).toBeInTheDocument();
    expect(summary.getByText("속성 6개")).toBeInTheDocument();
  });

  /**
   * **문서마다 반복되는 「가르치는 줄」은 상주하지 않는다** (2026-08-08, 소유자
   * 지적 — *"문서 볼 때 상단이 조금 이상한데.. 보기좋게 구성할순없나?"*).
   *
   * 「규격 예시 보기」는 문서마다 달라지지 않는 설명이다. 그런데 접힌 상태에서도
   * 자기 줄을 갖고 있어서, 읽으러 온 사람의 화면에서 본문을 25px 씩 아래로
   * 밀었다 — 배포 샘플 볼트의 **112개 문서 전부**에서.
   *
   * 필요한 순간은 「이 속성이 무엇을 받나」를 알고 싶을 때이고, 그건 이 속성
   * 블록을 여는 순간이다. 그래서 그 안으로 옮겼다.
   *
   * ⚠️ 이 시험이 없으면 되돌아간다 — 앞선 단위 시험들은 `getByTestId` 로 DOM
   * 존재만 보므로 토글이 details **밖**에 있어도 전부 초록이었다(실측).
   */
  it("규격 예시 토글은 접힌 속성 블록 안에 있다 — 읽는 화면에 상주하지 않는다", () => {
    renderBlock();
    const details = screen.getByTestId("doc-frontmatter-block").querySelector("details");
    expect(details).not.toHaveAttribute("open");

    const toggle = screen.queryByTestId("doc-frontmatter-example-toggle");
    // 예시가 없는 kind 면 이 시험은 공회전한다 — 그 경우를 먼저 배제한다.
    expect(toggle, "이 fixture 에 규격 예시가 없다 — 시험이 헛돈다").not.toBeNull();
    expect(
      toggle?.closest("details:not([open])"),
      "「규격 예시 보기」가 접힌 속성 블록 밖에 있다 — 읽으러 온 사람의 본문을 밀어낸다",
    ).toBe(details);
  });

  it("reveals the full mono frontmatter block when expanded", () => {
    renderBlock();
    const summary = screen.getByTestId("doc-frontmatter-summary");
    fireEvent.click(summary);

    const details = screen.getByTestId("doc-frontmatter-block").querySelector("details");
    expect(details).toHaveAttribute("open");
    expect(
      screen.getByText(/frontmatter 가 곧 그래프/),
    ).toBeVisible();
  });

  it("never deletes the graph-source fields — only collapses them", () => {
    renderBlock();
    // domain / status / depends_on are still present in the DOM even while
    // collapsed (native <details> hides via UA stylesheet, not removal) —
    // frontmatter is the graph source, so hiding is fine but deleting is not.
    expect(screen.getByText("developer-experience")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders the English collapsed summary copy", () => {
    renderBlock("en");
    const summary = within(screen.getByTestId("doc-frontmatter-summary"));
    expect(summary.getByText("6 fields")).toBeInTheDocument();
  });

  it("linkifies resolvable reference slugs and navigates on click, leaving unresolved ones plain", () => {
    const onNavigate = vi.fn();
    // domain(developer-experience)·depends_on(mcp-server) 은 vault 에 있고,
    // ghost-ref 는 없다고 가정.
    const resolveRef = (token: string) =>
      token === "developer-experience"
        ? "domains/developer-experience"
        : token === "mcp-server"
          ? "capabilities/mcp-server"
          : null;
    const docWithGhost: VaultDoc = {
      ...doc,
      frontmatter: { ...doc.frontmatter, depends_on: ["mcp-server", "ghost-ref"] },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithGhost} onNavigate={onNavigate} resolveRef={resolveRef} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));

    const domainRef = screen.getByTestId("doc-frontmatter-ref-developer-experience");
    expect(domainRef.tagName).toBe("BUTTON");
    fireEvent.click(domainRef);
    expect(onNavigate).toHaveBeenCalledWith("domains/developer-experience");

    fireEvent.click(screen.getByTestId("doc-frontmatter-ref-mcp-server"));
    expect(onNavigate).toHaveBeenCalledWith("capabilities/mcp-server");

    // 미해소 참조는 버튼이 되지 않는다.
    expect(screen.queryByTestId("doc-frontmatter-ref-ghost-ref")).not.toBeInTheDocument();
    expect(screen.getByText("ghost-ref")).toBeInTheDocument();
  });

  it("keeps reference fields plain text when no resolveRef/onNavigate is supplied", () => {
    renderBlock();
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByTestId("doc-frontmatter-ref-developer-experience")).not.toBeInTheDocument();
    expect(screen.getByText("developer-experience")).toBeInTheDocument();
  });

  it("hides the quick-patch action when canEdit/onPatch are not supplied (read-only default)", () => {
    renderBlock();
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByText("kind / domain / title 수정")).not.toBeInTheDocument();
  });

  it("shows a quick-patch action for a writable local vault and saves kind/domain/title edits", async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock
          doc={doc}
          canEdit
          domainOptions={[
            { slug: "developer-experience", title: "Developer Experience" },
            { slug: "graph-quality", title: "Graph Quality" },
          ]}
          onPatch={onPatch}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    fireEvent.click(screen.getByText("kind / domain / title 수정"));

    fireEvent.change(screen.getByLabelText("Domain", { exact: false }), {
      target: { value: "graph-quality" },
    });
    fireEvent.click(screen.getByText("저장"));

    await vi.waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ domain: "graph-quality" });
    });
  });

  it("does not offer the quick-patch action for a non-editable sentinel kind", () => {
    const readmeDoc: VaultDoc = {
      ...doc,
      frontmatter: { ...doc.frontmatter, kind: "vault-readme" },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={readmeDoc} canEdit onPatch={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByText("kind / domain / title 수정")).not.toBeInTheDocument();
  });

  it("renders no validator-warnings row when the frontmatter is clean", () => {
    renderBlock();
    expect(screen.queryByTestId("doc-frontmatter-validator-warnings")).not.toBeInTheDocument();
  });

  // ② 결함의 단위 게이트 — 오류를 감추고 경고만 보여 주던 필터가 돌아오면
  // 여기서 터진다.
  it("surfaces validator ERRORS beside the file, not only warnings", () => {
    const noUidDoc: VaultDoc = {
      ...doc,
      frontmatter: { kind: "capability", slug: doc.slug, title: doc.title, domain: "x" },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={noUidDoc} />
      </NextIntlClientProvider>,
    );
    const rows = screen.getAllByTestId("doc-frontmatter-issue");
    expect(rows.map((row) => row.getAttribute("data-severity"))).toContain("error");
    expect(within(rows[0]).getByText(/uid/)).toBeInTheDocument();
  });

  // ③ 결함의 단위 게이트 — kind 가 없으면 축약 진단이 뜨고, ontology 의도가
  // 없는 안내 문서에는 여전히 아무것도 안 뜬다(소음 0).
  it("renders a compact diagnostic for a kind-less node candidate, and nothing for a plain doc", () => {
    const kindless: VaultDoc = {
      ...doc,
      frontmatter: { slug: doc.slug, title: doc.title, domain: "developer-experience" },
    };
    const { unmount } = render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={kindless} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("doc-frontmatter-block")).toHaveAttribute(
      "data-variant",
      "diagnostic",
    );
    expect(screen.getAllByTestId("doc-frontmatter-issue").length).toBeGreaterThan(0);
    unmount();

    const plainDoc: VaultDoc = { ...doc, frontmatter: { title: doc.title } };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={plainDoc} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("doc-frontmatter-block")).toBeNull();
  });

  it("surfaces a plain-language validator warning for a capability missing domain — no raw code exposed", () => {
    const noDomainDoc: VaultDoc = {
      ...doc,
      frontmatter: { kind: "capability", slug: doc.slug, title: doc.title },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={noDomainDoc} />
      </NextIntlClientProvider>,
    );
    const warnings = screen.getByTestId("doc-frontmatter-validator-warnings");
    expect(within(warnings).getByText(/domain/)).toBeInTheDocument();
    expect(within(warnings).queryByText("missing-expected-field")).not.toBeInTheDocument();
  });

  it("offers a collapsed spec-example disclosure for a known kind, derived from the shared new-doc starter", () => {
    renderBlock();
    expect(screen.queryByTestId("doc-frontmatter-example")).not.toBeInTheDocument();

    const toggle = screen.getByTestId("doc-frontmatter-example-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const example = screen.getByTestId("doc-frontmatter-example");
    expect(within(example).getByText(/kind: capability/)).toBeInTheDocument();
    expect(within(example).getByText(/domain: example-domain/)).toBeInTheDocument();
  });

  // C10 — the 공방 CREATE writer stores meaning in a `definition:` frontmatter
  // key that isn't in GRAPH_KEYS, so it used to be invisible in the read view.
  it("surfaces the definition frontmatter as an always-visible read-mode lede", () => {
    const docWithDefinition: VaultDoc = {
      ...doc,
      frontmatter: { ...doc.frontmatter, definition: "문의를 접수하고 답변하는 역량." },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithDefinition} />
      </NextIntlClientProvider>,
    );
    const lede = screen.getByTestId("doc-frontmatter-definition");
    // visible without expanding the collapsed frontmatter block
    expect(lede).toBeInTheDocument();
    expect(within(lede).getByText("문의를 접수하고 답변하는 역량.")).toBeInTheDocument();
    expect(within(lede).getByText("정의")).toBeInTheDocument();
    const details = screen.getByTestId("doc-frontmatter-block").querySelector("details");
    expect(details).not.toHaveAttribute("open");
  });

  it("omits the definition lede when no definition frontmatter exists", () => {
    renderBlock();
    expect(screen.queryByTestId("doc-frontmatter-definition")).not.toBeInTheDocument();
  });

  it("hides the spec-example disclosure when the document has no recognizable kind", () => {
    const noKindDoc: VaultDoc = {
      ...doc,
      frontmatter: { status: "draft", slug: doc.slug, title: doc.title },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={noKindDoc} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("doc-frontmatter-example-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("doc-frontmatter-validator-warnings")).not.toBeInTheDocument();
  });
});

// R+ "코드 위치" (code location) — frontmatter `elements: [...]` is the vault's
// ONLY real code evidence, but it wasn't in `GRAPH_KEYS` above (not a
// single-line key:value fact) so it was invisible even when expanded. This
// adds a dedicated, distinguishable section: raw code paths (plain
// monospace) rather than the clickable `REFERENCE_KEYS` ref-token pattern.
describe("DocFrontmatterBlock — 코드 위치 (code location) section", () => {
  const docWithElements: VaultDoc = {
    ...doc,
    frontmatter: {
      ...doc.frontmatter,
      elements: ["mcp/src/index.js", "mcp/src/verify.mjs"],
    },
  };

  it("expanding the block reveals a code-location row for each frontmatter `elements` path", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithElements} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    const section = screen.getByTestId("doc-frontmatter-code-locations");
    expect(within(section).getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(within(section).getByText("mcp/src/verify.mjs")).toBeInTheDocument();
  });

  it("omits the section when the document has no `elements` frontmatter", () => {
    renderBlock();
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByTestId("doc-frontmatter-code-locations")).not.toBeInTheDocument();
  });

  it("excludes `elements` entries that don't look like code paths (e.g. a stray vault-node ref)", () => {
    const mixedDoc: VaultDoc = {
      ...doc,
      frontmatter: {
        ...doc.frontmatter,
        elements: ["mcp/src/index.js", "capabilities/mcp-server"],
      },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={mixedDoc} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    const section = screen.getByTestId("doc-frontmatter-code-locations");
    expect(within(section).getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(within(section).queryByText("capabilities/mcp-server")).not.toBeInTheDocument();
  });

  it("copies the path when the row's copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithElements} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    const copyButtons = screen.getAllByTestId("doc-frontmatter-code-location-copy");
    fireEvent.click(copyButtons[0]);
    expect(writeText).toHaveBeenCalledWith("mcp/src/index.js");
  });
});

// rank7 (design-council B5) — last-edit provenance + expected_mtime conflict.
describe("DocFrontmatterBlock — last-edit provenance", () => {
  function emptyAgentActivityStatus(): AgentActivityStatus {
    return {
      sourcePath: ".ontology-atlas/agent-activity.json",
      exists: false,
      valid: false,
      stale: false,
      ageMs: null,
      heartbeat: null,
      reviewMode: "none",
      reviewTarget: { kind: "none", ontologySlug: null, files: [], label: "none" },
      proof: { count: 0, sources: { mcp: 0, source: 0, verification: 0 }, label: "" },
      refreshRequest: {
        required: false,
        reason: null,
        previousAgent: null,
        previousState: null,
        previousFocus: null,
        previousOntologySlug: null,
        previousFiles: [],
        previousAgeMs: null,
        command: null,
        message: null,
      },
      errorMessage: null,
    };
  }

  function freshHeartbeatStatus(): AgentActivityStatus {
    return {
      ...emptyAgentActivityStatus(),
      exists: true,
      valid: true,
      stale: false,
      ageMs: 1000,
      heartbeat: {
        agent: "claude-code",
        state: "editing",
        focus: {
          summary: "working",
          ontologySlug: "capabilities/cli-developer-entry",
          files: [],
        },
        plan: [],
        evidence: { mcp: [], source: [], codegraph: [], verification: [] },
        updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      },
    };
  }

  it("renders no subject row when neither a heartbeat nor a self-edit record exists (no fabrication)", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={doc} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("last-edit-subject-row")).not.toBeInTheDocument();
  });

  it("renders the AI agent subject when a fresh heartbeat names this doc", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={doc} agentActivityStatus={freshHeartbeatStatus()} />
      </NextIntlClientProvider>,
    );
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "agent");
    expect(row).toHaveTextContent("AI 에이전트");
  });

  it("renders the human subject when this session self-wrote this exact doc", () => {
    const selfEditTimestamps = new Map([[doc.slug, Date.now() - 60_000]]);
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock
          doc={doc}
          agentActivityStatus={emptyAgentActivityStatus()}
          selfEditTimestamps={selfEditTimestamps}
        />
      </NextIntlClientProvider>,
    );
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "human");
    expect(row).toHaveTextContent("나");
  });

  it("renders no conflict badge when the doc's mtime has not changed since it was opened", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={{ ...doc, mtime: 1000 }} agentActivityStatus={emptyAgentActivityStatus()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("mtime-conflict-badge")).not.toBeInTheDocument();
  });

  it("renders the conflict badge when the doc's mtime changes externally after it was opened", () => {
    const changingDoc = { ...doc, mtime: 1000 };
    const { rerender } = render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={changingDoc} agentActivityStatus={emptyAgentActivityStatus()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("mtime-conflict-badge")).not.toBeInTheDocument();

    // simulate the background poller picking up an EXTERNAL edit (no
    // self-edit record for this slug) while the panel stays mounted.
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={{ ...changingDoc, mtime: 2000 }} agentActivityStatus={emptyAgentActivityStatus()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("mtime-conflict-badge")).toBeInTheDocument();
  });

  it("does not flag a conflict when the mtime change is explained by this session's own save", () => {
    const changingDoc = { ...doc, mtime: 1000 };
    const selfEditTimestamps = new Map([[doc.slug, Date.now() + 10_000]]);
    const { rerender } = render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock
          doc={changingDoc}
          agentActivityStatus={emptyAgentActivityStatus()}
          selfEditTimestamps={new Map()}
        />
      </NextIntlClientProvider>,
    );
    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock
          doc={{ ...changingDoc, mtime: 2000 }}
          agentActivityStatus={emptyAgentActivityStatus()}
          selfEditTimestamps={selfEditTimestamps}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("mtime-conflict-badge")).not.toBeInTheDocument();
  });
});
