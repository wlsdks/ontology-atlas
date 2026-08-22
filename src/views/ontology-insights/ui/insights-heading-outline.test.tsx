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
  it("level 2 는 h2, level 3 은 h3 을 낸다", () => {
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
  it("넘긴 클래스를 그대로 싣는다 — 램프 클래스가 유실되면 크기가 튄다", () => {
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
  it("flex 행에서 제목이 먼저 눌리지 않는다 — shrink-0 을 싣는다", () => {
    render(<InsightsSectionTitle level={2}>수리 큐</InsightsSectionTitle>);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("shrink-0");
  });

  it("호출부 클래스와 함께 실려도 shrink-0 이 살아남는다", () => {
    render(
      <InsightsSectionTitle level={3} className="text-body font-[var(--font-weight-signature)]">
        여러 곳에서 참조돼요
      </InsightsSectionTitle>,
    );
    const el = screen.getByRole("heading", { level: 3 });
    expect(el.className).toContain("shrink-0");
    expect(el.className).toContain("text-body");
  });

  it("data-* 같은 속성을 통과시킨다", () => {
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
describe("인사이트 소스 — 구획 제목 클래스가 span 으로 남아 있지 않다", async () => {
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

  it("probe: 실제로 파일을 읽고 있다", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(TITLE_CLASSES)("`%s` 를 span 이 쓰지 않는다", (cls) => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(`<span className="${cls}"`));
    expect(
      offenders,
      `구획 제목은 <InsightsSectionTitle> 로 낸다 — 그래야 화면의 위계가 문서에도 남는다.\n` +
        `위반: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
