import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { LibraryConversationDoor } from "./LibraryConversationDoor";

function draw(activity: Parameters<typeof LibraryConversationDoor>[0]["activity"], open = false) {
  const onToggle = vi.fn();
  render(
    <IntlProvider locale="en" messages={enMessages}>
      <LibraryConversationDoor activity={activity} agentLabel="Claude Agent" open={open} onToggle={onToggle} />
    </IntlProvider>,
  );
  return { onToggle, chip: screen.getByTestId("library-open-conversation") };
}

describe("the put-away conversation", () => {
  it("names the destination while nothing is running", () => {
    const { chip } = draw(null);
    expect(chip).toHaveTextContent("Conversation");
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(chip.getAttribute("data-agent-running")).toBeNull();
    expect(screen.queryByTestId("library-conversation-running-dot")).toBeNull();
  });

  it("keeps one face while a turn runs: the dot marks it and the phase is in the tooltip", async () => {
    const { chip } = draw({
      state: "editing",
      summary: "Write up the four sources",
      ontologySlug: null,
      toolName: "Write wiki/contractor-quotes.md",
    });
    expect(chip).toHaveTextContent(/^Conversation$/);
    fireEvent.focus(chip);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Conversation · Editing");
    expect(screen.getByTestId("library-conversation-running-dot")).toBeInTheDocument();
  });

  it("does not replace the destination with the internal request", async () => {
    const { chip } = draw({
      state: "planning",
      summary: "Check the wiki against its sources",
      ontologySlug: null,
      toolName: null,
    });
    fireEvent.focus(chip);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Conversation · Planning");
    expect(chip.getAttribute("aria-label")).not.toContain("Check the wiki against its sources");
  });

  it("says a shut dock is holding a permission card — the one turn that waits forever", async () => {
    const { chip } = draw({
      state: "blocked",
      summary: "Write up the four sources",
      ontologySlug: null,
      toolName: "Write /outside/notes.md",
    });
    fireEvent.focus(chip);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Conversation · Waiting for approval");
    expect(chip.getAttribute("aria-label")).toBe(
      "Open the conversation. Claude Agent is still working: Waiting for approval.",
    );
  });

  it("is still the door back into the conversation while it runs", () => {
    const { onToggle, chip } = draw({
      state: "verifying",
      summary: null,
      ontologySlug: "contractor-quotes",
      toolName: null,
    });
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("the open conversation", () => {
  it("stays in the header, selected, and one press puts the dock away", () => {
    const { onToggle, chip } = draw(
      { state: "editing", summary: null, ontologySlug: null, toolName: null },
      true,
    );
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(chip).toHaveTextContent(/^Conversation$/);
    expect(screen.queryByTestId("library-conversation-running-dot")).toBeNull();
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
