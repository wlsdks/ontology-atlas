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
  },
];

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
}: {
  status?: unknown;
  diff?: unknown;
  history?: unknown;
  snapshot?: unknown;
  init?: unknown;
  setRemote?: unknown;
} = {}) {
  tauriApiMock.runtimeAvailable = true;
  tauriApiMock.invoke.mockImplementation(async (command: string) => {
    if (command === "git_status") return status;
    if (command === "git_diff") return diff;
    if (command === "git_history") return history;
    if (command === "git_snapshot") return snapshot;
    if (command === "git_init") return init;
    if (command === "git_set_remote") return setRemote;
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
    expect(screen.getByText("ontology-atlas snapshot")).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId("atlas-git-history-tab"));
    const step = screen.getByTestId("atlas-git-history-item");
    // 2026-07-27 — 걸음 요약은 **사람 말**로 읽힌다. 커밋 제목
    // `ontology snapshot: +1 concept (…)` 은 우리가 만든 문자열이고, 그걸
    // 한국어 화면에서 원문으로 읽히는 것은 우리가 만든 문자열을 우리가
    // 번역하지 않은 것이다.
    expect(step).toHaveTextContent("추가 1");
    expect(step).toHaveTextContent("capabilities/foo");
    expect(step).toHaveTextContent("abc1234");
    expect(step).not.toHaveTextContent("ontology snapshot");

    // 다만 원문은 사라지지 않는다 — 펼치면 감사 흔적으로 그대로 있다.
    fireEvent.click(step);
    expect(screen.getByTestId("atlas-git-history-detail")).toHaveTextContent(
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

  it("disables the snapshot button and says 모두 남겼어요 when there are no changes", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const button = await screen.findByTestId("atlas-git-snapshot-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("모두 남겼어요");
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
    const region = await screen.findByTestId("atlas-git-not-initialized");
    expect(region).toHaveTextContent("이 폴더의 변경을 남겨둘까요?");
    expect(screen.getByTestId("atlas-git-init")).toBeEnabled();
    // 무엇이 만들어지는지 + 되돌리는 방법을 누르기 전에 말한다.
    expect(region).toHaveTextContent(".git");
    expect(region).toHaveTextContent("그만두려면");
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
    expect(location).toHaveTextContent("지금은 이 컴퓨터에만 쌓이고 있어요");
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

  it("바뀐 줄이 증거 pane 기본 탭으로 열려 있다 (#85)", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // 토글이 아니라 탭이다 — 증거는 숨겨두는 게 아니라 목록 옆에 늘 있다.
    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("+new line");
    fireEvent.click(screen.getByTestId("atlas-git-history-tab"));
    expect(screen.queryByTestId("atlas-git-diff-pre")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("atlas-git-diff-toggle"));
    expect(screen.getByTestId("atlas-git-diff-pre")).toHaveTextContent("+new line");
  });

  it("expands a history item to its full hash + iso time on click", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    fireEvent.click(await screen.findByTestId("atlas-git-history-tab"));
    fireEvent.click(screen.getByTestId("atlas-git-history-item"));
    expect(screen.getByTestId("atlas-git-history-detail")).toHaveTextContent("abc1234def5678");
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
  it("다 남긴 상태에서는 빈 열을 만들지 않는다 — 지난 걸음이 본문이 된다", async () => {
    // 이 테스트의 계약은 2026-07-27 에 **더 세졌다**. 이전 계약은 "빈 우측 열
    // 방지 = 우측 탭을 최근 기록으로 착지시킨다" 였는데, 그건 증상 처리였다:
    // 열은 여전히 있었고 세로 구분선도 화면 끝까지 그어져 있었다(소유자 실측
    // "화면의 절반이 빈 공간"). 지금은 **열 자체를 만들지 않는다** —
    // 이 순간 사용자의 일이 "되짚기" 하나뿐이라 화면도 하나만 말한다.
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const workbench = await screen.findByTestId("atlas-git-workbench");
    expect(workbench).toHaveAttribute("data-shape", "recall");
    // 걸음이 본문이다.
    expect(screen.getByTestId("atlas-git-history-item")).toBeInTheDocument();
    // 그리고 빈 증거 열이 없다 — 열의 존재는 내용의 존재를 약속한다.
    expect(screen.queryByTestId("atlas-git-evidence")).not.toBeInTheDocument();
  });

  it("남길 것이 있으면 두 열이 되고, 증거 열은 보여줄 것이 있을 때만 온다", async () => {
    // 소유자 스크린샷의 그 순간: 새로 만든 문서 하나 + 첫 걸음 전 → 바뀐 줄도
    // 지난 걸음도 없다. 구 화면은 그래도 2열을 선언해 오른쪽에 한 줄
    // ("새로 만든 문서라 비교할 예전 내용이 없어요")만 띄우고 세로 구분선을
    // 화면 끝까지 그었다.
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 1 },
      diff: { count: 1, files: [DIFF_WITH_CHANGES.files[0]], diff: "" },
      history: [],
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const workbench = await screen.findByTestId("atlas-git-workbench");
    expect(workbench).toHaveAttribute("data-shape", "decide");
    expect(screen.queryByTestId("atlas-git-evidence")).not.toBeInTheDocument();
    // 판단 대상은 그대로 있다.
    expect(screen.getByTestId("atlas-git-change-groups")).toHaveTextContent("capabilities/foo");
  });

  it("개념이 아닌 파일은 접혀서 온다 — 판단 대상이 아니다", async () => {
    installDesktopGit({
      diff: {
        count: 3,
        files: [
          ...DIFF_WITH_CHANGES.files,
          { path: ".gitignore", status: "modified", kind: null, slug: ".gitignore", renamedFrom: null },
        ],
        diff: DIFF_WITH_CHANGES.diff,
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const toggle = await screen.findByTestId("atlas-git-others-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("atlas-git-change-groups")).not.toHaveTextContent(".gitignore");

    fireEvent.click(toggle);
    expect(screen.getByTestId("atlas-git-change-groups")).toHaveTextContent(".gitignore");
  });

  it("행을 고르면 그 문서의 바뀐 줄만 증거 열에 온다", async () => {
    installDesktopGit();
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    // 고르기 전 기본값은 "전부" 다 — 아무도 요청하지 않은 빈 칸을 만들지 않는다.
    expect(await screen.findByTestId("atlas-git-diff-pre")).toHaveTextContent("new line");

    const rows = screen.getAllByTestId("atlas-git-change-row");
    // capabilities/foo 는 추적 전 새 파일이라 diff 본문이 없다.
    fireEvent.click(rows[0]);
    expect(screen.queryByTestId("atlas-git-diff-pre")).not.toBeInTheDocument();
    expect(screen.getByText("새로 만든 문서라 비교할 예전 내용이 없어요.")).toBeInTheDocument();

    // 다시 누르면 선택이 풀린다 — 되돌아갈 길이 같은 자리에 있다.
    fireEvent.click(rows[0]);
    expect(screen.getByTestId("atlas-git-diff-pre")).toHaveTextContent("new line");
  });

  it("증거 열이 git 배관을 그대로 쏟지 않는다", async () => {
    installDesktopGit({
      diff: {
        ...DIFF_WITH_CHANGES,
        diff:
          "diff --git a/docs/elements/bar.md b/docs/elements/bar.md\n" +
          "index 22ffa01..90c1d3e 100644\n" +
          "--- a/docs/elements/bar.md\n" +
          "+++ b/docs/elements/bar.md\n" +
          "@@ -3,7 +3,7 @@ kind: element\n" +
          "-title: 옛 이름\n" +
          "+title: 새 이름\n",
      },
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    const pane = await screen.findByTestId("atlas-git-diff-pre");
    expect(pane).toHaveTextContent("새 이름");
    expect(pane).not.toHaveTextContent("diff --git");
    expect(pane).not.toHaveTextContent("22ffa01");
    expect(pane).not.toHaveTextContent("@@");
  });

  it("`모두 남겼어요` 를 화면에 두 번 쓰지 않는다", async () => {
    installDesktopGit({
      status: { ...STATUS_WITH_CHANGES, changedCount: 0 },
      diff: { count: 0, files: [], diff: "" },
      history: HISTORY,
    });
    renderPanel(<AtlasGitPanel vaultPath="/repo/vault" />);

    await screen.findByTestId("atlas-git-snapshot-button");
    expect(screen.getAllByText("모두 남겼어요")).toHaveLength(1);
    // 목록 자리는 같은 문장을 반복하는 대신 "그래서 지금 무슨 상태냐" 를 말한다.
    expect(
      screen.getByText("지금 이 폴더와 마지막 걸음이 같아요. 문서를 고치면 여기에 나타나요."),
    ).toBeInTheDocument();
  });

  it("남기기 버튼과 결과 문장이 키 경로가 아니라 문장을 그린다 (ICU 인자 계약)", async () => {
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
    expect(button).toHaveTextContent("2개 남기기");
    expect(button).not.toHaveTextContent("atlasGit");

    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("atlas-git-confirm-button"));
    const result = await screen.findByTestId("atlas-git-snapshot-result");
    expect(result).toHaveTextContent("2개 남겼어요");
    expect(result).not.toHaveTextContent("atlasGit");
  });
});
