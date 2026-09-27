import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../../../messages/ko.json";
import { GuideReplayProvider, useGuideReplay } from "../model/guide-replay-context";
import { destinationTourStatusKey } from "../model/tour-storage";
import { EXIT_WINDOW_MS } from "@/shared/lib/use-presence";
import { DestinationGuide } from "./DestinationGuide";

const DOCS_KEY = destinationTourStatusKey("docs");
/** The global auto-display switch — one test turning it off leaves it off for the next. */
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
  // The auto-start guard looks at document focus (so guidance is not fired into a
  // background tab). jsdom defaults to unfocused, so it is set explicitly.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  window.localStorage.removeItem(DOCS_KEY);
  // Auto-display has been off by default (opt-in) since 2026-08-13 — the tests below
  // that examine automatic firing assume the switch is on. The default itself is
  // checked separately by the "with no stored value" test.
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

  // Regression 2026-07-26 — the workshop is a screen where the entry choice
  // (`role=dialog aria-modal`) stands the moment you arrive. Firing guidance over it
  // covers the very choices the card meant to introduce and puts two `aria-modal`
  // elements up at once (the card vanishes for a screen reader). The contract is to
  // wait until the decision is made and appear on the work surface.
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

  // Audit 2026-07-27 — pressing any other navigation while the guidance was up
  // swallowed the click with no response. Blocking that does not say "blocked" reads
  // to the user as "broken". Pressing a blocked spot withdraws the guidance, and a
  // second press goes through.
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

  // Verdict ① of 2026-07-28 — the "cancel the firing if the user moves first while
  // waiting" guard, which only the map had, was ported to the five destination tours.
  // With a 30-second waiting window, a card appearing belatedly over someone who had
  // started exploring on their own was the defect.
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
 * The switch's real contract — **off stops only the automatic, and calling it still works.**
 *
 * Why both are in one test: honouring only half becomes a different defect each way.
 * If the automatic does not stop, the switch is a lie; if it also does not come when
 * called, that is not a switch but **deletion**. The owner asked for the former
 * ("Or else when clicked" — or else when clicked).
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
