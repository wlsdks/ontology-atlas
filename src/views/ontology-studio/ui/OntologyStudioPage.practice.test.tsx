import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 공방 실습 — **한 번 해 보고, 치울 수 있다.**
 *
 * 이 파일이 지키는 두 가지:
 *
 * 1. **저장은 진짜다.** 실습이라고 가짜로 저장하면 사용자는 "저장하면 어떻게
 *    되는지" 를 배우지 못한 채 배웠다고 믿는다. 그래서 `createDoc` 이 실제로
 *    불린다.
 * 2. **되돌리기도 진짜다.** 「지우기」는 `deleteDoc` 을 부르고, Esc/「남겨 두기」는
 *    아무것도 지우지 않는다. 파괴적 행동에 기본 포커스를 주지 않는 것까지
 *    포함해서 — Enter 한 번에 지워지면 그건 질문이 아니라 함정이다.
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  updateFrontmatter: vi.fn(async () => undefined),
  searchParams: new URLSearchParams(),
  toastShow: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/shared/ui", async () => {
  const actual = await vi.importActual<typeof import("@/shared/ui")>("@/shared/ui");
  return { ...actual, useToast: () => ({ show: mocks.toastShow }) };
});

vi.mock("@/features/data-source-mode", () => ({ useDataSourceMode: () => "local" }));

vi.mock("@/entities/ontology-class", () => ({
  useOntologyKindLabel: () => (kind: string) => kind,
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({ insight: { nodes: [], edges: [] } }),
}));

const vaultState = { writable: true };

// jsdom 에 클립보드가 없다. 읽기 전용 경로는 **복사가 성공해야** 실습이 끝나므로
// (실패는 토스트로 말하고 실습을 열어 둔다 — 안 한 일을 했다고 하지 않는다)
// 여기서 붙여 준다.
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: vi.fn(async () => undefined) },
});

vi.mock("@/features/docs-vault-local", () => ({
  useLocalVault: () => ({
    // 공방의 `writable` 판정은 mode + status 를 본다 — 핸들이 아니다.
    status: vaultState.writable ? "loaded" : "idle",
    handle: vaultState.writable ? {} : null,
    manifest: { docs: [] },
    createDoc: mocks.createDoc,
    deleteDoc: mocks.deleteDoc,
    updateFrontmatter: mocks.updateFrontmatter,
  }),
}));

import { OntologyStudioPage } from "./OntologyStudioPage";

function enterPracticeCreate() {
  mocks.searchParams = new URLSearchParams({ mode: "create", practice: "1" });
  window.history.replaceState({}, "", "/ko/ontology/studio/?mode=create&practice=1");
}

async function makeOneNode(name = "결제 승인") {
  render(<OntologyStudioPage />);
  fireEvent.change(screen.getByTestId("studio-create-name"), { target: { value: name } });
  await waitFor(() => expect(screen.getByTestId("studio-save")).toBeEnabled());
  fireEvent.click(screen.getByTestId("studio-save"));
  await waitFor(() => expect(mocks.createDoc).toHaveBeenCalled());
}

