import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import type { OntologyChangeset } from "@/entities/knowledge-graph/lib/ontology-tree";
import { AtlasGitPanel } from "./AtlasGitPanel";

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

/**
 * The desktop file watcher's event channel. `listen` hands back the handlers so a test can
 * play the role of the Rust watcher and say "the folder changed".
 */
const tauriEventMock = vi.hoisted(() => ({
  handlers: [] as Array<(event: { payload: unknown }) => void>,
  listen: vi.fn(async (_name: string, handler: (event: { payload: unknown }) => void) => {
    tauriEventMock.handlers.push(handler);
    return () => {
      tauriEventMock.handlers = tauriEventMock.handlers.filter((h) => h !== handler);
    };
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriEventMock.listen,
}));

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
  tauriEventMock.handlers = [];
  tauriEventMock.listen.mockClear();
});

function renderPanel(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const STATUS_WITH_CHANGES = {
  initialized: true,
  repoRoot: "/repo",
  branch: "main",
  upstream: "origin/main",
  changedCount: 2,
  stagedOutsideVault: [],
  ahead: 2,
  behind: 1,
};

const DIFF_WITH_CHANGES = {
  count: 2,
  files: [
    {
      path: "docs/capabilities/foo.md",
      status: "added",
      kind: "capability",
      slug: "capabilities/foo",
      renamedFrom: null,
    },
    {
      path: "docs/elements/bar.md",
      status: "modified",
      kind: "element",
      slug: "elements/bar",
      renamedFrom: null,
    },
  ],
  diff: "diff --git a/docs/elements/bar.md b/docs/elements/bar.md\n+new line\n",
};

const HISTORY = [
  {
    shortHash: "abc1234",
    hash: "abc1234def5678",
    subject: "ontology snapshot: +1 concept (capabilities/foo)",
    relativeTime: "2 hours ago",
    isoTime: "2026-07-23T10:00:00+09:00",
    files: [
      {
        path: "docs/capabilities/foo.md",
        status: "added",
        kind: "capability",
        slug: "capabilities/foo",
        renamedFrom: null,
      },
    ],
  },
];

/** What one step actually wrote — the patch from `git show`. */
const COMMIT_PATCH = [
  "diff --git a/docs/capabilities/foo.md b/docs/capabilities/foo.md",
  "index 05d74bf..e04bf82 100644",
  "--- a/docs/capabilities/foo.md",
  "+++ b/docs/capabilities/foo.md",
  "@@ -0,0 +1 @@",
  "+한 줄 새로 씀",
  "",
].join("\n");

function installDesktopGit({
  status = STATUS_WITH_CHANGES,
  diff = DIFF_WITH_CHANGES,
  history = HISTORY,
  snapshot = { committed: true, subject: "s", summary: "s", push: null },
  init = {
    initialized: true,
    reason: null,
    repoRoot: "/repo",
    branch: "main",
    changedCount: 3,
  },
  setRemote = {
    ok: true,
    remote: "origin",
    url: "git@github.com:me/repo.git",
    replaced: null,
  },
  probe = { installed: true, version: "git version 2.49.0" },
  // `git_fetch` answers with a code now, not a sentence: only the screen knows the
  // reader's language, and only the screen already holds `ahead`/`behind`.
  fetch = { ok: true, upstream: "origin/main", ahead: 2, behind: 0, summary: "remote-diverged" },
  pull = { ok: true, upstream: "origin/main", summary: "1개 받아옴" },
  restore = (args: Record<string, unknown>) => ({
    restored: true,
    path: args.relativePath,
    source: args.source,
    previousStatus: "modified",
  }),
}: {
  status?: unknown;
  diff?: unknown;
  history?: unknown;
  snapshot?: unknown;
  init?: unknown;
  setRemote?: unknown;
  probe?: unknown;
  fetch?: unknown;
  pull?: unknown;
  restore?: unknown;
} = {}) {
  tauriApiMock.runtimeAvailable = true;
  tauriApiMock.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === "git_status") return status;
    if (command === "git_diff") return diff;
    if (command === "git_commit_diff") return { count: 0, files: [], diff: COMMIT_PATCH };
    if (command === "git_history")
      return typeof history === "function"
        ? history(Number(args?.limit ?? 0), (args?.path as string | undefined) ?? undefined)
        : history;
    if (command === "git_snapshot") return snapshot;
    if (command === "git_init") return init;
    if (command === "git_set_remote") return setRemote;
    if (command === "git_probe") return probe;
    if (command === "git_fetch") return fetch;
    if (command === "git_pull") return pull;
    if (command === "git_restore_file")
      return typeof restore === "function" ? restore(args ?? {}) : restore;
    throw new Error(`unexpected command: ${command}`);
  });
}

function snapshotInvokeCalls() {
  return tauriApiMock.invoke.mock.calls.filter(([command]) => command === "git_snapshot");
}

