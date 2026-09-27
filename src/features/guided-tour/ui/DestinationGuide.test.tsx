import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../../../messages/ko.json";
import { GuideReplayProvider, useGuideReplay } from "../model/guide-replay-context";
import { destinationTourStatusKey } from "../model/tour-storage";
import { EXIT_WINDOW_MS } from "@/shared/lib/use-presence";
import { DestinationGuide } from "./DestinationGuide";

const DOCS_KEY = destinationTourStatusKey("docs");
/** The global auto-display switch; a test turning it off would leave it off for the next. */
const AUTO_START_KEY = "ontology-atlas:guide-auto-start:v1";

function renderGuide(destination: "docs" | null = "docs") {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <GuideReplayProvider>
        <div data-testid="docs-vault-doc-list">문서 목록</div>
        <DestinationGuide destination={destination} />
        <ReplayButton />
      </GuideReplayProvider>
    </NextIntlClientProvider>,
  );
}

function ReplayButton() {
  const replay = useGuideReplay();
  if (!replay) return null;
  return (
    <button type="button" data-testid="replay" onClick={replay}>
      다시 보기
    </button>
  );
}

beforeEach(() => {
  // The auto-start guard reads document focus, and jsdom defaults to unfocused.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  window.localStorage.removeItem(DOCS_KEY);
  // Auto-display is off by default (opt-in), so these tests turn it on; the default has its
  // own "with no stored value" test.
  window.localStorage.setItem(AUTO_START_KEY, "1");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.removeItem(DOCS_KEY);
  window.localStorage.removeItem(AUTO_START_KEY);
});

describe("DestinationGuide", () => {
  it("opens the destination tour shortly after a first visit", async () => {
    renderGuide();
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      ko.guidedTour.steps.docsWhat.title,
    );
  });

  it("does not auto-open again on a seen destination", async () => {
    window.localStorage.setItem(DOCS_KEY, "skipped");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
  });

  it("reopens through replay after being seen", async () => {
    window.localStorage.setItem(DOCS_KEY, "done");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("replay"));
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  // Guidance over the workshop's entry choice would cover the cards it introduces and stack two
  // `aria-modal` elements; it waits for the decision.
  it("waits for a decision modal to close before opening", async () => {
    const modal = document.createElement("section");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();

    modal.remove();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  // A blocked press that says nothing reads as broken, so it withdraws the guidance and a second
  // press goes through.
  it("dismisses the tour when a blocked area is pressed", async () => {
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();

    const blocker = screen.getByTestId("guided-tour-blocker");
    expect(blocker).toHaveAttribute("data-dismissable", "true");
    await act(async () => {
      fireEvent.click(blocker);
    });
    // It leaves through its exit window (inert, fading), then unmounts.
    expect(screen.getByTestId("guided-tour-overlay")).toHaveAttribute("data-state", "closed");
    await act(async () => {
      vi.advanceTimersByTime(EXIT_WINDOW_MS);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
  });

  // Someone who started exploring during the up-to-30-second wait must not get a belated card.
  it("never opens when the user acts during the delay", async () => {
    renderGuide();
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
  });

  it("leaves replay available after a cancelled auto start without recording seen", async () => {
    renderGuide();
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(window.localStorage.getItem(DOCS_KEY)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("replay"));
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  it("keeps the card open on a click after it appeared", async () => {
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  it("renders nothing on the map without a destination", async () => {
    renderGuide(null);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    expect(screen.queryByTestId("replay")).toBeNull();
  });
});

/**
 * Off stops only the automatic opening; replay still works. Both halves are tested together
 * because each alone is a different defect: a switch that lies, or deletion.
 */
describe("tour auto-show switch", () => {
  it("does not auto-open when the switch is off", async () => {
    window.localStorage.setItem(AUTO_START_KEY, "0");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("auto-opens when the switch is on", async () => {
    window.localStorage.setItem(AUTO_START_KEY, "1");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("does not auto-open by default with no stored value", async () => {
    window.localStorage.removeItem(AUTO_START_KEY);
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("still opens through replay when the switch is off", async () => {
    window.localStorage.setItem(AUTO_START_KEY, "0");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    fireEvent.click(screen.getByTestId("replay"));
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});
