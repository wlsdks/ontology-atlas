import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { InsightsSectionTitle } from "./parts/InsightsSectionTitle";

/**
 * **The visible hierarchy must also be the document hierarchy.**
 *
 * Found while dogfooding, 2026-07-29: the whole insights board had **one `<h1>`** and nothing
 * else. "Agent readiness", "repair queue", and "referenced in many places" were all `<span>`s
 * wearing `text-body-lg` and the signature weight, so the eye saw three levels of hierarchy while
 * the document had none.
 *
 * This screen's job is **to skim and pick the next thing to do**. If it cannot be skimmed by
 * headings, that job cannot be done at all.
 *
 * Why a component rather than just changing the tag: the same class string was duplicated twelve
 * times across five files. Swapping tags alone leaves those duplicates, and the next person writes
 * a thirteenth `<span>`. This test pins both that the component **really emits a heading** and that
 * it **passes the visual spec through unchanged** — keeping only one of the two makes the change meaningless.
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
   * Zero visual change is the premise of this replacement. Tailwind preflight resets a heading's
   * font-size and weight to `inherit`, so size and weight are decided entirely by the classes
   * passed in — losing the classes makes the title jump to the browser's default h2 size.
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
   * **A title is never squeezed** (a narrow-width regression guard, measured 2026-07-29).
   *
   * At 834px "repair queue" folded in the middle of its name into "repair / queue". In the flex row
   * holding the title, the figure-chip group beside it took the whole width without `min-w-0`,
   * squeezing the title column to 30px. The card right next to it was fine in the same situation —
   * **two titles in the same role were under different rules.**
   *
   * Fixing it per call site means it recurs on the third card. The rule was attached to the role,
   * and this check holds it there. The side that should be squeezed is always the figures and chips
   * beside it.
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

/**
 * **A detector against section titles reverting to `<span>`.**
 *
 * The unit test above sees only the component — if the next person skips it and writes the old
 * `<span className="text-body-lg font-[var(--font-weight-signature)] …">` again, it passes.
 * So the source is scanned directly. This check holds because the class string *is* the role declaration.
 */
describe("insights sources render section title classes on headings, not spans", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const ROOT = "src/views/ontology-insights/ui";
  /*
   * ⚠️ **These strings are not a spec but «the letterforms of that moment».** When the weight axis
   * moved up into the ramp (2026-08-05), `font-medium` became
   * `font-[var(--font-weight-signature)]` — and had this list not been updated with it, this gate
   * would have **passed forever while searching for a string that does not exist**. A gate that
   * cannot go red is not a gate (`/gate-probe`). If the ramp moves again, this moves with it.
   */
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
