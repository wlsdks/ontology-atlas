import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { VaultStartSteps, type VaultStartStepsProps } from "./VaultStartSteps";

/** The first-steps card: one step at a time, blocking nothing, with an end. */
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

describe('start steps show one at a time', () => {
  it('starts an empty folder with connecting an agent as the first of three', () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("agent");
    expect(card().dataset.stepTotal).toBe("3");
    expect(screen.getByTestId("start-step-progress").textContent).toContain("1 / 3");
  });

  it('gives every step a description', () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    const body = screen.getByTestId("start-step-body").textContent ?? "";
    // It has to be a sentence, not a one-line label.
    expect(body.length).toBeGreaterThan(30);
  });

  it('offers skip on every step', () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    for (const expected of ["agent", "analyze", "starter"]) {
      expect(card().dataset.step).toBe(expected);
      fireEvent.click(screen.getByTestId("start-step-skip"));
    }
  });

  it('dismisses the card after the last step', () => {
    const onFinish = vi.fn();
    renderSteps({ onScaffoldStarter: vi.fn(), onFinish });
    fireEvent.click(screen.getByTestId("start-step-skip")); // agent → analyze
    fireEvent.click(screen.getByTestId("start-step-skip")); // analyze → starter
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("start-step-skip")); // starter → the end
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('allows going back except on the first step', () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    expect(screen.queryByTestId("start-step-back")).toBeNull();
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-back"));
    expect(card().dataset.step).toBe("agent");
  });
});

describe('the agent step says what the app knows', () => {
  it('names a found runner and links to the Agents section of settings', () => {
    const onOpenAgentConnect = vi.fn();
    renderSteps({
      acpRuntimeLabel: "Claude Agent",
      acpRuntimeIcon: "/acp-icons/claude-acp.svg",
      acpRuntimeInk: "#D97757",
      onOpenAgentConnect,
    });
    /* The found tool has its own row with the vendor's mark. */
    const runtimeRow = screen.getByTestId("start-step-runtime");
    expect(runtimeRow.textContent).toContain("Claude Agent");
    expect(runtimeRow.querySelector('[data-vendor-mark="true"]')).not.toBeNull();
    expect(card().dataset.agentReady).toBe("true");
    fireEvent.click(screen.getByTestId("start-step-cta-agent"));
    expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
  });

  it('labels the secondary button Next instead of Skip on a completed step', () => {
    renderSteps({ acpRuntimeLabel: "Claude Agent" });
    expect(screen.getByTestId("start-step-skip").textContent).toBe("다음");
  });

  it('uses the same link when no runner was found', () => {
    const onOpenAgentConnect = vi.fn();
    renderSteps({ acpRuntimeLabel: null, onOpenAgentConnect });
    expect(card().dataset.agentReady).toBe("false");
    expect(screen.getByTestId("start-step-skip").textContent).toBe("건너뛰기");
    fireEvent.click(screen.getByTestId("start-step-cta-agent"));
    expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
  });
});

describe('the analysis step depends on where the prompt is pasted', () => {
  it('fills the in-app composer instead of asking to copy when chat exists', () => {
    const onSendAnalyzeToAgent = vi.fn();
    renderSteps({ acpRuntimeLabel: "Claude Agent", onSendAnalyzeToAgent });
    fireEvent.click(screen.getByTestId("start-step-skip")); // agent → analyze
    expect(card().dataset.step).toBe("analyze");
    fireEvent.click(screen.getByTestId("start-step-cta-analyze"));
    expect(onSendAnalyzeToAgent).toHaveBeenCalledTimes(1);
  });

  it('offers copy to someone who must paste elsewhere', () => {
    renderSteps({ onSendAnalyzeToAgent: null });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(screen.getByTestId("start-step-cta-analyze").textContent).toContain("복사");
  });
});

