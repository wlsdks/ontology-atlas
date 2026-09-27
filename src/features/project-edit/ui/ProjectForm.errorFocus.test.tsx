import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";

import { ProjectForm } from "./ProjectForm";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/shared/lib/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => motion.reduced,
}));

/**
 * When a save is rejected, **the reason must reach the eye of the person who pressed it.**
 *
 * ## Why this test exists (measured 2026-08-07)
 *
 * Pressing save on the edit screen put the rejection notice at **top 802 · bottom 872 at
 * 390×844** — with a viewport of 844 it was clipped at both ends and caught behind the
 * bottom tab bar. At 1512×900 it was perfectly visible at 628–676. **The longer the form
 * and the shorter the screen, the worse the mismatch** — that is, a defect invisible
 * forever if you only check on a wide screen.
 *
 * The cause in that instance (being able to press save with no vault) is now prevented by
 * disabling the button up front. But errors **with no field** remain — a failed save, a
 * write conflict. `focusField` takes validation errors to their field; those errors have
 * nowhere to go but this banner.
 *
 * ## Why focus is measured rather than pixels
 *
 * "Is it in a visible position" varies with form length, viewport, and translation length,
 * so pinning one combination goes quietly wrong in another. **Is focus on that banner**
 * means the same thing across all of them, and gives the same value to someone who cannot
 * see the screen. Scrolling is what the browser adds to that focus move (jsdom does not
 * implement `scrollIntoView`, so only focus is asserted here — the same discipline as `focusField`).
 */

const project: Project = {
  slug: "storefront",
  name: "온라인 쇼핑몰",
  description: "고객이 상품을 둘러보고 결제한다",
  tags: [],
  stack: [],
  links: [],
  dependencies: [],
  screenshots: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-20T00:00:00.000Z"),
};

function renderEdit(onSubmit: () => Promise<void>) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TaxonomyProvider>
        <ProjectForm
          mode="edit"
          initialProject={project}
          allProjects={[project]}
          onSubmit={onSubmit}
          onCancel={() => {}}
        />
      </TaxonomyProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  motion.reduced = false;
});

describe("ProjectForm save rejection focus", () => {
  it("focuses the name on an empty create form without flagging the automatic slug as an error", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onSubmit = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TaxonomyProvider>
          <ProjectForm mode="create" allProjects={[]} onSubmit={onSubmit} onCancel={() => {}} />
        </TaxonomyProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getAllByTestId("project-save-return")[0]);
    const name = screen.getByLabelText(koMessages.settings.projectForm.fields.name);
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByLabelText(koMessages.settings.projectForm.fields.slug)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("moves focus to the error banner when the save fails", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const onSubmit = vi.fn(async () => {
      throw new Error("데모 모드에서는 저장할 수 없습니다. 먼저 폴더를 열어 주세요.");
    });
    renderEdit(onSubmit);

    const save = screen.getAllByTestId("project-save-return")[0];
    await act(async () => {
      fireEvent.click(save);
    });

    // Guard against a no-op run: if submit never happened, the assertions below pass
    // because nothing occurred rather than because they are true.
    expect(onSubmit, "submit was never called, so this test proves nothing").toHaveBeenCalledTimes(1);

    const banner = await screen.findByTestId("project-error-banner");
    /*
     * ⚠️ The banner shows **the copy written for a failed save**, not the thrown message
     * (v1.2.2: `no-raw-error-copy` R1). This fixture throws Korean; the real rejections throw
     * English from the vault layer, and a screen cannot translate either of them. The thrown
     * text is kept where a developer reads it and a reader does not.
     */
    expect(banner).toHaveTextContent(koMessages.settings.projectForm.validation.saveFailed);
    expect(banner.getAttribute("data-failure-detail")).toContain(
      "데모 모드에서는 저장할 수 없습니다",
    );
    expect(
      document.activeElement,
      "focus stayed put after a rejected save, leaving the reason off screen on a long form",
    ).toBe(banner);
    expect(scrollSpy).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('reduced motion uses an instant scroll while preserving error focus', async () => {
    motion.reduced = true;
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const onSubmit = vi.fn(async () => {
      throw new Error('저장 실패');
    });
    renderEdit(onSubmit);

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('project-save-return')[0]);
    });

    const banner = await screen.findByTestId('project-error-banner');
    expect(document.activeElement).toBe(banner);
    expect(scrollSpy).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'center' });
  });

  it("keeps focus where it is when the save succeeds", async () => {
    const onSubmit = vi.fn(async () => {});
    renderEdit(onSubmit);

    const save = screen.getAllByTestId("project-save-return")[0];
    await act(async () => {
      fireEvent.click(save);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("project-error-banner")).toBeNull();
  });
});