describe("AtlasGitPanel — 웹(브라우저 vault) 강등", () => {
  it("renders the session changeset summary, CLI command, and desktop hint without any invoke", async () => {
    const changeset = {
      addedNodes: ["a"],
      removedNodes: [],
      changedNodes: ["b", "c"],
      addedEdges: ["e1"],
      removedEdges: [],
      total: 4,
      touchedNodeIds: new Set(["a", "b", "c"]),
      removedNodeKinds: new Map(),
    } satisfies OntologyChangeset;

    renderPanel(<AtlasGitPanel sessionChangeset={changeset} />);

    // The old `atlas-git-web-body` became the setup frame (2026-07-26). The web
    // degradation is now one of the "cannot do its job yet" states, and all three
    // (web · no folder · not yet recording) share one frame and measure.
    const setup = await screen.findByTestId("atlas-git-setup");
    expect(setup).toHaveAttribute("data-setup-state", "web");
    expect(screen.getByText("개념 추가 1")).toBeInTheDocument();
    expect(screen.getByText("개념 수정 2")).toBeInTheDocument();
    expect(screen.getByText("관계 추가 1")).toBeInTheDocument();
    // **There is no terminal escape** (owner call, 2026-08-09). The command only
    // ran if `$ATLAS` pointed at this repository's source folder, so only people
    // who cloned could use it, and a vault that is a git repo needs nothing but
    // `git commit`. This stops it coming back.
    expect(screen.queryByTestId("atlas-git-web-copy")).toBeNull();
    expect(screen.queryByText(/cli\/src\/index\.mjs snapshot/)).toBeNull();
    expect(
      screen.getByText(
        "브라우저는 이 컴퓨터의 git을 실행할 권한이 없어요. 무엇이 바뀌었는지는 여기서 그대로 보여드릴게요.",
      ),
    ).toBeInTheDocument();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it("shows the empty-session message when the changeset has no changes", async () => {
    renderPanel(<AtlasGitPanel sessionChangeset={null} />);
    // The empty-state sentence no longer repeats the section label; it is short
    // status copy instead.
    expect(await screen.findByText("아직 없어요. 문서를 고치면 여기에 나타나요.")).toBeInTheDocument();
  });
});

describe("AtlasGitPanel — 데스크톱(Tauri)", () => {
  it("shows the kind-grouped change summary and recent history", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // The pane reads documents (owner direction B, 2026-09-19): one line of totals, then a
    // chip per changed document named by its concept — no kind label over a single row.
    const groups = await screen.findByTestId("atlas-git-change-groups");
    expect(groups).toHaveTextContent("추가 1");
    expect(groups).toHaveTextContent("수정 1");
    expect(groups).toHaveTextContent("foo");
    expect(groups).toHaveTextContent("bar");
    expect(groups).not.toHaveTextContent("capability");
    // The document with changed lines opens by default, whole, with its path named once.
    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("docs/elements/bar.md");

    // #85 — history is the evidence pane's second tab (left: what to record, right: evidence).
    const step = screen.getByTestId("atlas-git-history-item");
    // 2026-07-27 — a step's summary reads in **human language**. The commit
    // subject `ontology snapshot: +1 concept (…)` is a string we wrote, and
    // letting it be read raw on a Korean screen means we did not translate our own
    // string.
    expect(step).toHaveTextContent("추가 1");
    expect(step).toHaveTextContent("capabilities/foo");
    // The hash belongs to **the detail, not the row** (measured on the mockup). A
    // list's job is scanning, and squeezing the hash into one row of three columns
    // (time · name · why) pushes "why" out.
    expect(step).not.toHaveTextContent("abc1234");
    expect(step).not.toHaveTextContent("ontology snapshot");

    // The raw text does not disappear — expanding shows it as the audit trail.
    fireEvent.click(step);
    expect(await screen.findByTestId("atlas-git-history-detail")).toHaveTextContent(
      "ontology snapshot: +1 concept (capabilities/foo)",
    );
  });

  it("localizes step time from the ISO instant and falls back to the raw bridge text", async () => {
    const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const isoTime = new Date(nowMs - 2 * 60 * 60 * 1_000).toISOString();
    installDesktopGit({
      history: [
        {
          ...HISTORY[0],
          hash: "localized-time",
          shortHash: "localiz",
          isoTime,
          relativeTime: "RAW ENGLISH TIME",
        },
        {
          ...HISTORY[0],
          hash: "fallback-time",
          shortHash: "fallbac",
          isoTime: "not-an-iso-instant",
          relativeTime: "RAW FALLBACK TIME",
        },
      ],
    });
    try {
      renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

      const steps = await screen.findAllByTestId("atlas-git-history-item");
      expect(steps[0]).toHaveTextContent("2시간 전");
      expect(steps[0]).not.toHaveTextContent("RAW ENGLISH TIME");
      expect(steps[1]).toHaveTextContent("RAW FALLBACK TIME");

      fireEvent.click(steps[0]);
      const detail = await screen.findByTestId("atlas-git-history-detail");
      expect(detail).toHaveTextContent(isoTime);
      expect(detail).toHaveTextContent("2시간 전");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("rebases localized step time when a snapshot refreshes the workspace", async () => {
    let nowMs = Date.parse("2026-08-24T12:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const isoTime = new Date(nowMs - 2 * 60 * 60 * 1_000).toISOString();
    installDesktopGit({
      history: () => [
        {
          ...HISTORY[0],
          isoTime,
          relativeTime: "RAW ENGLISH TIME",
        },
      ],
    });

    try {
      renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
      expect(await screen.findByTestId("atlas-git-history-item")).toHaveTextContent("2시간 전");

      nowMs += 3 * 60 * 60 * 1_000;
      fireEvent.click(screen.getByTestId("atlas-git-snapshot-button"));
      fireEvent.click(await screen.findByTestId("atlas-git-confirm-button"));

      await waitFor(() =>
        expect(screen.getByTestId("atlas-git-history-item")).toHaveTextContent("5시간 전"),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does NOT invoke git_snapshot before the explicit confirm click (신뢰 헌장 — 자동 실행 0)", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const snapshotButton = await screen.findByTestId("atlas-git-snapshot-button");
    expect(snapshotInvokeCalls()).toHaveLength(0);

    fireEvent.click(snapshotButton);
    // The confirm step merely opened — still 0 invokes.
    expect(await screen.findByTestId("atlas-git-confirm-step")).toBeInTheDocument();
    expect(snapshotInvokeCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("atlas-git-confirm-button"));
    await waitFor(() => expect(snapshotInvokeCalls()).toHaveLength(1));
    // push is opt-in, off by default.
    expect(snapshotInvokeCalls()[0][1]).toMatchObject({ vaultPath: "/repo/vault", push: false });
  });

  it("passes push:true only when the opt-in checkbox is explicitly checked", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    fireEvent.click(await screen.findByTestId("atlas-git-snapshot-button"));
    const checkbox = screen.getByTestId("atlas-git-push-optin");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId("atlas-git-confirm-button"));
    await waitFor(() => expect(snapshotInvokeCalls()).toHaveLength(1));
    expect(snapshotInvokeCalls()[0][1]).toMatchObject({ push: true });
  });

  it("disables the snapshot button and says 모두 커밋했어요 when there are no changes", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const button = await screen.findByTestId("atlas-git-snapshot-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("모두 커밋했어요");
  });

  it("offers a working start button — not a dead end — when the vault is outside a git repo", async () => {
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // The defect on this screen was "guidance with nothing to press", so the
    // button's existence is itself the contract.
    //
    // 2026-08-02: the title and 「How to undo」 **moved** to the
    // stage's h1 and last line. The contract is "it is on this screen", not "it is
    // inside this div", so the scope rises to the setup stage — otherwise the gate
    // holds a DOM position rather than content every time the layout changes.
    await screen.findByTestId("atlas-git-not-initialized");
    const setup = screen.getByTestId("atlas-git-setup");
    expect(setup).toHaveTextContent("git을 연동하면 변경이 쌓여요");
    expect(screen.getByTestId("atlas-git-init")).toBeEnabled();
    // Say what will be created, and how to undo it, before it is pressed.
    expect(setup).toHaveTextContent(".git");
    expect(setup).toHaveTextContent("그만두려면");
    expect(screen.queryByTestId("atlas-git-snapshot-button")).not.toBeInTheDocument();
  });

  it("자동 실행 0 — 마운트만으로는 git_init을 절대 호출하지 않는다", async () => {
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-init");

    // Trust charter: a write command only after a user click. Reads (git_status) are fine.
    const writes = tauriApiMock.invoke.mock.calls.filter(
      ([cmd]) => cmd === "git_init" || cmd === "git_set_remote" || cmd === "git_snapshot",
    );
    expect(writes).toHaveLength(0);
  });

  it("기록 시작 버튼이 git_init을 호출하고, 커밋으로 연쇄하지 않는다", async () => {
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    fireEvent.click(await screen.findByTestId("atlas-git-init"));

    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([cmd]) => cmd === "git_init"),
      ).toHaveLength(1),
    );
    // init only inits — an automatic commit is the real charter violation.
    expect(
      tauriApiMock.invoke.mock.calls.filter(([cmd]) => cmd === "git_snapshot"),
    ).toHaveLength(0);
  });

  it("보낼 곳이 없으면 실패를 알리는 대신 그 자리에서 주소를 받는다", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, upstream: null },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // 2026-07-27 — **the fact in the chrome, the input on demand.** The same fact
    // used to sit **above** the content as a rounded card with a left amber rail,
    // so a user who came to read history got a settings pitch as a first
    // impression (a charter-forbidden pattern plus amber creep).
    const location = await screen.findByTestId("atlas-git-location");
    expect(location).toHaveTextContent("원격 저장소가 아직 없어요");
    // The input is not there yet — it does not sit there permanently.
    expect(screen.queryByTestId("atlas-git-remote-setup")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("atlas-git-remote-toggle"));
    expect(screen.getByTestId("atlas-git-remote-setup")).toBeInTheDocument();

    // An empty input cannot be submitted.
    expect(screen.getByTestId("atlas-git-remote-submit")).toBeDisabled();

    fireEvent.change(screen.getByTestId("atlas-git-remote-input"), {
      target: { value: "git@github.com:me/repo.git" },
    });
    fireEvent.click(screen.getByTestId("atlas-git-remote-submit"));

    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([cmd]) => cmd === "git_set_remote"),
      ).toHaveLength(1),
    );
    // Registering an address is not sending — the user has to press send separately.
    expect(
      tauriApiMock.invoke.mock.calls.filter(([cmd]) => cmd === "git_snapshot"),
    ).toHaveLength(0);
  });

  it("upstream이 있으면 주소 입력 칸을 띄우지 않는다", async () => {
    installDesktopGit({
      status: STATUS_WITH_CHANGES,
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-panel");
    expect(screen.queryByTestId("atlas-git-remote-setup")).not.toBeInTheDocument();
  });

  /*
   * The tabs are gone (2026-08-02). 「Changes / Commit History」 are really *not
   * committed vs committed*, which the list's position already states —
   * uncommitted at the top, committed below. So this test now pins the **default
   * selection**: when there is something to commit it is open and its changes are
   * visible immediately.
   */
  it("커밋할 게 있으면 그 변경이 기본으로 열려 있다 — 탭을 눌러 찾지 않는다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("new line");
    // The uncommitted row is at the top of the list and is the one selected.
    const pending = screen.getByTestId("atlas-git-pending-row");
    // 2026-08-15 (8) — this row is "what I am looking at", not a pressed button.
    // The sibling commit rows already use `aria-expanded`, so pressed here would
    // split one list across two vocabularies.
    expect(pending).toHaveAttribute("aria-current", "true");
    // The tab buttons no longer exist.
    expect(screen.queryByTestId("atlas-git-diff-toggle")).toBeNull();
    expect(screen.queryByTestId("atlas-git-history-tab")).toBeNull();
  });

  it("고른 걸음은 바뀐 파일과 그 걸음이 쓴 원문까지 보여준다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-steps");
    fireEvent.click(screen.getByTestId("atlas-git-history-item"));

    // Files are a **different lens** — identity (title, hash) stays and only the presentation changes.
    fireEvent.click(await screen.findByTestId("atlas-git-lens-files"));

    // Changed files — the "what". If history named only concepts, a step that
    // touched non-concept files would vanish from the screen entirely.
    const files = await screen.findAllByTestId("atlas-git-commit-file");
    expect(files.map((el) => el.textContent).join(" ")).toContain(
      "docs/capabilities/foo.md",
    );

    // Changed content — the "how". Raw rather than summarised, so it matches what the terminal shows.
    const patch = await screen.findByTestId("atlas-git-commit-diff");
    expect(patch).toHaveTextContent("한 줄 새로 씀");

    // And **the noise is not shown**. `diff --git`, `index`, `---` and `+++` all
    // say one thing — the file name — so the four fold into one heading line.
    // Without this assertion, the next person could revert the parser unnoticed.
    expect(patch.textContent).not.toContain("diff --git");
    expect(patch.textContent).not.toContain("index 05d74bf");
    // The file name is carried by **the list above** — the patch box does not repeat it.
    expect(patch.textContent).not.toContain("docs/capabilities/foo.md");
  });

  it("새 걸음으로 바뀐 뒤 늦은 이전 git show 응답을 버린다", async () => {
    const newer = {
      ...HISTORY[0],
      shortHash: "def5678",
      hash: "def5678abc1234",
      subject: "newer snapshot",
      files: [
        {
          path: "docs/elements/newer.md",
          status: "modified" as const,
          kind: "element",
          slug: "elements/newer",
          renamedFrom: null,
        },
      ],
    };
    let resolveOlder!: (value: unknown) => void;
    let resolveNewer!: (value: unknown) => void;
    const older = new Promise<unknown>((resolve) => {
      resolveOlder = resolve;
    });
    const newerResult = new Promise<unknown>((resolve) => {
      resolveNewer = resolve;
    });

    installDesktopGit({ history: [HISTORY[0], newer] });
    const standardInvoke = tauriApiMock.invoke.getMockImplementation()!;
    tauriApiMock.invoke.mockImplementation((command: string, args?: { hash?: string }) => {
      if (command === "git_commit_diff") {
        return args?.hash === newer.hash ? newerResult : older;
      }
      return standardInvoke(command);
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const steps = await screen.findAllByTestId("atlas-git-history-item");
    fireEvent.click(steps[0]);
    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([command]) => command === "git_commit_diff"),
      ).toHaveLength(1),
    );
    fireEvent.click(steps[1]);
    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([command]) => command === "git_commit_diff"),
      ).toHaveLength(2),
    );

    await act(async () => {
      resolveNewer({
        count: 1,
        files: [],
        diff: "diff --git a/docs/elements/newer.md b/docs/elements/newer.md\n@@ -0,0 +1 @@\n+newer result\n",
      });
      await Promise.resolve();
    });
    expect(await screen.findByTestId("atlas-git-commit-diff")).toHaveTextContent("newer result");

    await act(async () => {
      resolveOlder({
        count: 1,
        files: [],
        diff: "diff --git a/docs/capabilities/older.md b/docs/capabilities/older.md\n@@ -0,0 +1 @@\n+older stale result\n",
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId("atlas-git-commit-diff")).toHaveTextContent("newer result");
    expect(screen.getByTestId("atlas-git-commit-diff")).not.toHaveTextContent("older stale result");
  });

  it("커밋 이력이 탭 뒤에 숨지 않는다 — 목록에 늘 있다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    const steps = await screen.findByTestId("atlas-git-steps");
    expect(steps).toHaveTextContent("capabilities/foo");
  });

  it("expands a history item to its full hash + iso time on click", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    await screen.findByTestId("atlas-git-steps");
    fireEvent.click(screen.getByTestId("atlas-git-history-item"));
    expect(await screen.findByTestId("atlas-git-history-detail")).toHaveTextContent(
      "abc1234def5678",
    );
  });

  it("목적지에는 닫기가 없다 — 제목은 페이지 헤드라인이다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-panel");

    // When the modal was deleted (#78 Scope 2) this panel's only consumer became
    // the `/git/` destination. A destination has no "close" — leaving is going
    // elsewhere on the rail.
    expect(screen.queryByTestId("atlas-git-close")).not.toBeInTheDocument();
    // An h1, not an 11px mono eyebrow — measured, that was far too small for a page title.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("기록");
  });
});

