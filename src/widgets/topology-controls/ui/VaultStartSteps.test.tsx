import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { VaultStartSteps, type VaultStartStepsProps } from "./VaultStartSteps";

/**
 * The first-steps card — **one at a time, blocking nothing, with an end.**
 *
 * What this file holds are the places the owner actually got stuck (2026-08-16): a
 * row with no explanation, progress that does not count a press, a first step you
 * cannot pass, and a card that never ends.
 */
function renderSteps(props: Partial<VaultStartStepsProps> = {}) {
  const base: VaultStartStepsProps = {
    analyzePrompt: "분석해줘",
    onCreateNode: vi.fn(),
  };
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <VaultStartSteps {...base} {...props} />
    </NextIntlClientProvider>,
  );
}

const card = () => screen.getByTestId("vault-start-steps");

describe("첫 걸음 — 한 번에 하나씩", () => {
  it("빈 폴더의 첫 걸음은 에이전트 연결이고, 셋 중 첫째다", () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("agent");
    expect(card().dataset.stepTotal).toBe("3");
    expect(screen.getByTestId("start-step-progress").textContent).toContain("1 / 3");
  });

  it("걸음마다 **설명**이 있다 — 제목만 있던 종전이 「뭔지도 모르겠다」였다", () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    const body = screen.getByTestId("start-step-body").textContent ?? "";
    // It has to be a sentence, not a one-line label.
    expect(body.length).toBeGreaterThan(30);
  });

  it("건너뛰기가 **모든 걸음에** 있다 — 이 카드는 아무것도 막지 않는다", () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    for (const expected of ["agent", "analyze", "starter"]) {
      expect(card().dataset.step).toBe(expected);
      fireEvent.click(screen.getByTestId("start-step-skip"));
    }
  });

  it("마지막 걸음을 지나면 끝난다 — 카드를 거둔다", () => {
    const onFinish = vi.fn();
    renderSteps({ onScaffoldStarter: vi.fn(), onFinish });
    fireEvent.click(screen.getByTestId("start-step-skip")); // agent → analyze
    fireEvent.click(screen.getByTestId("start-step-skip")); // analyze → starter
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("start-step-skip")); // starter → the end
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("되돌아갈 수 있다 — 첫 걸음에는 그 버튼이 없다", () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    expect(screen.queryByTestId("start-step-back")).toBeNull();
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-back"));
    expect(card().dataset.step).toBe("agent");
  });
});

describe("첫 걸음 — 에이전트 걸음은 앱이 아는 것을 말한다", () => {
  it("찾은 실행기가 있으면 이름으로 부르고, 문은 **설정의 Agents 칸**으로 간다", () => {
    const onOpenAgentConnect = vi.fn();
    renderSteps({
      acpRuntimeLabel: "Claude Agent",
      acpRuntimeIcon: "/acp-icons/claude-acp.svg",
      acpRuntimeInk: "#D97757",
      onOpenAgentConnect,
    });
    /*
     * ⚠️ The found tool has its own row now (owner, 2026-08-25). It used to be the tail of a
     * sentence — "found an AI tool: Claude Agent" — which buried the one concrete thing
     * this step exists to report. Naming it is not enough; the row carries the vendor's own mark.
     */
    const runtimeRow = screen.getByTestId("start-step-runtime");
    expect(runtimeRow.textContent).toContain("Claude Agent");
    expect(runtimeRow.querySelector('[data-vendor-mark="true"]')).not.toBeNull();
    expect(card().dataset.agentReady).toBe("true");
    fireEvent.click(screen.getByTestId("start-step-cta-agent"));
    expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
  });

  it("이미 된 걸음의 보조 버튼은 「건너뛰기」가 아니라 「다음」이다", () => {
    renderSteps({ acpRuntimeLabel: "Claude Agent" });
    expect(screen.getByTestId("start-step-skip").textContent).toBe("다음");
  });

  it("찾은 것이 없어도 같은 문이다 — 연결이 사는 곳은 한 군데다", () => {
    const onOpenAgentConnect = vi.fn();
    renderSteps({ acpRuntimeLabel: null, onOpenAgentConnect });
    expect(card().dataset.agentReady).toBe("false");
    expect(screen.getByTestId("start-step-skip").textContent).toBe("건너뛰기");
    fireEvent.click(screen.getByTestId("start-step-cta-agent"));
    expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
  });
});

