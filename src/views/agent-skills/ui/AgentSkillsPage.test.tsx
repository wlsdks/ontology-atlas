import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSkillInventory } from "@/entities/agent-skill";
import enMessages from "../../../../messages/en.json";
import { AgentSkillsPage } from "./AgentSkillsPage";

const inventory = buildSkillInventory({
  files: [
    {
      relativePath: "skills/process/SKILL.md",
      text: "---\nname: process\ndescription: Run one exact process\n---\n\n1. Read the source.\n2. Verify the result.\n",
    },
  ],
  existingPaths: new Set(["skills/process/SKILL.md"]),
});

vi.mock("@/features/agent-skills-local", () => ({
  useSkillFolder: () => ({
    status: "ready",
    inventory,
    folderName: "skills",
    scan: { truncated: false, scannedFiles: 1, skippedNotInstalled: null },
    error: null,
    sample: false,
    openFolder: vi.fn(),
    openSample: vi.fn(),
  }),
}));

function viewport(compact: boolean) {
  window.matchMedia = vi.fn(() => ({
    matches: compact,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AgentSkillsPage />
    </NextIntlClientProvider>,
  );
}

const originalMatchMedia = window.matchMedia;
const originalRaf = window.requestAnimationFrame;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  window.requestAnimationFrame = originalRaf;
  vi.restoreAllMocks();
});

describe("AgentSkillsPage responsive workbench", () => {
  it("keeps the 340+fluid split at the lg boundary", () => {
    viewport(false);
    renderPage();
    expect(screen.getByTestId("skills-workbench")).toHaveAttribute("data-view", "split");
    expect(screen.getByTestId("skills-left")).toBeInTheDocument();
    expect(screen.getByTestId("skills-right")).toBeInTheDocument();
  });

  it("drills from list to a non-zero detail and restores query, selection, and focus", () => {
    viewport(true);
    renderPage();
    const workbench = screen.getByTestId("skills-workbench");
    expect(workbench).toHaveAttribute("data-view", "list");
    const search = screen.getByTestId("skills-search");
    fireEvent.change(search, { target: { value: "process" } });
    const row = screen.getByTestId("skill-row-toggle");
    fireEvent.click(row);

    expect(workbench).toHaveAttribute("data-view", "detail");
    expect(screen.getByTestId("skills-right")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "process" })).toHaveFocus();
    expect(screen.getAllByTestId("skill-process-step")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("skills-detail-back"));
    expect(workbench).toHaveAttribute("data-view", "list");
    expect(screen.getByTestId("skills-search")).toHaveValue("process");
    expect(screen.getByTestId("skill-row-toggle")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("skill-row-toggle")).toHaveFocus();
  });
});