/**
 * 2026-07-26 redesign — the contract for the two shapes (setup / workbench) split
 * by "can this screen do its job right now".
 */
describe("AtlasGitPanel — 연결 셋업 모드", () => {
  it("연결 전 세 상태는 같은 셋업 프레임을 쓴다 — 걸음마다 표면이 바뀌지 않는다", async () => {
    // ① web
    const web = renderPanel(<AtlasGitPanel />);
    expect(await screen.findByTestId("atlas-git-setup")).toHaveAttribute(
      "data-setup-state",
      "web",
    );
    web.unmount();

    // ② in the app, but no folder
    tauriApiMock.runtimeAvailable = true;
    const noVault = renderPanel(<AtlasGitPanel vaultPath={null} />);
    expect(await screen.findByTestId("atlas-git-setup")).toHaveAttribute(
      "data-setup-state",
      "no-vault",
    );
    noVault.unmount();

    // ③ app plus folder, but not yet recording
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    // loading → not yet recording. Loading uses the same frame (so the screen does
    // not jump as state changes), which is why this waits on the state attribute
    // rather than a testid.
    await waitFor(() =>
      expect(screen.getByTestId("atlas-git-setup")).toHaveAttribute(
        "data-setup-state",
        "not-initialized",
      ),
    );
  });

  it("앱 안에서 폴더가 없으면 앱을 받으라고 하지 않는다 — 폴더 고르기로 보낸다", async () => {
    // Regression guard: this state used to fall through to the web degradation,
    // showing a user **already in the app** the false guidance "the browser has no
    // permission to run git / get the app →".
    tauriApiMock.runtimeAvailable = true;
    renderPanel(<AtlasGitPanel vaultPath={null} />);

    expect(await screen.findByTestId("atlas-git-pick-vault")).toBeInTheDocument();
    expect(screen.queryByTestId("atlas-git-web-get-app")).not.toBeInTheDocument();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it("사다리는 세 걸음뿐이다 — 보낼 곳 등록은 선택이라 걸음이 아니다", async () => {
    renderPanel(<AtlasGitPanel />);

    const ladder = await screen.findByTestId("atlas-git-ladder");
    const steps = ladder.querySelectorAll("li");
    expect(steps).toHaveLength(3);
    // On the web the first step is "what to do now" and the rest are still ahead.
    expect(steps[0]).toHaveAttribute("data-step-state", "current");
    expect(steps[1]).toHaveAttribute("data-step-state", "todo");
    expect(steps[2]).toHaveAttribute("data-step-state", "todo");
    expect(ladder).not.toHaveTextContent("보낼");
  });

  it("기록 시작 전에는 사다리 세 번째 걸음이 지금 할 일이다", async () => {
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const ladder = await screen.findByTestId("atlas-git-ladder");
    const steps = ladder.querySelectorAll("li");
    expect(steps[0]).toHaveAttribute("data-step-state", "done");
    expect(steps[1]).toHaveAttribute("data-step-state", "done");
    expect(steps[2]).toHaveAttribute("data-step-state", "current");
  });

  it("셋업 주 동작은 터치 승격 토큰으로 높이를 잡는다 (coarse 44px 계약)", async () => {
    // This button is the only thing this page does, so if someone reverts it to a
    // fixed height like h-9, the `@media (pointer: coarse)` promotion silently disappears.
    renderPanel(<AtlasGitPanel />);
    const cta = await screen.findByTestId("atlas-git-web-get-app");
    expect(cta.className).toContain("h-[var(--git-setup-action-height)]");
  });

  it("읽기 실패도 막다른 길이 아니다 — 같은 자리에서 다시 확인한다", async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockRejectedValue("not a git repository");
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    expect(await screen.findByTestId("atlas-git-load-error")).toBeInTheDocument();
    const retry = screen.getByTestId("atlas-git-retry");
    tauriApiMock.invoke.mockReset();
    tauriApiMock.invoke.mockImplementation(async (command: string) => {
      if (command === "git_status") return STATUS_WITH_CHANGES;
      if (command === "git_diff") return DIFF_WITH_CHANGES;
      if (command === "git_history") return HISTORY;
      throw new Error(`unexpected command: ${command}`);
    });
    fireEvent.click(retry);

    expect(await screen.findByTestId("atlas-git-workbench")).toBeInTheDocument();
  });

  it("연결이 끝나면 셋업 프레임이 사라지고 작업대가 온다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    expect(await screen.findByTestId("atlas-git-workbench")).toBeInTheDocument();
    expect(screen.queryByTestId("atlas-git-setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("atlas-git-ladder")).not.toBeInTheDocument();
  });
});

describe("AtlasGitPanel — 작업대 빈 상태", () => {
  it("다 커밋한 상태에서도 작업대는 한 모양이다 — 열이 사라지지 않는다", async () => {
    /*
     * The old contract was "with 0 uncommitted, do not make the column"
     * (`data-shape="recall"`). That was **a judgement made before the two-column
     * switch**, when the right side was 「Evidence」 (evidence) and there really was
     * nothing to show. Now the right side is **the detail of what is selected**,
     * and choosing a commit fills it with changed concepts, the ego drawing and
     * the changed content. While that branch survived, a vault with four commits
     * lost half the screen outright (owner measurement, 2026-08-02).
     *
     * There is one shape. Whether anything is uncommitted shows up only as the
     * presence or absence of the list's top row.
     */
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const workbench = await screen.findByTestId("atlas-git-workbench");
    expect(workbench).toHaveAttribute("data-shape", "decide");
    // Commit history is still in the list.
    expect(screen.getByTestId("atlas-git-history-item")).toBeInTheDocument();
    // Only the uncommitted row is missing.
    expect(screen.queryByTestId("atlas-git-pending-row")).toBeNull();
    // The detail column is alive — the default selection is the most recent commit.
    expect(screen.getByTestId("atlas-git-evidence")).toBeInTheDocument();
  });

  it("`모두 커밋했어요` 를 화면에 두 번 쓰지 않는다", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    await screen.findByTestId("atlas-git-snapshot-button");
    expect(screen.getAllByText("모두 커밋했어요")).toHaveLength(1);
    // Instead of repeating the same sentence, the list position states what the current state is.
    expect(
      screen.getByText("지금 이 폴더와 마지막 커밋이 같아요. 문서를 고치면 여기에 나타나요."),
    ).toBeInTheDocument();
  });

  it("커밋 버튼과 결과 문장이 키 경로가 아니라 문장을 그린다 (ICU 인자 계약)", async () => {
    installDesktopGit({
      snapshot: {
        committed: true,
        reason: null,
        commitHash: "abc",
        subject: "s",
        summary: "s",
        counts: { added: 1, modified: 1, deleted: 0, renamed: 0, total: 2 },
        files: [],
        stagedOutsideVault: [],
        push: null,
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const button = await screen.findByTestId("atlas-git-snapshot-button");
    expect(button).toHaveTextContent("2개 커밋");
    expect(button).not.toHaveTextContent("atlasGit");

    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("atlas-git-confirm-button"));
    const result = await screen.findByTestId("atlas-git-snapshot-result");
    expect(result).toHaveTextContent("2개 커밋했어요");
    expect(result).not.toHaveTextContent("atlasGit");
  });
});

describe("AtlasGitPanel — 원격 세 동작 (Fetch · Pull · Push)", () => {
  /*
   * Pull was **entirely absent** from this screen — present in both the bridge and
   * Rust with 0 callers. Push lived only inside a checkbox on the record confirm
   * step, so with 0 changes to record there was no way to send steps already piled
   * up (owner measurement: ↑2 with nowhere to send). The four below catch that
   * regression.
   */
  it("갈라짐 수치는 **그 숫자가 정당화하는 버튼 위**에 있다", async () => {
    /*
     * A separate 「↑2 ↓1」 chip used to sit apart. The only job those numbers do is
     * tell you which button to press, and apart from it you have to read them and
     * move your eyes again. The chip went and the numbers moved into the labels —
     * reverting that breaks here.
     */
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    expect(await screen.findByTestId("atlas-git-remote-push")).toHaveTextContent("Push 2");
    expect(screen.getByTestId("atlas-git-remote-pull")).toHaveTextContent("Pull 1");
    // The numbers themselves stay for assistive technology (losing the visual chip does not lose the fact).
    expect(screen.getByTestId("atlas-git-divergence")).toHaveTextContent("2");
  });

  it("커밋 제목을 직접 쓰면 그 문장이 그대로 git에 간다", async () => {
    /*
     * The automatic wording says what changed well but never **why**, and why is
     * what someone reading the history later looks for. Leaving it empty still
     * sends the automatic wording, so the path for someone who did nothing is
     * unchanged.
     */
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-snapshot-button"));
    const input = await screen.findByTestId("atlas-git-message-input");
    fireEvent.change(input, { target: { value: "fix: 왜 고쳤는지" } });
    fireEvent.click(screen.getByTestId("atlas-git-confirm-button"));
    await waitFor(() => {
      const call = tauriApiMock.invoke.mock.calls.find(([c]) => c === "git_snapshot");
      expect(call?.[1]).toMatchObject({ message: "fix: 왜 고쳤는지" });
    });
  });

  it("Pull·Push는 할 일이 없어도 **눌린다** — 침묵으로 답하지 않는다", async () => {
    /*
     * Pull used to be disabled when `behind === 0`. But "there is nothing to pull"
     * is **a fact you should be able to press and find out**, not something to
     * answer with a dead button and silence — the screen only holds the count from
     * the last check, and that count may already be stale (owner: *"The button should press first and tell you after."*).
     */
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, ahead: 0, behind: 0 },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    expect(await screen.findByTestId("atlas-git-remote-pull")).toBeEnabled();
    expect(screen.getByTestId("atlas-git-remote-push")).toBeEnabled();
  });

  it("아직 안 보낸 구간이 목록에서 갈린다 — 탭 뒤에 숨기지 않는다", async () => {
    /*
     * Splitting the three states (uncommitted · unpushed · remote-only) into tabs
     * makes each tab hide the others, and this repository already has a decision
     * against that plus a test that holds it. They are stretches of one timeline,
     * so what is needed is a boundary, not a partition.
     */
    installDesktopGit({ status: { ...STATUS_WITH_CHANGES, ahead: 1, behind: 2 } });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    const sections = await screen.findAllByTestId("atlas-git-section");
    const text = sections.map((el) => el.textContent).join(" ");
    expect(text).toContain("아직 안 보냄 1");
    // Steps that exist only on the remote are not in local history, so they are **guidance, not a row**.
    expect(screen.getByTestId("atlas-git-behind-row")).toHaveTextContent("2");
  });

  it("Fetch를 누르면 git_fetch를 부른다 — 그 전에는 0회", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    const btn = await screen.findByTestId("atlas-git-remote-fetch");
    const before = tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_fetch");
    expect(before).toHaveLength(0);
    fireEvent.click(btn);
    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_fetch"),
      ).toHaveLength(1),
    );
  });

  it("fetch가 돌려준 코드를 읽는 사람의 말로 바꿔 적는다", async () => {
    // Rust writes no sentence. The only place that picks one knows the reader's
    // language, and it already holds the ahead/behind counts too.
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-remote-fetch"));
    await waitFor(() => expect(screen.getByText(/내 걸음 2개/)).toBeInTheDocument());
    expect(screen.queryByText(/remote-diverged/)).toBeNull();
  });

  it("Pull을 누르면 git_pull을 부른다 — 이 배선이 없던 것이 결함이었다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-remote-pull"));
    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_pull"),
      ).toHaveLength(1),
    );
  });

  it("Push는 남길 변경이 없어도 눌린다 — 이미 쌓인 걸음을 보내는 길", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0, ahead: 2, behind: 0 },
      diff: { count: 0, files: [], diff: "" },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    const push = await screen.findByTestId("atlas-git-remote-push");
    expect(push).not.toBeDisabled();
    fireEvent.click(push);
    await waitFor(() => {
      const calls = tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_snapshot");
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({ push: true });
    });
  });

  it("보낼 곳이 없으면 세 버튼을 아예 안 그린다 — 누를 수 없는 것을 보여주지 않는다", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, upstream: null, ahead: null, behind: null },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-location");
    expect(screen.queryByTestId("atlas-git-remote-fetch")).toBeNull();
    expect(screen.queryByTestId("atlas-git-remote-pull")).toBeNull();
    expect(screen.queryByTestId("atlas-git-remote-push")).toBeNull();
  });
});

