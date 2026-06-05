import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DesktopVaultWelcome } from "./parts/DesktopVaultWelcome";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const messages: Record<string, string> = {
  "desktopWelcome.eyebrow": "로컬 우선 작업공간",
  "desktopWelcome.title": "온톨로지 문서함을 열거나 만드세요",
  "desktopWelcome.body": "마크다운 폴더 하나를 문서함으로 선택하세요.",
  "desktopWelcome.dogfoodTitle": "이 repo의 docs/ontology를 문서함으로 여세요",
  "desktopWelcome.dogfoodBody": "폴더 선택기에서 /Users/jinan/side-project/oh-my-ontology/docs/ontology 를 선택합니다.",
  "desktopWelcome.copyDogfoodPath": "경로 복사",
  "desktopWelcome.copyDogfoodPathCopied": "복사됨",
  "desktopWelcome.copyDogfoodPathFailed": "복사 실패",
  "desktopWelcome.contractAriaLabel": "온톨로지 문서함 실행 계약",
  "desktopWelcome.contractFilesLabel": "문서 파일",
  "desktopWelcome.contractFilesValue": "Markdown은 로컬에 유지",
  "desktopWelcome.contractFilesBody": "선택한 폴더의 `.md` 파일이 기준입니다.",
  "desktopWelcome.contractGraphLabel": "그래프",
  "desktopWelcome.contractGraphValue": "문서 속성이 그래프 원천",
  "desktopWelcome.contractGraphBody": "문서의 종류와 연결 정보가 화면으로 이어집니다.",
  "desktopWelcome.contractAgentLabel": "에이전트",
  "desktopWelcome.contractAgentValue": "그래프 검사 {count}개",
  "desktopWelcome.contractAgentBody": "Claude Code, Codex, Cursor가 같은 검증 게이트를 씁니다.",
  "desktopWelcome.actionsAriaLabel": "문서함 시작 액션",
  "desktopWelcome.openTitle": "기존 문서함 열기",
  "desktopWelcome.openingTitle": "폴더 여는 중...",
  "desktopWelcome.loadingTitle": "문서함 빌드 중...",
  "desktopWelcome.openBody": "이미 온톨로지 마크다운 파일이 있는 폴더를 선택합니다.",
  "desktopWelcome.dogfoodOpenTitle": "docs/ontology 선택",
  "desktopWelcome.dogfoodOpenBody": "이 repo 안의 docs/ontology 폴더를 선택합니다.",
  "desktopWelcome.createTitle": "새 문서함 만들기",
  "desktopWelcome.createBody": "빈 폴더를 만들거나 선택합니다.",
  "desktopWelcome.sampleTitle": "샘플 문서함 보기",
  "desktopWelcome.sampleBody": "읽기 전용 문서로 둘러봅니다.",
  "desktopWelcome.recentTitle": "최근 문서함",
  "desktopWelcome.recentEmpty": "아직 최근 문서함이 없습니다.",
};

const t = ((key: string, values?: Record<string, string | number>) => {
  let message = messages[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {})) {
    message = message.replace(`{${name}}`, String(value));
  }
  return message;
}) as unknown as Parameters<typeof DesktopVaultWelcome>[0]["t"];

function renderWelcome(showDogfoodHint: boolean) {
  const onOpen = vi.fn();
  const onOpenDogfoodPath = vi.fn();
  return render(
    <DesktopVaultWelcome
      status="idle"
      recentVaults={[]}
      onOpen={onOpen}
      onOpenDogfoodPath={onOpenDogfoodPath}
      onOpenRecent={vi.fn()}
      onOpenSample={vi.fn()}
      showDogfoodHint={showDogfoodHint}
      t={t}
    />,
  );
}

describe("DesktopVaultWelcome dogfood handoff", () => {
  it("copies the exact docs/ontology path from the dogfood welcome", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    renderWelcome(true);

    fireEvent.click(screen.getByRole("button", { name: "경로 복사" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "/Users/jinan/side-project/oh-my-ontology/docs/ontology",
      );
    });
    expect(screen.getByRole("button", { name: "경로 복사 · 복사됨" })).toBeInTheDocument();
  });

  it("does not show a path copy action on the generic local vault welcome", () => {
    renderWelcome(false);

    expect(screen.queryByRole("button", { name: "경로 복사" })).not.toBeInTheDocument();
  });

  it("uses the direct dogfood open action for the primary dogfood button", () => {
    const onOpen = vi.fn();
    const onOpenDogfoodPath = vi.fn();
    render(
      <DesktopVaultWelcome
        status="idle"
        recentVaults={[]}
        onOpen={onOpen}
        onOpenDogfoodPath={onOpenDogfoodPath}
        onOpenRecent={vi.fn()}
        onOpenSample={vi.fn()}
        showDogfoodHint
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /docs\/ontology 선택/ }));

    expect(onOpenDogfoodPath).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