describe("첫 걸음 — 분석 걸음은 붙여넣을 곳이 어디냐로 갈린다", () => {
  it("앱 안에 대화가 있으면 복사를 안 시킨다 — 작성 칸에 앉힌다", () => {
    const onSendAnalyzeToAgent = vi.fn();
    renderSteps({ acpRuntimeLabel: "Claude Agent", onSendAnalyzeToAgent });
    fireEvent.click(screen.getByTestId("start-step-skip")); // agent → analyze
    expect(card().dataset.step).toBe("analyze");
    fireEvent.click(screen.getByTestId("start-step-cta-analyze"));
    expect(onSendAnalyzeToAgent).toHaveBeenCalledTimes(1);
  });

  it("밖에 붙여넣어야 하는 사람에게는 복사를 준다", () => {
    renderSteps({ onSendAnalyzeToAgent: null });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(screen.getByTestId("start-step-cta-analyze").textContent).toContain("복사");
  });
});

describe("첫 걸음 — 마지막 걸음의 이름은 무엇을 만드는지 말한다", () => {
  it("빈 폴더면 「시작 문서 만들기」다 — 「만들어 주기」가 아니다", () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(card().dataset.step).toBe("starter");
    expect(screen.getByTestId("start-step-cta-starter").textContent).toBe("시작 문서 만들기");
  });

  it("만드는 중에는 잠기고 그 사실을 말한다", () => {
    renderSteps({ onScaffoldStarter: vi.fn(), scaffolding: true });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-skip"));
    const cta = screen.getByTestId("start-step-cta-starter") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toBe("만드는 중…");
  });

  it("문서가 이미 있으면 마지막 걸음은 직접 만들기다", () => {
    const onCreateNode = vi.fn();
    renderSteps({ onScaffoldStarter: null, onCreateNode });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(card().dataset.step).toBe("manual");
    fireEvent.click(screen.getByTestId("start-step-cta-manual"));
    expect(onCreateNode).toHaveBeenCalledWith("project");
  });
});

describe("첫 걸음 — 이 폴더에 문서가 있으면 그것이 첫 걸음이다", () => {
  it("문서가 있으면 걸음이 넷이고 첫째가 그 문서다", () => {
    const onStartFromDocs = vi.fn();
    renderSteps({ docsFoundCount: 12, onStartFromDocs, onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("docs");
    expect(card().dataset.stepTotal).toBe("4");
    expect(screen.getByTestId("start-step-body").textContent).toContain("12");
    fireEvent.click(screen.getByTestId("start-step-cta-docs"));
    expect(onStartFromDocs).toHaveBeenCalledTimes(1);
  });

  it("빈 폴더면 그 걸음이 아예 없다 — 없는 문서를 권하지 않는다", () => {
    renderSteps({ docsFoundCount: 0, onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("agent");
  });
});

/**
 * ⚠️ **Reversed on 2026-08-25** (owner: *"from the user's side it is not actually centred"*).
 *
 * This block used to require the opposite: with INDEX open, the wrapper had to add left padding the
 * width of INDEX. That padding pushes the card right by half its size, so the surface asking for the
 * person's attention sat off the middle of the window while still claiming the middle — the exact
 * thing the owner saw.
 *
 * The first repair collapsed INDEX whenever this card was up. That was far too broad: the card is up
 * by default for anybody who just opened a folder, so INDEX became unreachable, and the web smoke
 * test caught it in CI. The card is a floating overlay above INDEX; it can simply stay in the
 * window's centre and let INDEX pass beneath its left edge.
 */
describe("첫 걸음 — 카드는 창의 가운데를 지킨다", () => {
  const wrapper = () => card().parentElement as HTMLElement;

  it("INDEX 가 펼쳐져도 옆으로 밀리지 않는다", () => {
    renderSteps({ indexExpanded: true });
    expect(
      wrapper().className,
      "INDEX 폭만큼 왼쪽을 비우면 카드가 그 절반만큼 오른쪽으로 밀린다",
    ).not.toContain("md:pl-[calc(");
    expect(wrapper().className).toContain("justify-center");
  });

  it("INDEX 가 접혀 있어도 같은 자리다", () => {
    renderSteps({ indexExpanded: false });
    expect(wrapper().className).not.toContain("md:pl-[calc(");
    expect(wrapper().className).toContain("justify-center");
  });

  it("기본값은 「비우지 않음」 — prop 을 안 넘긴 호출자가 화면을 바꾸지 않는다", () => {
    renderSteps();
    expect(wrapper().dataset.indexReserved).toBe("false");
  });
});
