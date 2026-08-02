import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";
import { AtlasGitPanel } from "./AtlasGitPanel";

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
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

/** 한 걸음이 실제로 쓴 것 — `git show` 의 patch. */
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
  fetch = { ok: true, upstream: "origin/main", ahead: 2, behind: 0, summary: "내 걸음 2개 · 원격 걸음 0개" },
  pull = { ok: true, upstream: "origin/main", summary: "1개 받아옴" },
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
} = {}) {
  tauriApiMock.runtimeAvailable = true;
  tauriApiMock.invoke.mockImplementation(async (command: string) => {
    if (command === "git_status") return status;
    if (command === "git_diff") return diff;
    if (command === "git_commit_diff") return { count: 0, files: [], diff: COMMIT_PATCH };
    if (command === "git_history") return history;
    if (command === "git_snapshot") return snapshot;
    if (command === "git_init") return init;
    if (command === "git_set_remote") return setRemote;
    if (command === "git_probe") return probe;
    if (command === "git_fetch") return fetch;
    if (command === "git_pull") return pull;
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

    // 구 `atlas-git-web-body` → 셋업 프레임 (2026-07-26). 웹 강등은 이제
    // "아직 자기 일을 못 하는" 상태 중 하나이고, 셋 상태(웹·폴더 없음·기록
    // 시작 전)가 같은 프레임/측정폭을 공유한다.
    const setup = await screen.findByTestId("atlas-git-setup");
    expect(setup).toHaveAttribute("data-setup-state", "web");
    expect(screen.getByText("개념 추가 1")).toBeInTheDocument();
    expect(screen.getByText("개념 수정 2")).toBeInTheDocument();
    expect(screen.getByText("관계 추가 1")).toBeInTheDocument();
    expect(screen.getByText("node $ATLAS/cli/src/index.mjs snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("atlas-git-web-copy")).toBeInTheDocument();
    expect(
      screen.getByText(
        "브라우저는 이 컴퓨터의 git 을 실행할 권한이 없어요. 무엇이 바뀌었는지는 여기서 그대로 보여드릴게요.",
      ),
    ).toBeInTheDocument();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it("shows the empty-session message when the changeset has no changes", async () => {
    renderPanel(<AtlasGitPanel sessionChangeset={null} />);
    // Image #16 재구성 — 빈 상태 문장이 섹션 라벨("이 세션에서 감지된 변경")을
    // 반복하지 않는 짧은 상태 카피로 교체됨.
    expect(await screen.findByText("아직 없어요. 문서를 고치면 여기에 나타나요.")).toBeInTheDocument();
  });
});

describe("AtlasGitPanel — 데스크톱(Tauri)", () => {
  it("shows the kind-grouped change summary and recent history", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const groups = await screen.findByTestId("atlas-git-change-groups");
    expect(groups).toHaveTextContent("capability");
    expect(groups).toHaveTextContent("추가 1");
    expect(groups).toHaveTextContent("element");
    expect(groups).toHaveTextContent("수정 1");
    expect(groups).toHaveTextContent("capabilities/foo");

    // #85 — 이력은 증거 pane 의 두 번째 탭이다(좌: 무엇을 남길까 / 우: 증거).
    const step = screen.getByTestId("atlas-git-history-item");
    // 2026-07-27 — 걸음 요약은 **사람 말**로 읽힌다. 커밋 제목
    // `ontology snapshot: +1 concept (…)` 은 우리가 만든 문자열이고, 그걸
    // 한국어 화면에서 원문으로 읽히는 것은 우리가 만든 문자열을 우리가
    // 번역하지 않은 것이다.
    expect(step).toHaveTextContent("추가 1");
    expect(step).toHaveTextContent("capabilities/foo");
    // 해시는 **행이 아니라 상세**가 진다 (시안 실측). 목록의 일은 훑는
    // 것이고, 한 줄 3열(시각·이름·왜)에 해시를 끼우면 「왜」가 밀린다.
    expect(step).not.toHaveTextContent("abc1234");
    expect(step).not.toHaveTextContent("ontology snapshot");

    // 다만 원문은 사라지지 않는다 — 펼치면 감사 흔적으로 그대로 있다.
    fireEvent.click(step);
    expect(await screen.findByTestId("atlas-git-history-detail")).toHaveTextContent(
      "ontology snapshot: +1 concept (capabilities/foo)",
    );
  });

  it("does NOT invoke git_snapshot before the explicit confirm click (신뢰 헌장 — 자동 실행 0)", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const snapshotButton = await screen.findByTestId("atlas-git-snapshot-button");
    expect(snapshotInvokeCalls()).toHaveLength(0);

    fireEvent.click(snapshotButton);
    // 확인 스텝이 열렸을 뿐 — 아직 invoke 0.
    expect(await screen.findByTestId("atlas-git-confirm-step")).toBeInTheDocument();
    expect(snapshotInvokeCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("atlas-git-confirm-button"));
    await waitFor(() => expect(snapshotInvokeCalls()).toHaveLength(1));
    // push 는 opt-in 기본 off.
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

    // 이 화면의 결함은 "안내만 있고 누를 것이 없다" 였다 — 버튼 존재 자체가 계약.
    //
    // 2026-08-02: 제목과 「되돌리는 방법」의 **자리가** 바뀌었다(무대의 h1 과
    // 마지막 줄). 계약은 "이 화면에 있다" 이지 "이 div 안에 있다" 가 아니므로
    // 범위를 셋업 무대로 올린다 — 안 그러면 배치를 고칠 때마다 게이트가
    // 내용이 아니라 DOM 위치를 붙든다.
    await screen.findByTestId("atlas-git-not-initialized");
    const setup = screen.getByTestId("atlas-git-setup");
    expect(setup).toHaveTextContent("git 을 연동하면 변경이 쌓여요");
    expect(screen.getByTestId("atlas-git-init")).toBeEnabled();
    // 무엇이 만들어지는지 + 되돌리는 방법을 누르기 전에 말한다.
    expect(setup).toHaveTextContent(".git");
    expect(setup).toHaveTextContent("그만두려면");
    expect(screen.queryByTestId("atlas-git-snapshot-button")).not.toBeInTheDocument();
  });

  it("자동 실행 0 — 마운트만으로는 git_init 을 절대 호출하지 않는다", async () => {
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

    // 신뢰 헌장: 쓰기 명령은 사용자 클릭 뒤에만. 읽기(git_status)는 허용.
    const writes = tauriApiMock.invoke.mock.calls.filter(
      ([cmd]) => cmd === "git_init" || cmd === "git_set_remote" || cmd === "git_snapshot",
    );
    expect(writes).toHaveLength(0);
  });

  it("기록 시작 버튼이 git_init 을 호출하고, 커밋으로 연쇄하지 않는다", async () => {
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
    // init 은 init 만 한다 — 자동 커밋이야말로 진짜 헌장 위반이다.
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

    // 2026-07-27 — **사실은 크롬에, 입력은 온디맨드로.** 이전에는 같은 사실이
    // 좌측 앰버 레일이 붙은 둥근 카드로 콘텐츠 **위에** 상주해, 기록을 보러
    // 온 사용자의 첫 인상이 설정 권유였다(헌장 금지 패턴 + 앰버 확장).
    const location = await screen.findByTestId("atlas-git-location");
    expect(location).toHaveTextContent("원격 저장소가 아직 없어요");
    // 입력칸은 아직 없다 — 상주하지 않는다.
    expect(screen.queryByTestId("atlas-git-remote-setup")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("atlas-git-remote-toggle"));
    expect(screen.getByTestId("atlas-git-remote-setup")).toBeInTheDocument();

    // 빈 입력으로는 보낼 수 없다.
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
    // 주소 등록은 전송이 아니다 — 보내기는 사용자가 따로 눌러야 한다.
    expect(
      tauriApiMock.invoke.mock.calls.filter(([cmd]) => cmd === "git_snapshot"),
    ).toHaveLength(0);
  });

  it("upstream 이 있으면 주소 입력 칸을 띄우지 않는다", async () => {
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
   * 탭이 사라졌다(2026-08-02). 「변경 내용 / 커밋 이력」은 사실 *안 된 것 vs
   * 된 것* 이라 목록의 위치가 이미 말한다 — 맨 위가 미커밋, 아래가 커밋.
   * 그래서 이 테스트는 이제 **기본 선택**을 잡는다: 커밋할 게 있으면 그것이
   * 열려 있고 변경 내용이 바로 보인다.
   */
  it("커밋할 게 있으면 그 변경이 기본으로 열려 있다 — 탭을 눌러 찾지 않는다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("+new line");
    // 미커밋 줄이 목록 맨 위에 있고, 그것이 골라져 있다.
    const pending = screen.getByTestId("atlas-git-pending-row");
    expect(pending).toHaveAttribute("aria-pressed", "true");
    // 탭 버튼은 더 이상 존재하지 않는다.
    expect(screen.queryByTestId("atlas-git-diff-toggle")).toBeNull();
    expect(screen.queryByTestId("atlas-git-history-tab")).toBeNull();
  });

  it("고른 걸음은 바뀐 파일과 그 걸음이 쓴 원문까지 보여준다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    await screen.findByTestId("atlas-git-steps");
    fireEvent.click(screen.getByTestId("atlas-git-history-item"));

    // 파일은 **다른 렌즈**다 — 정체(제목·해시)는 남고 표현만 바뀐다.
    fireEvent.click(await screen.findByTestId("atlas-git-lens-files"));

    // 바뀐 파일 — 「무엇이」. 이력이 개념 이름만 말하면 개념이 아닌 파일을
    // 건드린 걸음은 화면에서 통째로 증발한다.
    const files = await screen.findAllByTestId("atlas-git-commit-file");
    expect(files.map((el) => el.textContent).join(" ")).toContain(
      "docs/capabilities/foo.md",
    );

    // 바뀐 내용 — 「어떻게」. 요약이 아니라 원문이라 터미널에서 보던 것과 같다.
    const patch = await screen.findByTestId("atlas-git-commit-diff");
    expect(patch).toHaveTextContent("한 줄 새로 씀");

    // 그리고 **잡음은 안 보인다**. `diff --git`·`index`·`---`·`+++` 넷이
    // 말하는 것은 파일 이름 하나뿐이라, 넷을 접어 머리 한 줄로 바꿨다.
    // 이 단언이 없으면 다음 사람이 파서를 되돌려도 아무도 모른다.
    expect(patch.textContent).not.toContain("diff --git");
    expect(patch.textContent).not.toContain("index 05d74bf");
    // 파일 이름은 **위 목록**이 나른다 — patch 상자에서 다시 말하지 않는다.
    expect(patch.textContent).not.toContain("docs/capabilities/foo.md");
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

    // 모달이 삭제되면서(#78 Scope 2) 이 패널의 유일한 소비자가 `/git/` 목적지가
    // 됐다. 목적지에 "닫기" 는 없다 — 레일로 다른 곳에 가면 그게 나가기다.
    expect(screen.queryByTestId("atlas-git-close")).not.toBeInTheDocument();
    // 11px mono eyebrow 가 아니라 h1 — 실측에서 페이지 제목으로 너무 작았다.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("기록");
  });
});

/**
 * 2026-07-26 재설계 — "이 화면이 지금 자기 일을 할 수 있는가" 로 갈리는
 * 두 모양(셋업 / 작업대)의 계약.
 */
describe("AtlasGitPanel — 연결 셋업 모드", () => {
  it("연결 전 세 상태는 같은 셋업 프레임을 쓴다 — 걸음마다 표면이 바뀌지 않는다", async () => {
    // ① 웹
    const web = renderPanel(<AtlasGitPanel />);
    expect(await screen.findByTestId("atlas-git-setup")).toHaveAttribute(
      "data-setup-state",
      "web",
    );
    web.unmount();

    // ② 앱인데 폴더 없음
    tauriApiMock.runtimeAvailable = true;
    const noVault = renderPanel(<AtlasGitPanel vaultPath={null} />);
    expect(await screen.findByTestId("atlas-git-setup")).toHaveAttribute(
      "data-setup-state",
      "no-vault",
    );
    noVault.unmount();

    // ③ 앱 + 폴더인데 아직 기록 시작 전
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
    // 로딩 → 기록 시작 전. 로딩도 같은 프레임을 쓴다(그래서 상태가 바뀌어도
    // 화면이 튀지 않는다) — 그래서 testid 가 아니라 상태 속성을 기다린다.
    await waitFor(() =>
      expect(screen.getByTestId("atlas-git-setup")).toHaveAttribute(
        "data-setup-state",
        "not-initialized",
      ),
    );
  });

  it("앱 안에서 폴더가 없으면 앱을 받으라고 하지 않는다 — 폴더 고르기로 보낸다", async () => {
    // 회귀 차단: 이전엔 이 상태가 웹 강등으로 떨어져, **이미 앱을 쓰는**
    // 사용자에게 "브라우저는 git 을 실행할 권한이 없어요 / 앱 받기 →" 라는
    // 거짓 안내를 보여줬다.
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
    // 웹에서는 첫 걸음이 "지금 할 일", 나머지는 아직.
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
    // 이 페이지가 하는 유일한 일이 이 버튼이라, 누군가 다시 h-9 같은 고정
    // 높이로 되돌리면 `@media (pointer: coarse)` 승격이 조용히 사라진다.
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
     * 구 계약은 "미커밋 0 이면 열을 안 만든다"(`data-shape="recall"`)였다.
     * 그건 **2단 전환 전의 판단**이다 — 그때 오른쪽은 「증거」라 정말 보여줄
     * 게 없었다. 지금 오른쪽은 **고른 것의 상세**이고, 커밋을 고르면 바뀐
     * 개념·ego 그림·변경 내용이 찬다. 그 갈래가 남아 있던 동안 커밋이 4개
     * 쌓인 볼트에서 화면 절반이 통째로 사라졌다(소유자 실측 2026-08-02).
     *
     * 모양은 하나다. 미커밋 유무는 **목록 맨 윗줄의 유무**로만 드러난다.
     */
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const workbench = await screen.findByTestId("atlas-git-workbench");
    expect(workbench).toHaveAttribute("data-shape", "decide");
    // 커밋 이력은 목록에 그대로 있다.
    expect(screen.getByTestId("atlas-git-history-item")).toBeInTheDocument();
    // 미커밋 줄만 없다.
    expect(screen.queryByTestId("atlas-git-pending-row")).toBeNull();
    // 상세 열은 살아 있다 — 기본 선택이 최근 커밋이다.
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
    // 목록 자리는 같은 문장을 반복하는 대신 "그래서 지금 무슨 상태냐" 를 말한다.
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
   * 이 화면에는 **Pull 이 아예 없었다** — 브리지에도 Rust 에도 있는데 호출부가
   * 0회였다. Push 는 「남기기」 확인 단계의 체크박스 안에만 있어서, 남길 변경이
   * 0 이면 이미 쌓인 걸음을 보낼 방법이 없었다(소유자 실측: ↑2 인데 보낼 길 없음).
   * 아래 넷이 그 회귀를 잡는다.
   */
  it("갈라짐 수치는 **그 숫자가 정당화하는 버튼 위**에 있다", async () => {
    /*
     * 종전엔 「↑2 ↓1」 칩이 따로 앉아 있었다. 그 숫자가 하는 일은 어느 버튼을
     * 누를지 정해 주는 것 하나인데, 떨어져 있으면 읽고 나서 눈을 다시 옮겨야
     * 한다. 칩을 없애고 라벨로 옮겼다 — 되돌리면 여기가 터진다.
     */
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    expect(await screen.findByTestId("atlas-git-remote-push")).toHaveTextContent("Push 2");
    expect(screen.getByTestId("atlas-git-remote-pull")).toHaveTextContent("Pull 1");
    // 수치 자체는 보조 기술에도 남는다(시각 칩이 사라졌다고 사실이 사라지진 않는다).
    expect(screen.getByTestId("atlas-git-divergence")).toHaveTextContent("2");
  });

  it("커밋 제목을 직접 쓰면 그 문장이 그대로 git 에 간다", async () => {
    /*
     * 자동 문구는 「무엇이 바뀌었나」를 잘 말하지만 **왜 바꿨나**는 못 말한다.
     * 나중에 이력을 읽는 사람이 찾는 것은 후자다. 비워 두면 종전대로 자동
     * 문구가 가므로 아무것도 안 하던 사람의 경로는 그대로다.
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

  it("Pull·Push 는 할 일이 없어도 **눌린다** — 침묵으로 답하지 않는다", async () => {
    /*
     * 종전엔 `behind === 0` 이면 Pull 이 비활성이었다. 그런데 「받을 게 없다」는
     * **눌러 보고 알 수 있어야 하는 사실**이지, 버튼을 죽여 침묵으로 답할 일이
     * 아니다 — 화면은 마지막으로 확인한 시점의 수를 들고 있을 뿐이라 그 수가
     * 이미 낡았을 수도 있다(소유자: *"버튼은 일단 눌려야지"*).
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
     * 세 상태(커밋 안 함 · 안 보냄 · 원격에만 있음)를 탭으로 가르면 각 탭이
     * 나머지를 숨긴다. 이 저장소에는 그러지 말자는 결정과 그것을 지키는
     * 테스트가 이미 있다. 한 시간축 위의 구간이므로 필요한 것은 칸막이가
     * 아니라 경계선이다.
     */
    installDesktopGit({ status: { ...STATUS_WITH_CHANGES, ahead: 1, behind: 2 } });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    const sections = await screen.findAllByTestId("atlas-git-section");
    const text = sections.map((el) => el.textContent).join(" ");
    expect(text).toContain("아직 안 보냄 1");
    // 원격에만 있는 걸음은 로컬 이력에 없으므로 **행이 아니라 안내**다.
    expect(screen.getByTestId("atlas-git-behind-row")).toHaveTextContent("2");
  });

  it("Fetch 를 누르면 git_fetch 를 부른다 — 그 전에는 0회", async () => {
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

  it("Pull 을 누르면 git_pull 을 부른다 — 이 배선이 없던 것이 결함이었다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-remote-pull"));
    await waitFor(() =>
      expect(
        tauriApiMock.invoke.mock.calls.filter(([c]) => c === "git_pull"),
      ).toHaveLength(1),
    );
  });

  it("Push 는 남길 변경이 없어도 눌린다 — 이미 쌓인 걸음을 보내는 길", async () => {
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
   * 종전에는 커밋 **제목 문자열을 파싱해서** 무엇이 바뀌었는지 추측했다. 그건
   * 우리 도구가 쓴 제목에만 맞고 사람이 쓴 커밋에는 안 맞아서, 실제 화면은
   * 개념을 하나도 안 보여주고 제목만 나열했다(소유자 실측). #842 가 커밋별
   * kind/slug 를 실어 보내므로 이제 추측하지 않는다.
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
    // 원문은 사라지지 않는다 — 아래 줄에서 그 걸음을 구별해 준다.
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
   * 「이 걸음을 지도에서 보기」를 없앤 자리다(소유자 판정: 여기서 다 보이게
   * 하려던 건데 나가는 버튼을 둘 이유가 없다). 그래서 개념을 눌렀을 때 이
   * 자리가 비어 있으면 그건 기능이 사라진 것이다.
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
    // 소속 도메인은 belongsTo 이웃에서 온다 — 「속한 곳」이 그려져야 한다.
    expect(ego).toHaveTextContent("속한 곳");

    /*
     * **아는 것을 안 보여주는 것은 강등이 아니라 누락이다.** 그래프 노드가
     * 이미 나르는 셋을 화면이 안 쓰고 있었다 — 사람이 가장 먼저 읽는 한 줄
     * 설명, 이 개념이 속한 프로젝트, 그리고 **에이전트가 부르는 이름**.
     * 마지막 것이 빠지면 이 화면은 두 사용자 중 하나에게만 답한 것이다.
     */
    expect(ego).toHaveTextContent("첫 실행에서 볼트를 만들어 준다");
    expect(ego).toHaveTextContent("아틀라스");
    expect(ego).toHaveTextContent("capabilities/foo");

    // 관계는 **수가 아니라 이름**이다 — 「1」은 1이 무엇인지 못 말한다.
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
   * 탭을 없앤 자리는 **선택**이 진다. 그래서 "고르면 오른쪽이 바뀐다" 가
   * 동작하지 않으면 화면은 멀쩡해 보이면서 아무것도 못 하게 된다 — 탭이
   * 있던 시절에는 최소한 탭이 눈에 보였다.
   */
  it("커밋을 고르면 오른쪽이 그 커밋의 상세로 바뀐다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // 기본은 미커밋(변경이 있으므로) — 상세는 아직 없다.
    await screen.findByTestId("atlas-git-pending-row");
    expect(screen.queryByTestId("atlas-git-history-detail")).toBeNull();

    fireEvent.click(screen.getByTestId("atlas-git-history-item"));
    expect(await screen.findByTestId("atlas-git-history-detail")).toHaveTextContent(
      "abc1234def5678",
    );
    // 커밋을 고르면 미커밋 줄은 눌린 상태가 풀린다 — 둘이 동시에 열리지 않는다.
    expect(screen.getByTestId("atlas-git-pending-row")).toHaveAttribute("aria-pressed", "false");
  });

  it("미커밋 줄로 되돌아오면 변경 내용이 다시 보인다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);
    fireEvent.click(await screen.findByTestId("atlas-git-history-item"));
    await screen.findByTestId("atlas-git-history-detail");

    fireEvent.click(screen.getByTestId("atlas-git-pending-row"));
    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("+new line");
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

describe("AtlasGitPanel — git 이 없어도 바뀐 것은 보인다", () => {
  /*
   * 소유자 지적(2026-08-02): "우리 깃 안쓰는 사람은 기록 보는거 제공 안하나?"
   *
   * 제공된다 — `change-baseline-store` 가 볼트별 기준점을 들고 있어 git 과
   * 무관하게 이번 세션의 변경을 안다. 그런데 그 요약을 **웹 강등에서만**
   * 그려서, 아직 git 을 안 켠 데스크톱 사용자는 「연동하기」만 권유받고
   * 지금 무엇이 바뀌었는지는 못 봤다. 아는 것을 안 보여주는 건 강등이
   * 아니라 누락이다.
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

  it("연동 화면이 git 을 이름으로 부른다 — 무엇을 켜는지 알 수 있게", async () => {
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
    // 상태가 도착하기 전에는 로딩 프레임이라, 연동 버튼이 뜰 때까지 기다린다.
    expect(await screen.findByTestId("atlas-git-init")).toHaveTextContent("git 연동하기");
    expect(screen.getByTestId("atlas-git-setup")).toHaveTextContent("git 을 연동하면 변경이 쌓여요");
  });

  it("웹 강등도 같은 요약 컴포넌트를 쓴다 — 두 곳이 갈라지지 않게", async () => {
    renderPanel(<AtlasGitPanel sessionChangeset={CHANGESET} />);
    expect(await screen.findByTestId("atlas-git-session-changes")).toHaveTextContent("개념 추가 1");
  });
});