describe("공방 실습", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.values(mocks).forEach((m) => {
      if (typeof m === "function" && "mockClear" in m) m.mockClear();
    });
    enterPracticeCreate();
  });

  /**
   * 안내는 **지시가 아니라 관측**이다 — 이름이 비면 이름 단계, 채우면 다음
   * 단계. 카운터라면 이름을 지웠을 때 되돌아가지 않는다.
   */
  it("follows the draft instead of running a script", async () => {
    render(<OntologyStudioPage />);
    expect(screen.getByTestId("studio-practice-rail")).toHaveAttribute("data-step", "name");

    fireEvent.change(screen.getByTestId("studio-create-name"), { target: { value: "결제" } });
    await waitFor(() =>
      expect(screen.getByTestId("studio-practice-rail")).toHaveAttribute("data-step", "relate"),
    );

    // 되돌아간다 — 상태를 읽고 있다는 증거.
    fireEvent.change(screen.getByTestId("studio-create-name"), { target: { value: "  " } });
    await waitFor(() =>
      expect(screen.getByTestId("studio-practice-rail")).toHaveAttribute("data-step", "name"),
    );
  });

  it("writes a real file, then offers to take it back", async () => {
    await makeOneNode();
    const cleanup = await screen.findByTestId("studio-practice-cleanup");
    expect(cleanup).toBeInTheDocument();
    // 무엇이 사라지는지 파일 이름으로 말한다 — "정리합니다" 로는 사용자가
    // 무엇을 승인하는지 알 수 없다.
    expect(screen.getAllByTestId("studio-practice-delete-row")).toHaveLength(1);
  });

  it("actually deletes the practice file when asked to", async () => {
    await makeOneNode();
    fireEvent.click(await screen.findByTestId("studio-practice-delete"));
    await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledTimes(1));
    const [slug] = mocks.deleteDoc.mock.calls[0] as unknown as [string];
    const [createdSlug] = mocks.createDoc.mock.calls[0] as unknown as [string];
    expect(slug).toBe(createdSlug);
  });

  it("keeps the node — and drops the practice marker so the next save is not practice", async () => {
    await makeOneNode();
    fireEvent.click(await screen.findByTestId("studio-practice-keep"));
    await waitFor(() =>
      expect(screen.queryByTestId("studio-practice-cleanup")).not.toBeInTheDocument(),
    );
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain("practice=1");
  });

  /**
   * 취소는 파괴 쪽으로 떨어지지 않는다. Esc 는 「남겨 두기」이고, 기본 포커스도
   * 「남겨 두기」다 — Enter 한 번에 지워지면 그건 질문이 아니라 함정이다.
   */
  it("treats Escape as keep, never as delete", async () => {
    await makeOneNode();
    const cleanup = await screen.findByTestId("studio-practice-cleanup");
    /*
     * ⚠️ **기다린다.** 초점은 카드가 마운트된 뒤 효과가 옮기므로, 카드가 보이는
     * 순간과 초점이 도착하는 순간이 같은 프레임이 아니다. 기다리지 않고 단언한
     * 판이 CI 에서 흔들렸다(2026-08-11, 재실행에서 통과 — 제품 결함이 아니었다).
     * 흔들리는 시험은 자기 하나만 잃는 게 아니라 **모든 게이트의 빨강을 의심하게
     * 만든다.** 단언을 약하게 하는 것이 아니라 도착을 기다리는 것이다.
     */
    await waitFor(() => expect(screen.getByTestId("studio-practice-keep")).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(cleanup).not.toBeInTheDocument());
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it("shows no practice rail on a plain create — the guide is opt-in", async () => {
    mocks.searchParams = new URLSearchParams({ mode: "create" });
    window.history.replaceState({}, "", "/ko/ontology/studio/?mode=create");
    render(<OntologyStudioPage />);
    expect(screen.queryByTestId("studio-practice-rail")).not.toBeInTheDocument();
  });

  /**
   * **읽기 전용에서도 실습은 끝난다.** 볼트를 아직 안 고른 사람이 이 실습의
   * 대상인데, 초안은 그 갈래에서 마무리를 아예 안 띄웠다 — 안내 띠가
   * "저장하면 폴더 안에 파일이 생깁니다" 에 멈췄고 **그 문장은 그 사람에게
   * 거짓**이었다. 카운슬 두 자리가 서로 못 본 채 같은 결함을 1순위로 짚었다.
   */
  it("finishes the practice on a read-only vault — and promises no file it did not write", async () => {
    vaultState.writable = false;
    try {
      render(<OntologyStudioPage />);
      fireEvent.change(screen.getByTestId("studio-create-name"), {
        target: { value: "결제 승인" },
      });
      await waitFor(() => expect(screen.getByTestId("studio-save")).toBeEnabled());
      fireEvent.click(screen.getByTestId("studio-save"));

      const cleanup = await screen.findByTestId("studio-practice-cleanup");
      expect(cleanup).toBeInTheDocument();
      // 디스크에 아무것도 안 앉았으므로 **지울 것을 약속하지 않는다.**
      expect(screen.queryAllByTestId("studio-practice-delete-row")).toHaveLength(0);
      expect(screen.queryByTestId("studio-practice-delete")).not.toBeInTheDocument();
      expect(mocks.createDoc).not.toHaveBeenCalled();
    } finally {
      vaultState.writable = true;
    }
  });
});
