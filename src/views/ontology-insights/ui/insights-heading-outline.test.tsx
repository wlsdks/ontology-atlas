import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { InsightsSectionTitle } from "./parts/InsightsSectionTitle";

/**
 * Section titles are real headings, so the board can be skimmed by heading. The test pins both that the component
 * emits a heading and that it passes the visual classes through unchanged.
 */
describe("InsightsSectionTitle", () => {
  it("renders h2 for level 2 and h3 for level 3", () => {
    render(
      <>
        <InsightsSectionTitle level={2}>수리 큐</InsightsSectionTitle>
        <InsightsSectionTitle level={3}>여러 곳에서 참조돼요</InsightsSectionTitle>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "수리 큐" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "여러 곳에서 참조돼요" }),
    ).toBeInTheDocument();
  });

  /**
   * Preflight resets a heading's size and weight to `inherit`, so the passed classes decide the look; losing them
   * makes the title jump to the browser's default size.
   */
  it("keeps the passed class so the ramp size survives", () => {
    render(
      <InsightsSectionTitle
        level={2}
        className="text-body-lg font-[var(--font-weight-signature)] tracking-[-0.01em] text-[color:var(--color-text-primary)]"
      >
        에이전트 준비도
      </InsightsSectionTitle>,
    );
    const el = screen.getByRole("heading", { level: 2 });
    expect(el.className).toContain("text-body-lg");
    expect(el.className).toContain("font-[var(--font-weight-signature)]");
  });

  /**
   * A title is never squeezed in a flex row: the rule lives on the role, so every card gets it and the figures
   * and chips beside a title shrink instead.
   */
  it("carries shrink-0 so the title does not shrink first in a flex row", () => {
    render(<InsightsSectionTitle level={2}>수리 큐</InsightsSectionTitle>);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("shrink-0");
  });

  it("keeps shrink-0 beside a caller class", () => {
    render(
      <InsightsSectionTitle level={3} className="text-body font-[var(--font-weight-signature)]">
        여러 곳에서 참조돼요
      </InsightsSectionTitle>,
    );
    const el = screen.getByRole("heading", { level: 3 });
    expect(el.className).toContain("shrink-0");
    expect(el.className).toContain("text-body");
  });

  it("passes through data attributes", () => {
    render(
      <InsightsSectionTitle level={3} data-testid="probe">
        경계
      </InsightsSectionTitle>,
    );
    expect(screen.getByTestId("probe").tagName).toBe("H3");
  });
});

/** Scans the sources for section-title classes on a `<span>`, which the component test above cannot see. */
describe("insights sources render section title classes on headings, not spans", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const ROOT = "src/views/ontology-insights/ui";
  // These strings are the ramp's current classes, not a spec: if the ramp moves, update them, or this gate searches
  // for a string that no longer exists and can never go red (`/gate-probe`).
  const TITLE_CLASSES = [
    'text-body-lg font-[var(--font-weight-signature)] tracking-[-0.01em] text-[color:var(--color-text-primary)]',
    'text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]',
  ];

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
    });
  }

  const files = walk(ROOT);

  it("probe reads real files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(TITLE_CLASSES)("no span in %s uses a section title class", (cls) => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(`<span className="${cls}"`));
    expect(
      offenders,
      `구획 제목은 <InsightsSectionTitle> 로 낸다 — 그래야 화면의 위계가 문서에도 남는다.\n` +
        `위반: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
