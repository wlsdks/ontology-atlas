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

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
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

  // 소유자 실보고 2026-07-23 — 유틸 티어 아이콘 사다리(활동 타일과 동일 토큰).
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
    // focus 이벤트 없이 시간이 지나도 추가 조회는 없다 (폴링 0).
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
    // git_status 결과(깨끗함)가 sessionDirty 폴백보다 우선한다.
    expect(screen.queryByTestId("app-nav-rail-git-dot")).not.toBeInTheDocument();
  });
});
