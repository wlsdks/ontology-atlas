import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkTrail } from "./work-trail";

const states = (container: HTMLElement) => [...container.querySelectorAll("[data-work-trail-node]")].map((node) => node.getAttribute("data-work-trail-node"));

describe("WorkTrail", () => {
  it("draws one node per plan step, lights the done ones and marks the next as in progress", () => {
    const { container } = render(<WorkTrail phase="running" done={2} total={5} label="Plan" />);
    expect(states(container)).toEqual(["lit", "lit", "current", "ahead", "ahead"]);
    expect(container.firstElementChild).toHaveAttribute("aria-valuenow", "40");
  });

  it("claims no fraction when the total is unknown", () => {
    const { container } = render(<WorkTrail phase="running" done={3} total={null} label="Work" />);
    expect(states(container)).not.toContain("lit");
    expect(container.firstElementChild).not.toHaveAttribute("aria-valuenow");
  });

  it("lights every node when the work is done", () => {
    const { container } = render(<WorkTrail phase="done" done={0} total={null} label="Work" />);
    expect(new Set(states(container))).toEqual(new Set(["lit"]));
    expect(container.firstElementChild).toHaveAttribute("aria-valuenow", "100");
  });

  it("keeps the lit share true when a plan has more steps than nodes", () => {
    const { container } = render(<WorkTrail phase="running" done={10} total={20} label="Plan" />);
    const nodes = states(container);
    expect(nodes.filter((state) => state === "lit").length).toBe(Math.floor(nodes.length / 2));
  });
});
