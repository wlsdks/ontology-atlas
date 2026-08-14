import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { deriveSkillProcess } from "@/entities/agent-skill";
import enMessages from "../../../../messages/en.json";
import { SkillProcessRail } from "./SkillProcessRail";

const skill = (body: string) =>
  `---\nname: rail-test\ndescription: Test the exact process rail\n---\n\n${body}`;

function Harness({ text, truncated = false }: { text: string; truncated?: boolean }) {
  const process = deriveSkillProcess({
    relativePath: "skills/rail-test/SKILL.md",
    text,
    existingPaths: new Set(["skills/rail-test/references/checklist.md"]),
    scanTruncated: truncated,
  });
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SkillProcessRail
        process={process}
        openStepIds={new Set()}
        onToggleStep={() => undefined}
      />
    </NextIntlClientProvider>
  );
}

describe("SkillProcessRail", () => {
  it("renders a flat ordered list with exact source coordinates and no process edges", () => {
    render(<Harness text={skill("1. Read the source.\n2. Verify references/checklist.md.\n")} />);

    const rail = screen.getByTestId("skill-process-rail");
    expect(rail.querySelector("ol")).not.toBeNull();
    const steps = screen.getAllByTestId("skill-process-step");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveAttribute("data-ordinal", "1");
    expect(steps[0]).toHaveAttribute("data-source-start", "6");
    expect(steps[1]).toHaveTextContent("Verify references/checklist.md.");
    expect(rail.querySelector("[data-process-edge]")).toBeNull();
  });

  it("keeps resources behind the row disclosure", () => {
    const process = deriveSkillProcess({
      relativePath: "skills/rail-test/SKILL.md",
      text: skill("1. Verify references/checklist.md.\n"),
      existingPaths: new Set(["skills/rail-test/references/checklist.md"]),
    });
    if (process.state !== "ready") throw new Error("fixture must derive");
    const stepId = process.process.steps[0].stepId;
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SkillProcessRail process={process} openStepIds={new Set()} onToggleStep={() => undefined} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(/checklist\.md · reference/)).not.toBeInTheDocument();
    const disclosure = screen.getByTestId("skill-step-disclosure");
    const detailId = `skill-step-detail-${stepId.replace(/^[^:]+:/, "").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    expect(disclosure).toHaveAttribute("aria-controls", detailId);
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SkillProcessRail process={process} openStepIds={new Set([stepId])} onToggleStep={() => undefined} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("skill-step-disclosure")).toHaveAttribute("aria-controls", detailId);
    expect(screen.getByTestId("skill-step-disclosure").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/checklist\.md · reference/)).toHaveTextContent("exists");
  });

  it("shows only admitted exact semantic grammar as direct text labels", () => {
    render(
      <Harness
        text={skill(
          "1. Run the check.\n2. Retry step 1 until the smoke test passes.\n3. Verify the archive by comparing SHA-256; accept when the digest matches.\n",
        )}
      />,
    );

    const labels = screen.getAllByTestId("skill-semantic-label");
    expect(labels).toHaveLength(2);
    expect(labels[0]).toHaveAttribute("data-semantic-kind", "retry");
    expect(labels[0]).toHaveTextContent("Retry step 1 until the smoke test passes");
    expect(labels[1]).toHaveAttribute("data-semantic-kind", "verify");
    expect(labels[1]).toHaveTextContent("Verify the archive by comparing SHA-256");
    expect(screen.getByTestId("skill-process-rail").querySelector("[data-process-edge]")).toBeNull();
  });

  it("keeps ambiguous semantic prose unlabeled and exposes its diagnostic", () => {
    const process = deriveSkillProcess({
      relativePath: "skills/rail-test/SKILL.md",
      text: skill("1. Stop mutation after writing the receipt.\n"),
    });
    if (process.state !== "ready") throw new Error("fixture must derive");
    const stepId = process.process.steps[0].stepId;
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SkillProcessRail
          process={process}
          openStepIds={new Set([stepId])}
          onToggleStep={() => undefined}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTestId("skill-semantic-label")).not.toBeInTheDocument();
    expect(screen.getByText("Semantic syntax is ambiguous; no label was derived.")).toBeVisible();
  });

  it("fails closed when the source scan was truncated", () => {
    render(<Harness text={skill("1. Do one step.\n")} truncated />);
    expect(screen.getByTestId("skill-process-rail")).toHaveAttribute("data-process-state", "unavailable");
    expect(screen.getByText(/will not guess/i)).toBeVisible();
    expect(screen.queryByTestId("skill-process-step")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-packet-copy")).toBeDisabled();
    expect(screen.getByTestId("skill-packet-status")).toHaveTextContent(/copying is blocked/i);
  });

  it("announces success only after canonical packet bytes reach the clipboard", async () => {
    let resolveCopy: () => void = () => undefined;
    const writeText = vi.fn((_: string) => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<Harness text={skill("1. Read the source.\n")} />);

    fireEvent.click(screen.getByTestId("skill-packet-copy"));
    expect(screen.getByTestId("skill-packet-status")).toHaveTextContent("Copying");
    expect(screen.queryByText("Packet copied")).not.toBeInTheDocument();
    resolveCopy();
    await waitFor(() => expect(screen.getByTestId("skill-packet-status")).toHaveTextContent("Packet copied"));
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain('"packetVersion":"skillProcessPacket:v1"');
    expect(copied).toContain('"packetDigest":"sha256:');
  });
});
