import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";

import { ProjectForm } from "./ProjectForm";

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

describe("ProjectForm — 저장 거절은 눌린 사람에게 도착한다", () => {
  it("저장이 실패하면 초점이 오류 배너로 간다", async () => {
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
    expect(onSubmit, "저장이 호출되지 않았다 — 이 시험이 헛돈다").toHaveBeenCalledTimes(1);

    const banner = await screen.findByTestId("project-error-banner");
    expect(banner).toHaveTextContent("데모 모드에서는 저장할 수 없습니다");
    expect(
      document.activeElement,
      "저장이 거절됐는데 초점이 그대로다 — 긴 폼·짧은 화면에서는 이유가 화면 밖에 뜬다",
    ).toBe(banner);
  });

  it("성공하면 초점을 빼앗지 않는다", async () => {
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