describe("AtlasGitPanel — 걸음의 주어는 개념이다", () => {
  /*
   * This used to guess what changed **by parsing the commit subject**. That only
   * fit subjects our own tool wrote and never fit human commits, so the real
   * screen showed no concepts at all and just listed subjects (owner measurement).
   * #842 ships per-commit kind/slug, so nothing is guessed any more.
   */
  const GRAPH = {
    nodes: [
      {
        id: "capability:foo",
        title: "Foo Capability",
        display: "첫 실행 안내",
        kind: "capability",
        projectIds: [],
        evidenceIds: ["capabilities/foo"],
        hasOwnDocument: true,
        agentSlug: "capabilities/foo",
        ref: null,
        lastApprovedAt: "",
        lastApprovedBy: "",
        summary: null,
      },
    ],
    edges: [],
  } as unknown as NonNullable<Parameters<typeof AtlasGitPanel>[0]["graph"]>;

  const HISTORY_WITH_FILES = [
    {
      shortHash: "abc1234",
      hash: "abc1234def5678",
      subject: "fix: 사람이 직접 쓴 커밋 제목이라 파싱으로는 못 읽는다",
      relativeTime: "2 hours ago",
      isoTime: "2026-07-23T10:00:00+09:00",
      files: [
        {
          path: "docs/capabilities/foo.md",
          status: "modified",
          kind: "capability",
          slug: "capabilities/foo",
          renamedFrom: null,
        },
      ],
    },
  ];

  it("걸음 행이 커밋 제목이 아니라 개념 이름을 주어로 그린다", async () => {
    installDesktopGit({ history: HISTORY_WITH_FILES });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" graph={GRAPH} />);
    await screen.findByTestId("atlas-git-steps");
    const step = screen.getByTestId("atlas-git-history-item");
    expect(step).toHaveTextContent("첫 실행 안내");
    // The raw text does not disappear — the line below still distinguishes that step.
    expect(step).toHaveTextContent("사람이 직접 쓴 커밋 제목");
  });

  it("볼트의 개념이 아닌 파일만 건드린 걸음은 개념을 지어내지 않는다", async () => {
    installDesktopGit({
      history: [
        {
          ...HISTORY_WITH_FILES[0],
          files: [
            {
              path: "README.md",
              status: "modified",
              kind: null,
              slug: "README",
              renamedFrom: null,
            },
          ],
        },
      ],
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" graph={GRAPH} />);
    await screen.findByTestId("atlas-git-steps");
    expect(screen.getByTestId("atlas-git-history-item")).not.toHaveTextContent("첫 실행 안내");
  });
});

describe("AtlasGitPanel — 고른 개념의 성질과 이웃", () => {
  /*
   * This is where 「See this step on the map」 used to be
   * (owner call: the point was to show everything here, so there is no reason for a
   * button that leaves). So if this position is empty when a concept is clicked,
   * the feature has disappeared.
   */
  const EGO_GRAPH = {
    nodes: [
      {
        id: "capability:foo",
        title: "Foo",
        display: "첫 실행 안내",
        kind: "capability",
        projectIds: ["project:atlas"],
        evidenceIds: ["capabilities/foo"],
        hasOwnDocument: true,
        agentSlug: "capabilities/foo",
        ref: null,
        lastApprovedAt: "",
        lastApprovedBy: "",
        summary: "첫 실행에서 볼트를 만들어 준다",
      },
      {
        id: "project:atlas",
        title: "Atlas",
        display: "아틀라스",
        kind: "project",
        projectIds: [],
        evidenceIds: ["atlas"],
        hasOwnDocument: true,
        agentSlug: "atlas",
        ref: null,
        lastApprovedAt: "",
        lastApprovedBy: "",
        summary: null,
      },
      {
        id: "domain:shell",
        title: "Shell",
        display: "온보딩·배포·앱 셸",
        kind: "domain",
        projectIds: [],
        evidenceIds: ["domains/shell"],
        hasOwnDocument: true,
        agentSlug: "domains/shell",
        ref: null,
        lastApprovedAt: "",
        lastApprovedBy: "",
        summary: null,
      },
    ],
    edges: [
      {
        id: "e1",
        from: "domain:shell",
        to: "capability:foo",
        type: "contains",
        projectIds: [],
        evidenceIds: [],
        lastApprovedAt: "",
        lastApprovedBy: "",
      },
    ],
  } as unknown as NonNullable<Parameters<typeof AtlasGitPanel>[0]["graph"]>;

  const HISTORY = [
    {
      shortHash: "abc1234",
      hash: "abc1234def5678",
      subject: "fix: 무언가 고쳤다",
      relativeTime: "2 hours ago",
      isoTime: "2026-07-23T10:00:00+09:00",
      files: [
        {
          path: "docs/capabilities/foo.md",
          status: "modified",
          kind: "capability",
          slug: "capabilities/foo",
          renamedFrom: null,
        },
      ],
    },
  ];

  it("걸음을 펼치면 그 개념의 성질과 이웃이 그 자리에 뜬다", async () => {
    installDesktopGit({ history: HISTORY });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" graph={EGO_GRAPH} />);
    await screen.findByTestId("atlas-git-steps");
    fireEvent.click(screen.getByTestId("atlas-git-history-item"));
    const ego = await screen.findByTestId("atlas-git-concept-ego");
    expect(ego).toHaveTextContent("첫 실행 안내");
    // The owning domain comes from the belongsTo neighbours — 「Belongs to」 has to be drawn.
    expect(ego).toHaveTextContent("상위 항목");

    /*
     * **Withholding what you already know is an omission, not a degradation.** The
     * screen was not using three things the graph node already carries — the
     * one-line summary a person reads first, the project this concept belongs to,
     * and **the reference an agent uses for it**. Without the last one this screen has
     * answered only one of its two users.
     */
    expect(ego).toHaveTextContent("첫 실행에서 볼트를 만들어 준다");
    expect(ego).toHaveTextContent("아틀라스");
    expect(ego).toHaveTextContent("capabilities/foo");
    expect(ego).toHaveTextContent("AI에게 말할 때 쓰는 이름");
    expect(ego).not.toHaveTextContent("에이전트 이름");

    // Relations are **names, not counts** — 「1」 cannot say what the 1 is.
    const neighbors = screen.getAllByTestId("atlas-git-ego-neighbor");
    expect(neighbors.map((el) => el.textContent).join(" ")).toContain("온보딩·배포·앱 셸");
  });

  it("그래프가 없으면 (웹·미로드) 카드를 아예 안 그린다 — 빈 상자를 두지 않는다", async () => {
    installDesktopGit({ history: HISTORY });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-steps");
    fireEvent.click(screen.getByTestId("atlas-git-history-item"));
    expect(screen.queryByTestId("atlas-git-concept-ego")).toBeNull();
  });
});

describe("AtlasGitPanel — 2단 작업대의 선택", () => {
  /*
   * **Selection** took the tabs' place. So if "choose one and the right side
   * changes" stops working, the screen looks fine while doing nothing — back when
   * there were tabs, at least the tabs were visible.
   */
  it("커밋을 고르면 오른쪽이 그 커밋의 상세로 바뀐다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // The default is uncommitted (there are changes) — no detail yet.
    await screen.findByTestId("atlas-git-pending-row");
    expect(screen.queryByTestId("atlas-git-history-detail")).toBeNull();

    fireEvent.click(screen.getByTestId("atlas-git-history-item"));
    expect(await screen.findByTestId("atlas-git-history-detail")).toHaveTextContent(
      "abc1234def5678",
    );
    // Choosing a commit releases the uncommitted row — the two never open at once.
    // An unselected row carries no attribute at all: `aria-current="false"` is
    // noise that tells a screen reader "not current" for no reason (WAI-ARIA: the
    // default is false).
    expect(screen.getByTestId("atlas-git-pending-row")).not.toHaveAttribute("aria-current");
  });

  it("미커밋 줄로 되돌아오면 변경 내용이 다시 보인다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-history-item"));
    await screen.findByTestId("atlas-git-history-detail");

    fireEvent.click(screen.getByTestId("atlas-git-pending-row"));
    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("new line");
    expect(screen.queryByTestId("atlas-git-history-detail")).toBeNull();
  });

  it("커밋할 게 없으면 미커밋 줄을 안 그린다 — 없는 것에 자리를 주지 않는다", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-steps");
    expect(screen.queryByTestId("atlas-git-pending-row")).toBeNull();
  });
});