describe('the last step names what it creates', () => {
  it('calls the last step create starter docs for an empty folder', () => {
    renderSteps({ onScaffoldStarter: vi.fn() });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(card().dataset.step).toBe("starter");
    expect(screen.getByTestId("start-step-cta-starter").textContent).toBe("시작 문서 만들기");
  });

  it('locks and says so while creating', () => {
    renderSteps({ onScaffoldStarter: vi.fn(), scaffolding: true });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-skip"));
    const cta = screen.getByTestId("start-step-cta-starter") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toBe("만드는 중…");
  });

  it('makes the last step create-by-hand when docs already exist', () => {
    const onCreateNode = vi.fn();
    renderSteps({ onScaffoldStarter: null, onCreateNode });
    fireEvent.click(screen.getByTestId("start-step-skip"));
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(card().dataset.step).toBe("manual");
    fireEvent.click(screen.getByTestId("start-step-cta-manual"));
    expect(onCreateNode).toHaveBeenCalledWith("project");
  });
});

describe('existing docs in the folder become the first step', () => {
  it('shows four steps with the docs first when docs exist', () => {
    const onStartFromDocs = vi.fn();
    renderSteps({ docsFoundCount: 12, onStartFromDocs, onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("docs");
    expect(card().dataset.stepTotal).toBe("4");
    expect(screen.getByTestId("start-step-body").textContent).toContain("12");
    fireEvent.click(screen.getByTestId("start-step-cta-docs"));
    expect(onStartFromDocs).toHaveBeenCalledTimes(1);
  });

  it('omits the docs step for an empty folder', () => {
    renderSteps({ docsFoundCount: 0, onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("agent");
  });
});

/**
 * A codebase's owner has code, so the read-code step leads
 * (`docs/audits/USER-WALKTHROUGH-FIRST-RUN-2026-08-31.md`, finding 3).
 */
describe('code comes first when there is more code than docs', () => {
  it('puts the read-code step first when sources outnumber docs', () => {
    renderSteps({ docsFoundCount: 1, sourceFileCount: 5, onStartFromDocs: vi.fn(), onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("analyze");
    // The documents step is not dropped, only demoted: one README is still worth mapping.
    expect(card().dataset.stepTotal).toBe("4");
  });

  it('puts the code step first even without a connected agent by giving a prompt to paste', () => {
    // It may lead precisely because it degrades on its own rather than disabling itself.
    renderSteps({ docsFoundCount: 1, sourceFileCount: 5, onStartFromDocs: vi.fn(), onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("analyze");
    expect(screen.getByTestId("start-step-cta-analyze")).toBeEnabled();
  });

  it('keeps the order when docs outnumber code', () => {
    renderSteps({ docsFoundCount: 12, sourceFileCount: 2, onStartFromDocs: vi.fn(), onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("docs");
  });

  it('lets docs win a tie', () => {
    renderSteps({ docsFoundCount: 3, sourceFileCount: 3, onStartFromDocs: vi.fn(), onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("docs");
  });

  it('shows three steps with code first when there is only code', () => {
    renderSteps({ docsFoundCount: 0, sourceFileCount: 9, onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("analyze");
    expect(card().dataset.stepTotal).toBe("3");
  });

  it('keeps every step skippable in any order', () => {
    renderSteps({ docsFoundCount: 1, sourceFileCount: 5, onStartFromDocs: vi.fn(), onScaffoldStarter: vi.fn() });
    expect(card().dataset.step).toBe("analyze");
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(card().dataset.step).toBe("agent");
    fireEvent.click(screen.getByTestId("start-step-skip"));
    expect(card().dataset.step).toBe("docs");
  });
});

/**
 * The card stays centred in the window and INDEX passes beneath it; neither padding nor collapsing
 * INDEX.
 */
describe('the start card keeps the window centre', () => {
  const wrapper = () => card().parentElement as HTMLElement;

  it('does not shift sideways when INDEX is expanded', () => {
    renderSteps({ indexExpanded: true });
    expect(
      wrapper().className,
      'reserving INDEX width on the left shifts the card right by half',
    ).not.toContain("md:pl-[calc(");
    expect(wrapper().className).toContain("justify-center");
  });

  it('stays put when INDEX is collapsed', () => {
    renderSteps({ indexExpanded: false });
    expect(wrapper().className).not.toContain("md:pl-[calc(");
    expect(wrapper().className).toContain("justify-center");
  });

  it('reserves nothing by default so callers without the prop are unchanged', () => {
    renderSteps();
    expect(wrapper().dataset.indexReserved).toBe("false");
  });
});
