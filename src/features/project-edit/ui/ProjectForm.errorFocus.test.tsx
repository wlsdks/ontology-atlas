import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";

import { ProjectForm } from "./ProjectForm";

/**
 * 저장이 거절되면 **그 이유가 눌린 사람 눈에 들어와야 한다.**
 *
 * ## 왜 이 시험이 생겼나 (2026-08-07 실측)
 *
 * 편집 화면에서 저장을 누르니 거절 알림이 **390×844 에서 top 802 · bottom
 * 872** 에 떴다 — 뷰포트가 844 라 위아래로 잘린 채 하단 탭바 뒤에 걸렸다.
 * 1512×900 에서는 628–676 으로 멀쩡히 보였다. **폼이 길수록, 화면이 짧을수록
 * 어긋난다** — 즉 넓은 화면에서만 확인하면 영원히 안 보이는 결함이다.
 *
 * 그 자리의 원인(볼트 없이 저장을 누를 수 있었던 것)은 이제 버튼을 미리
 * 잠가서 막았다. 그러나 **칸이 없는 오류**는 남는다 — 저장 실패, 쓰기 충돌.
 * 검증 오류는 `focusField` 가 그 칸으로 데려가지만 그런 오류는 데려갈 곳이
 * 이 배너뿐이다.
 *
 * ## 왜 픽셀이 아니라 초점을 재나
 *
 * 「보이는 자리에 있는가」는 폼 길이·뷰포트·번역 길이에 따라 달라져서, 어느
 * 한 조합을 못박으면 다른 조합에서 조용히 틀린다. **초점이 그 배너에 있는가**
 * 는 그 전부에서 같은 뜻이고, 화면을 못 보는 사람에게도 같은 값을 준다.
 * 스크롤은 그 초점 이동에 브라우저가 딸려 주는 것이다(jsdom 은 `scrollIntoView`
 * 를 구현하지 않으므로 여기서는 초점만 판정한다 — `focusField` 와 같은 규율).
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

    // 공회전 차단 — 제출이 안 됐으면 아래 단언은 「맞아서」가 아니라 「안 일어나서」다.
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
