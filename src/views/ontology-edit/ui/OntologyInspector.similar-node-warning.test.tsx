import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { OntologyInspector } from "./OntologyInspector";
import type { EphemeralNode } from "../lib/use-ephemeral-nodes";
import type { SimilarNodeMatch } from "@/shared/lib/similar-node-title";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

/**
 * design-council B2 rank4 — GUI 근접 중복 감지의 인스펙터 쪽 wiring 회귀 가드.
 *
 * 시나리오: 사용자가 캔버스에서 새 capability 를 추가하고 이름을 입력하는
 * 중, 부모(OntologyEditPage)가 debounce 후 title-근접+kind-일치 매치를
 * 찾아 `similarNodeMatch` 를 채운다. 이 테스트는 그 이후 단계 — 인스펙터가
 * 매치를 받았을 때:
 *   1. 경고가 실제로 렌더되는가
 *   2. 이름 input 이 그대로 편집 가능(disabled 아님)한가 — 하드 블록 없음
 *   3. "그 노드 열기" / "그래도 새로 만들기" 가 각각 올바른 콜백을 부르는가
 */

const ephemeralNode: EphemeralNode = {
  id: "ephemeral-1",
  kind: "capability",
  kindLabel: "역량",
  title: "사용자 인증 흐름 정리",
  x: 240,
  y: 160,
};

const match: SimilarNodeMatch = {
  slug: "capabilities/user-auth-flow",
  title: "사용자 인증 흐름",
  kind: "capability",
  score: 0.75,
};

function renderInspector(props: {
  similarNodeMatch?: SimilarNodeMatch | null;
  onOpenSimilarNode?: (slug: string) => void;
  onDismissSimilarNode?: () => void;
}) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <OntologyInspector
        ephemeralSelected={ephemeralNode}
        vaultSelected={null}
        vaultReadOnly={false}
        onRenameEphemeral={() => {}}
        onClearSelection={() => {}}
        similarNodeMatch={props.similarNodeMatch ?? null}
        onOpenSimilarNode={props.onOpenSimilarNode}
        onDismissSimilarNode={props.onDismissSimilarNode}
      />
    </NextIntlClientProvider>,
  );
}

describe("OntologyInspector — 근접 중복 경고 (design-council B2 rank4)", () => {
  it("similarNodeMatch 가 없으면 경고를 렌더하지 않는다", () => {
    renderInspector({ similarNodeMatch: null });
    expect(screen.queryByRole("status", { name: /비슷한 노드/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/비슷한 노드가 이미 있어요/)).not.toBeInTheDocument();
  });

  it("similarNodeMatch 가 있으면 매치된 제목을 포함한 경고를 렌더한다", () => {
    renderInspector({ similarNodeMatch: match });
    expect(
      screen.getByText("비슷한 노드가 이미 있어요 — 사용자 인증 흐름"),
    ).toBeInTheDocument();
  });

  it("경고가 떠 있어도 이름 input 은 그대로 편집 가능하다 — 하드 블록 없음", () => {
    renderInspector({ similarNodeMatch: match });
    const nameInput = screen.getByRole("textbox", { name: /이름/ });
    expect(nameInput).not.toBeDisabled();
    expect(nameInput).toHaveValue(ephemeralNode.title);
  });

  it('"그 노드 열기" 클릭 시 onOpenSimilarNode 를 매치 slug 로 호출한다', () => {
    const onOpenSimilarNode = vi.fn();
    renderInspector({ similarNodeMatch: match, onOpenSimilarNode });
    fireEvent.click(screen.getByRole("button", { name: "그 노드 열기" }));
    expect(onOpenSimilarNode).toHaveBeenCalledWith("capabilities/user-auth-flow");
  });

  it('"그래도 새로 만들기" 클릭 시 onDismissSimilarNode 를 호출한다 — 생성은 막히지 않는다', () => {
    const onDismissSimilarNode = vi.fn();
    renderInspector({ similarNodeMatch: match, onDismissSimilarNode });
    fireEvent.click(screen.getByRole("button", { name: "그래도 새로 만들기" }));
    expect(onDismissSimilarNode).toHaveBeenCalledTimes(1);
  });
});
