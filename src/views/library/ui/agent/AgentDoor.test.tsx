import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import enMessages from "../../../../../messages/en.json";
import koMessages from "../../../../../messages/ko.json";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { LibraryQuestions } from "../questions/LibraryQuestions";
import { AgentDoor } from "./AgentDoor";

/**
 * Pins the two ways the door could go wrong: carrying copy of its own (the label must be the rail's
 * destination word) and appearing where the sentence is not.
 */

function renderIn(locale: "en" | "ko", node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ko" ? koMessages : enMessages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("the door out of a blocked step", () => {
  it("goes to the agents destination and wears the rail's own word for it", () => {
    renderIn("ko", <AgentDoor />);
    const door = screen.getByTestId("library-agent-door");
    /*
     * The label is `navRail.agents`, not a sentence written for this control. Asserted
     * against the catalogue rather than a literal, so a copy change moves both or neither.
     */
    expect(door).toHaveTextContent(koMessages.navRail.agents);
    /*
     * Locale-prefixed, because it is `@/i18n/navigation`'s `Link` — `/ko/agents`, not
     * `/agents/`. Asserting the prefix is the point: a raw `next/link` here would drop
     * the locale and bounce the person through a redirect.
     */
    expect(door.getAttribute("href")).toBe(`/ko${DESTINATION_HREF.agents.replace(/\/$/, "")}`);
  });

  it("is one control, not a sentence", () => {
    renderIn("en", <AgentDoor />);
    const door = screen.getByTestId("library-agent-door");
    // The failing condition the brief names: "the door is a sentence".
    expect(door.tagName).toBe("A");
    expect(door.textContent?.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
  });
});

describe("where the door appears, and where it must not", () => {
  const questions = (props: { askBlockedReasonId?: string | null; agentDoor: boolean }) => {
    function Harness() {
      const t = useTranslations("library");
      return (
        <LibraryQuestions
          answers={[]}
          knownSources={new Set()}
          hashes={new Map()}
          onOpen={() => {}}
          onAsk={null}
          askBlockedReason="No verified coding agent is set up on this computer."
          t={t}
          {...props}
        />
      );
    }
    return renderIn("en", <Harness />);
  };

  it("stands beside the reason when this card is the one printing it", () => {
    questions({ agentDoor: true });
    expect(screen.getByTestId("library-questions-ask-blocked")).toBeTruthy();
    expect(screen.getByTestId("library-questions-ask-blocked-door")).toBeTruthy();
  });

  it("is absent when another card on the landing owns the sentence", () => {
    questions({ askBlockedReasonId: "library-stage-compile-blocked", agentDoor: true });
    expect(screen.queryByTestId("library-questions-ask-blocked")).toBeNull();
    expect(screen.queryByTestId("library-questions-ask-blocked-door")).toBeNull();
  });

  it("is absent where the missing thing is not a coding agent", () => {
    // The web case: `/download/`'s own card is the honest door, and `agentDoor` is false.
    questions({ agentDoor: false });
    expect(screen.getByTestId("library-questions-ask-blocked")).toBeTruthy();
    expect(screen.queryByTestId("library-questions-ask-blocked-door")).toBeNull();
  });
});
