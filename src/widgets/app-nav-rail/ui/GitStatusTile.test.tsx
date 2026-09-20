import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import koMessages from "../../../../messages/ko.json";
import { GitStatusTile } from "./GitStatusTile";

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

/** The watcher's event channel: `listen` hands the handlers back so a test can play the watcher. */
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

function renderTile(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("GitStatusTile — 웹(브리지 없음)", () => {
  it("shows the dirty dot from sessionDirty without any invoke", () => {
    renderTile(<GitStatusTile onActivate={() => {}} sessionDirty />);
    expect(screen.getByTestId("app-nav-rail-git-dot")).toBeInTheDocument();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it("hides the dot when the session is clean", () => {
    renderTile(<GitStatusTile onActivate={() => {}} sessionDirty={false} />);
    expect(screen.queryByTestId("app-nav-rail-git-dot")).not.toBeInTheDocument();
  });

  it("fires onActivate on click and reflects panelOpen via aria-expanded", async () => {
    const onActivate = vi.fn();
    renderTile(<GitStatusTile onActivate={onActivate} panelOpen />);
    const tile = screen.getByTestId("app-nav-rail-git-tile");
    expect(tile).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(tile);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  // Owner report 2026-07-23 — the utility tier's icon size order (the same token as the activity tile).
  it("keeps the History icon on the utility ladder (--app-nav-rail-utility-icon-size)", () => {
    renderTile(<GitStatusTile onActivate={() => {}} />);
    const icon = screen.getByTestId("app-nav-rail-git-tile").querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("--app-nav-rail-utility-icon-size");
  });
});

describe("GitStatusTile — 데스크톱(Tauri)", () => {
  it("queries git_status once on mount and shows the dot when the vault is dirty", async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      initialized: true,
      repoRoot: "/repo",
      branch: "main",
      upstream: null,
      changedCount: 3,
      stagedOutsideVault: [],
    });

    renderTile(<GitStatusTile onActivate={() => {}} vaultPath="/repo/vault" />);

    expect(await screen.findByTestId("app-nav-rail-git-dot")).toBeInTheDocument();
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith("git_status", { vaultPath: "/repo/vault" });
    expect(screen.getByTestId("app-nav-rail-git-tile")).toHaveAttribute(
      "title",
      expect.stringContaining("3건"),
    );
  });

  it("re-queries exactly once per window focus — no interval polling", async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      initialized: true,
      repoRoot: "/repo",
      branch: "main",
      upstream: null,
      changedCount: 0,
      stagedOutsideVault: [],
    });

    renderTile(<GitStatusTile onActivate={() => {}} vaultPath="/repo/vault" />);
    await waitFor(() => expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2));
    // No extra query as time passes without a focus event (zero polling).
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2);
  });

  it("treats an uninitialized repo as clean (dot 없음 — 자동 init 금지, 상태로만)", async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      initialized: false,
      repoRoot: null,
      branch: null,
      upstream: null,
      changedCount: 0,
      stagedOutsideVault: [],
    });

    renderTile(<GitStatusTile onActivate={() => {}} vaultPath="/repo/vault" sessionDirty />);
    await waitFor(() => expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1));
    // A git_status result (clean) wins over the sessionDirty fallback.
    expect(screen.queryByTestId("app-nav-rail-git-dot")).not.toBeInTheDocument();
  });
});

describe("GitStatusTile — 폴더를 따라간다", () => {
  it("vault-changed 가 오면 한 번 더 읽고, 그 밖에는 여전히 폴링하지 않는다", async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({
      initialized: true,
      repoRoot: "/repo",
      branch: "main",
      upstream: null,
      changedCount: 0,
      stagedOutsideVault: [],
    });
    renderTile(<GitStatusTile onActivate={() => {}} vaultPath="/repo/vault" />);
    await waitFor(() => expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tauriEventMock.listen).toHaveBeenCalledWith("vault-changed", expect.any(Function)));

    // A burst of three watcher emits is one read.
    await act(async () => {
      for (let i = 0; i < 3; i += 1) for (const handler of tauriEventMock.handlers) handler({ payload: null });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 450));
    });
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(2);
    expect(tauriApiMock.invoke.mock.calls.every(([command]) => command === "git_status")).toBe(true);
  });

  it("폴더를 바꾸면 앞 폴더의 점을 물려주지 않는다", async () => {
    // The dot says "this folder has unrecorded changes". Carried across a folder switch it
    // says it about a folder it was never read from — and a clean folder wears it.
    tauriApiMock.runtimeAvailable = true;
    let finishCleanRead = (_: unknown) => {};
    const cleanRead = new Promise((resolve) => {
      finishCleanRead = resolve;
    });
    tauriApiMock.invoke.mockImplementation(
      async (_command: string, args?: Record<string, unknown>) => {
        if (args?.vaultPath === "/repo/dirty") {
          return {
            initialized: true,
            repoRoot: "/repo",
            branch: "main",
            upstream: null,
            changedCount: 3,
            stagedOutsideVault: [],
          };
        }
        // The new folder's read is still in flight — which is the whole window in which the
        // previous folder's answer could be shown as this one's.
        return cleanRead;
      },
    );

    const { rerender } = renderTile(
      <GitStatusTile onActivate={() => {}} vaultPath="/repo/dirty" />,
    );
    expect(await screen.findByTestId("app-nav-rail-git-dot")).toBeInTheDocument();

    // The clean folder's own read has not landed yet at this point — the dot must already
    // be gone, because the count on screen is not this folder's.
    await act(async () => {
      rerender(
        <NextIntlClientProvider locale="ko" messages={koMessages}>
          <GitStatusTile onActivate={() => {}} vaultPath="/repo/clean" />
        </NextIntlClientProvider>,
      );
    });
    expect(screen.queryByTestId("app-nav-rail-git-dot")).not.toBeInTheDocument();
    expect(tauriApiMock.invoke).toHaveBeenCalledWith("git_status", { vaultPath: "/repo/clean" });

    // And the folder's own answer, when it lands, keeps it that way.
    await act(async () => {
      finishCleanRead({
        initialized: true,
        repoRoot: "/repo",
        branch: "main",
        upstream: null,
        changedCount: 0,
        stagedOutsideVault: [],
      });
      await cleanRead;
    });
    expect(screen.queryByTestId("app-nav-rail-git-dot")).not.toBeInTheDocument();
  });

  it("브라우저(브리지 없음)에서는 워처를 구독하지 않는다", () => {
    renderTile(<GitStatusTile onActivate={() => {}} sessionDirty />);
    expect(tauriEventMock.listen).not.toHaveBeenCalled();
  });
});