describe("AtlasGitPanel — git이 없어도 바뀐 것은 보인다", () => {
  /*
   * Owner, 2026-08-02: *"Do people
   * who don't use our git get no history at all?"*
   *
   * They do — `change-baseline-store` holds a per-vault baseline, so this session's
   * changes are known independently of git. But that summary was drawn **only in
   * the web degradation**, so a desktop user who had not turned git on was offered
   * 「Connect」 and never saw what had changed. Withholding what you already know is
   * an omission, not a degradation.
   */
  const CHANGESET = {
    addedNodes: ["a"],
    removedNodes: [],
    changedNodes: ["b", "c"],
    addedEdges: ["e1"],
    removedEdges: [],
    total: 4,
    touchedNodeIds: new Set(["a", "b", "c"]),
    removedNodeKinds: new Map(),
  } satisfies OntologyChangeset;

  it("git 미연동 폴더에서도 이번에 바뀐 것을 보여준다", async () => {
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
        ahead: null,
        behind: null,
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" sessionChangeset={CHANGESET} />);
    const summary = await screen.findByTestId("atlas-git-session-changes");
    expect(summary).toHaveTextContent("개념 추가 1");
    expect(summary).toHaveTextContent("개념 수정 2");
  });

  it("연동 화면이 git을 이름으로 부른다 — 무엇을 켜는지 알 수 있게", async () => {
    installDesktopGit({
      status: {
        initialized: false,
        repoRoot: null,
        branch: null,
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
        ahead: null,
        behind: null,
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    // Before status arrives this is the loading frame, so wait for the connect button.
    expect(await screen.findByTestId("atlas-git-init")).toHaveTextContent("git 연동하기");
    expect(screen.getByTestId("atlas-git-setup")).toHaveTextContent("git을 연동하면 변경이 쌓여요");
  });

  it("웹 강등도 같은 요약 컴포넌트를 쓴다 — 두 곳이 갈라지지 않게", async () => {
    renderPanel(<AtlasGitPanel sessionChangeset={CHANGESET} />);
    expect(await screen.findByTestId("atlas-git-session-changes")).toHaveTextContent("개념 추가 1");
  });
});

describe("AtlasGitPanel — 이력은 끝까지 닿는다", () => {
  /*
   * The screen asked git for ten steps and drew ten, and the list simply stopped. A folder with
   * forty steps kept thirty of them out of reach with no sign that anything was missing
   * (measured with a fourteen-step stub, 2026-09-19: rows=10, then blank column).
   */
  const step = (n: number) => ({
    shortHash: `s${n.toString().padStart(6, "0")}`,
    hash: `s${n.toString().padStart(6, "0")}${"0".repeat(33)}`,
    subject: `docs: step ${n}`,
    relativeTime: `${n} hours ago`,
    isoTime: new Date(Date.parse("2026-09-19T08:00:00Z") - n * 3_600_000).toISOString(),
    files: [],
  });
  const forty = Array.from({ length: 40 }, (_, i) => step(i + 1));

  it("첫 열 개 뒤에 더 보기 줄이 있고, 누르면 더 긴 이력을 읽어 온다", async () => {
    installDesktopGit({ history: (limit: number) => forty.slice(0, limit) });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    await screen.findByTestId("atlas-git-workbench");
    await waitFor(() => expect(screen.getAllByTestId("atlas-git-history-item")).toHaveLength(10));
    expect(screen.queryByTestId("atlas-git-history-end")).toBeNull();

    fireEvent.click(screen.getByTestId("atlas-git-history-more"));
    await waitFor(() => expect(screen.getAllByTestId("atlas-git-history-item")).toHaveLength(20));
    // Only history is re-read — the status and diff already on screen are not asked for again.
    const historyLimits = tauriApiMock.invoke.mock.calls
      .filter(([command]) => command === "git_history")
      .map(([, args]) => (args as { limit: number }).limit);
    expect(Math.max(...historyLimits)).toBeGreaterThan(20);
    expect(snapshotInvokeCalls()).toHaveLength(0);
  });

  it("이력이 다 보이면 더 보기 대신 첫 커밋임을 말한다", async () => {
    installDesktopGit({ history: (limit: number) => forty.slice(0, Math.min(limit, 3)) });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    await screen.findByTestId("atlas-git-workbench");
    await waitFor(() => expect(screen.getAllByTestId("atlas-git-history-item")).toHaveLength(3));
    expect(screen.queryByTestId("atlas-git-history-more")).toBeNull();
    expect(screen.getByTestId("atlas-git-history-end")).toHaveTextContent("첫 커밋");
  });
});

describe("AtlasGitPanel — 자동 제목은 그래프가 있어도 원문으로 새지 않는다", () => {
  /*
   * The 2026-07-27 rule ("a step's summary reads in human language") held only while the row
   * had no concept to name. Once #842 put the concept in the name column, the third column
   * fell back to the raw subject, so the real screen — the one with a graph — read
   * `ontology snapshot: ~1 u…` on every automatic step (measured 2026-09-19).
   */
  const GRAPH = {
    nodes: [
      {
        id: "domain:orders",
        title: "Orders",
        display: "주문",
        kind: "domain",
        projectIds: [],
        evidenceIds: ["domains/orders"],
        hasOwnDocument: true,
        agentSlug: "domains/orders",
        ref: null,
        lastApprovedAt: "",
        lastApprovedBy: "",
        summary: null,
      },
    ],
    edges: [],
  } as unknown as NonNullable<Parameters<typeof AtlasGitPanel>[0]["graph"]>;

  const AUTO_STEP = [
    {
      shortHash: "auto123",
      hash: "auto123def5678",
      subject: "ontology snapshot: ~1 updated (domains/orders)",
      relativeTime: "2 hours ago",
      isoTime: "2026-09-19T06:00:00.000Z",
      files: [
        { path: "domains/orders.md", status: "modified", kind: "domain", slug: "domains/orders", renamedFrom: null },
      ],
    },
  ];

  it("걸음 행의 셋째 열과 상세 제목이 사람 말로 서고, 원문은 상세의 작은 줄에만 남는다", async () => {
    installDesktopGit({ history: AUTO_STEP });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" graph={GRAPH} />);

    const row = await screen.findByTestId("atlas-git-history-item");
    expect(row).toHaveTextContent("주문");
    expect(row).toHaveTextContent("수정 1");
    expect(row).not.toHaveTextContent("ontology snapshot");

    fireEvent.click(row);
    const detail = await screen.findByTestId("atlas-git-history-detail");
    expect(screen.getByTestId("atlas-git-detail-headline")).toHaveTextContent("수정 1");
    expect(screen.getByTestId("atlas-git-detail-headline")).not.toHaveTextContent("ontology snapshot");
    // The audit trail stays: the raw subject is still on screen, one step down.
    expect(detail).toHaveTextContent("ontology snapshot: ~1 updated (domains/orders)");
  });
});

describe("AtlasGitPanel — 열려 있는 동안 폴더를 따라간다", () => {
  /*
   * Read-only follow. An editor or an agent writing to the folder while this screen is open used
   * to leave the count and the preview stale until the next arrival, so the confirm step could
   * say "3 to commit" for a folder that by then held five changes.
   */
  it("vault-changed 가 오면 상태를 다시 읽는다 — 쓰기는 0회", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-workbench");
    await waitFor(() => expect(tauriEventMock.listen).toHaveBeenCalledWith("vault-changed", expect.any(Function)));

    const before = tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_status").length;
    await act(async () => {
      for (const handler of tauriEventMock.handlers) handler({ payload: null });
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    await waitFor(() =>
      expect(tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_status").length).toBeGreaterThan(before),
    );
    expect(snapshotInvokeCalls()).toHaveLength(0);
    expect(tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_init")).toHaveLength(0);
  });

  it("브라우저 강등에서는 워처를 구독하지 않는다", async () => {
    renderPanel(<AtlasGitPanel vaultPath={null} />);
    await screen.findByTestId("atlas-git-web-get-app");
    expect(tauriEventMock.listen).not.toHaveBeenCalled();
  });
});

describe("AtlasGitPanel — 문서 하나를 되돌린다", () => {
  /*
   * The screen's own copy promised that earlier content can be brought back while no restore existed
   * anywhere (2026-09-19). Two doors, two confirms: discard says the lines are unrecoverable,
   * restore-from-commit says the result stays uncommitted and reversible. Both name the
   * documents that stay untouched, and nothing runs before the confirm click.
   */
  const restoreCalls = () =>
    tauriApiMock.invoke.mock.calls.filter(([command]) => command === "git_restore_file");

  it("고른 문서의 변경 버리기 — 확인문이 사라질 줄 수와 남는 문서 수를 말하고, 누르기 전엔 쓰기 0회", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-change-groups");

    const rows = screen.getAllByTestId("atlas-git-change-row");
    const bar = rows.find((row) => row.textContent?.includes("bar"));
    expect(bar).toBeTruthy();
    fireEvent.click(bar!);

    fireEvent.click(await screen.findByTestId("atlas-git-discard"));
    const step = await screen.findByTestId("atlas-git-discard-step");
    expect(step).toHaveTextContent("1줄 추가");
    expect(step).toHaveTextContent("되찾을 수 없어요");
    expect(step).toHaveTextContent("커밋 안 한 변경 1개");
    expect(restoreCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("atlas-git-discard-confirm"));
    await waitFor(() => expect(restoreCalls()).toHaveLength(1));
    expect(restoreCalls()[0][1]).toEqual({
      vaultPath: "/repo/vault",
      relativePath: "docs/elements/bar.md",
      source: "HEAD",
    });
    expect(await screen.findByTestId("atlas-git-restore-notice")).toHaveTextContent("버렸어요");
    expect(snapshotInvokeCalls()).toHaveLength(0);
  });

  it("한 번도 커밋하지 않은 문서에는 버리기 문이 없다 — 버리기가 곧 삭제가 되니까", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-change-groups");
    const rows = screen.getAllByTestId("atlas-git-change-row");
    const foo = rows.find((row) => row.textContent?.includes("foo"));
    fireEvent.click(foo!);
    await waitFor(() => expect(screen.queryByTestId("atlas-git-discard")).toBeNull());
  });

  it("커밋 상세에서 이 시점 내용으로 되돌리기 — 결과가 커밋 안 한 변경으로 남는다고 말하고, 해시를 그대로 보낸다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-history-item"));
    await screen.findByTestId("atlas-git-history-detail");
    fireEvent.click(screen.getByTestId("atlas-git-lens-files"));

    fireEvent.click(await screen.findByTestId("atlas-git-restore"));
    const step = await screen.findByTestId("atlas-git-restore-step");
    expect(step).toHaveTextContent("docs/capabilities/foo.md");
    expect(step).toHaveTextContent("커밋하지 않은 변경으로 남아요");
    expect(restoreCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("atlas-git-restore-confirm"));
    await waitFor(() => expect(restoreCalls()).toHaveLength(1));
    expect(restoreCalls()[0][1]).toEqual({
      vaultPath: "/repo/vault",
      relativePath: "docs/capabilities/foo.md",
      source: "abc1234def5678",
    });
    expect(await screen.findByTestId("atlas-git-restore-notice")).toHaveTextContent("되돌렸어요");
    // The result of what was just done is on screen: the "now" row is selected with this
    // document chosen, so the restored lines are what the right column reads.
    await waitFor(() =>
      expect(screen.getByTestId("atlas-git-pending-row")).toHaveAttribute("aria-current", "true"),
    );
    expect(screen.getByTestId("atlas-git-diff-pre")).toHaveTextContent("docs/capabilities/foo.md");
  });

  it("신원이 다른 시점은 거부되고, 문서가 그대로라는 말이 같이 선다", async () => {
    installDesktopGit({
      restore: () => {
        throw new Error("restore-identity-mismatch: slug domains/orders -> domains/order");
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-history-item"));
    await screen.findByTestId("atlas-git-history-detail");
    fireEvent.click(screen.getByTestId("atlas-git-lens-files"));
    fireEvent.click(await screen.findByTestId("atlas-git-restore"));
    fireEvent.click(await screen.findByTestId("atlas-git-restore-confirm"));

    const error = await screen.findByTestId("atlas-git-restore-error");
    expect(error).toHaveTextContent("신원");
    expect(error).toHaveTextContent("문서는 바뀌지 않았어요");
    // The confirm step stays open: the person can read why and choose again.
    expect(screen.getByTestId("atlas-git-restore-step")).toBeInTheDocument();
  });
});

describe("AtlasGitPanel — 문서 하나의 이력", () => {
  /*
   * "When else did this concept change" used to mean scanning every row for the concept's
   * name. A commit's detail now lists the other steps that touched the focused document,
   * read from git scoped to that path, and a row jumps to that step — reading the list on,
   * page by page, when the step sits below the depth already loaded.
   */
  const step = (n: number, subject: string) => ({
    shortHash: `d${n.toString().padStart(6, "0")}`,
    hash: `d${n.toString().padStart(6, "0")}${"0".repeat(33)}`,
    subject,
    relativeTime: `${n} hours ago`,
    isoTime: new Date(Date.parse("2026-09-19T08:00:00Z") - n * 3_600_000).toISOString(),
    files: [
      { path: "docs/capabilities/foo.md", status: "modified", kind: "capability", slug: "capabilities/foo", renamedFrom: null },
    ],
  });
  // Thirty steps in the repository; the document changed in steps 1 and 25.
  const all = Array.from({ length: 30 }, (_, i) => step(i + 1, `docs: step ${i + 1}`));
  const forDocument = [all[0], all[24]];

  it("상세가 그 문서를 바꾼 다른 커밋을 보여주고, 누르면 목록이 그 커밋까지 읽어 내려가 선택한다", async () => {
    installDesktopGit({
      history: (limit: number, path?: string) => (path ? forDocument.slice(0, limit) : all.slice(0, limit)),
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click((await screen.findAllByTestId("atlas-git-history-item"))[0]);
    await screen.findByTestId("atlas-git-history-detail");
    fireEvent.click(screen.getByTestId("atlas-git-lens-files"));

    const list = await screen.findByTestId("atlas-git-document-history");
    expect(list).toHaveTextContent("이 문서를 바꾼 다른 커밋");
    const rows = screen.getAllByTestId("atlas-git-document-step");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("docs: step 25");
    // Scoped read: git was asked for this document's path.
    const scoped = tauriApiMock.invoke.mock.calls.filter(
      ([command, args]) => command === "git_history" && (args as { path?: string }).path === "docs/capabilities/foo.md",
    );
    expect(scoped.length).toBeGreaterThan(0);

    fireEvent.click(rows[0]);
    // Step 25 lies below the first ten; the list reads on until the row exists and is selected.
    await waitFor(
      () => {
        const selected = screen
          .getAllByTestId("atlas-git-history-item")
          .find((row) => row.getAttribute("aria-expanded") === "true");
        expect(selected).toHaveTextContent("docs: step 25");
      },
      { timeout: 4000 },
    );
    expect(screen.getByTestId("atlas-git-detail-headline")).toHaveTextContent("docs: step 25");
  });

  it("그 문서를 바꾼 커밋이 이것뿐이면 그렇게 말한다", async () => {
    installDesktopGit({ history: (limit: number, path?: string) => (path ? [all[0]] : all.slice(0, limit)) });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click((await screen.findAllByTestId("atlas-git-history-item"))[0]);
    await screen.findByTestId("atlas-git-history-detail");
    fireEvent.click(screen.getByTestId("atlas-git-lens-files"));
    expect(await screen.findByTestId("atlas-git-document-history")).toHaveTextContent("이것뿐이에요");
    expect(screen.queryByTestId("atlas-git-document-step")).toBeNull();
  });
});

describe("AtlasGitPanel — 열리지 않을 문은 그리지 않는다", () => {
  it("커밋이 지운 파일에는 되돌리기 문이 없다 — 그 시점에 내용이 없으니까", async () => {
    installDesktopGit({
      history: [
        {
          shortHash: "del1234",
          hash: "del1234def5678",
          subject: "chore: retire the foo capability",
          relativeTime: "2 hours ago",
          isoTime: "2026-09-19T06:00:00.000Z",
          files: [
            { path: "docs/capabilities/foo.md", status: "deleted", kind: "capability", slug: "capabilities/foo", renamedFrom: null },
          ],
        },
      ],
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-history-item"));
    await screen.findByTestId("atlas-git-history-detail");
    fireEvent.click(screen.getByTestId("atlas-git-lens-files"));
    await screen.findByTestId("atlas-git-commit-file");
    expect(screen.queryByTestId("atlas-git-restore")).toBeNull();
  });

  it("이름을 바꾼 미커밋 문서에는 버리기 문이 없다 — 마지막 커밋은 옛 이름을 갖고 있으니까", async () => {
    installDesktopGit({
      diff: {
        count: 1,
        files: [
          { path: "docs/elements/baz.md", status: "renamed", kind: "element", slug: "elements/baz", renamedFrom: "docs/elements/bar.md" },
        ],
        diff: "",
      },
      status: { ...STATUS_WITH_CHANGES, changedCount: 1 },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    // A rename has no diff lines, so the screen opens on the latest commit; open the "now" row.
    fireEvent.click(await screen.findByTestId("atlas-git-pending-row"));
    await screen.findByTestId("atlas-git-change-groups");
    fireEvent.click(screen.getAllByTestId("atlas-git-change-row")[0]);
    await waitFor(() => expect(screen.getByTestId("atlas-git-change-groups")).toHaveTextContent("baz"));
    expect(screen.queryByTestId("atlas-git-discard")).toBeNull();
  });
});

describe("AtlasGitPanel — 목록은 키보드로 걷는다", () => {
  it("화살표가 행 사이를 옮기고, 탭 정지는 하나뿐이다", async () => {
    const steps = Array.from({ length: 3 }, (_, i) => ({
      shortHash: `k${i}000000`,
      hash: `k${i}${"0".repeat(38)}`,
      subject: `docs: step ${i}`,
      relativeTime: `${i + 1} hours ago`,
      isoTime: new Date(Date.parse("2026-09-19T08:00:00Z") - (i + 1) * 3_600_000).toISOString(),
      files: [],
    }));
    installDesktopGit({ history: steps });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    const rows = await screen.findAllByTestId("atlas-git-history-item");
    expect(rows).toHaveLength(3);

    const list = screen.getByTestId("atlas-git-steps");
    const stops = Array.from(list.querySelectorAll("button")).filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);

    rows[0].focus();
    fireEvent.focus(rows[0]);
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(rows[1]));
    fireEvent.keyDown(rows[1], { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(rows[2]));
    // A press is still the deliberate act: moving focus selected nothing.
    expect(rows[2]).toHaveAttribute("aria-expanded", "false");
  });
});

describe("AtlasGitPanel — 읽기 창은 한 번에 한 문서다", () => {
  it("칩을 바꾸면 이전 문서의 읽기 창은 사라지고 새 문서 하나만 선다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-diff-pre");
    const chips = screen.getAllByTestId("atlas-git-change-row");
    fireEvent.click(chips.find((c) => c.getAttribute("title")?.includes("foo"))!);
    await waitFor(() => expect(screen.getByTestId("atlas-git-diff-pre")).toHaveTextContent("docs/capabilities/foo.md"));
    expect(screen.getAllByTestId("atlas-git-diff-pre")).toHaveLength(1);
    fireEvent.click(chips.find((c) => c.getAttribute("title")?.includes("bar"))!);
    await waitFor(() => expect(screen.getByTestId("atlas-git-diff-pre")).toHaveTextContent("docs/elements/bar.md"));
    expect(screen.getAllByTestId("atlas-git-diff-pre")).toHaveLength(1);
  });
});
