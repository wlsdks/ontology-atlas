import { describe, expect, it } from "vitest";
import { truncateMiddlePath } from "./truncate-middle-path";

describe("truncateMiddlePath", () => {
  it("returns short paths unchanged", () => {
    expect(truncateMiddlePath("src/foo/bar.ts")).toBe("src/foo/bar.ts");
  });

  it("truncates a long path in the middle, keeping head and tail", () => {
    const long = "src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx";
    const result = truncateMiddlePath(long, 44);
    expect(result.length).toBeLessThanOrEqual(44);
    expect(result).toContain("…");
    expect(result.startsWith("src/")).toBe(true);
    expect(result.endsWith(".tsx")).toBe(true);
    // the tail keeps the filename's end, not just the last path segment's start
    expect(result.endsWith("DetailPanel.tsx")).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const long = "cli/src/commands/agent-brief-and-a-very-long-file-name.mjs";
    expect(truncateMiddlePath(long)).toBe(truncateMiddlePath(long));
  });

  it("respects a custom maxLength", () => {
    const long = "mcp/src/index.js-and-some-more-characters-to-force-truncation";
    const result = truncateMiddlePath(long, 20);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});
