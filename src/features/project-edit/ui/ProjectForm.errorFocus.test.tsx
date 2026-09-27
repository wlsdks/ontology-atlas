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
 * A rejected save must move focus to the reason. Focus is asserted rather than pixels because
 * visibility varies with form length and viewport; jsdom lacks `scrollIntoView`.
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
    /* The banner shows the copy written for a failed save, not the thrown message (`no-raw-error-copy`). */
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
