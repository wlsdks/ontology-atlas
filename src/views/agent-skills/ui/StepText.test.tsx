import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepText } from "./StepText";

/**
 * 이 부품이 지켜야 하는 것은 둘이고, **둘째가 더 중요하다.**
 *
 * ① 마크다운 표기가 화면에 새지 않는다(별표·백틱이 글자로 보이지 않는다).
 * ② **그린 것을 도로 붙이면 원문과 한 글자도 다르지 않다.** `exactText` 는
 *    지문으로 대조되고 절차 묶음 복사가 그대로 직렬화하는 값이라, 그리는
 *    과정에서 한 글자라도 먹으면 「원문 그대로」가 거짓말이 된다.
 */
const drawn = (text: string) => {
  const { container } = render(
    <p>
      <StepText text={text} />
    </p>,
  );
  return container.textContent ?? "";
};

describe("단계 글 그리기", () => {
  it("굵게 표기를 글자로 보여 주지 않는다", () => {
    render(
      <p>
        <StepText text="일부러 틀리게 만들어 **가장 중요한 단계** 를 본다" />
      </p>,
    );
    // 굵게 안쪽이 한 겹 더 나뉘므로(코드 중첩) 태그가 아니라 **조상**을 본다.
    expect(screen.getByText("가장 중요한 단계").closest("strong")).not.toBeNull();
    expect(screen.getByText("가장 중요한 단계").textContent).not.toContain("*");
  });

  it("파일 이름을 코드로 그린다", () => {
    render(
      <p>
        <StepText text="`app/globals.css` 에서 토큰을 찾는다" />
      </p>,
    );
    expect(screen.getByText("app/globals.css").tagName).toBe("CODE");
  });

  // ⚠️ **이 시험은 한 번 헛돌았다.** 처음 쓴 예시에는 닫는 별표 짝이 없어서
  // 어느 구현으로도 강조가 안 잡혔다 — 아무것도 안 재고 있었다는 뜻이다. 짝이
  // 맞는 별표를 백틱 안에 넣고 나서야 걸리기 시작했다.
  //
  // 무엇을 잠그는가: **표기를 한 벌로 훑는다**는 것. 굵게를 먼저 한 벌 훑고
  // 그다음 코드를 훑는 2패스 구현이 가장 그럴듯한 오답인데, 그렇게 하면 명령
  // 안의 별표가 강조로 먹혀 명령이 망가진다 — 그 구현을 넣어 이 줄이 빨개지는
  // 것을 확인했다. (교대 순서 자체는 무관하다: 정규식은 **왼쪽부터** 맞으므로
  // 백틱이 먼저 나오면 백틱이 이긴다.)
  it("백틱 안의 별표는 강조가 아니다 — 명령을 망가뜨리지 않는다", () => {
    render(
      <p>
        <StepText text={"`echo **hi**` 를 돌린다"} />
      </p>,
    );
    const code = screen.getByText("echo **hi**");
    expect(code.tagName).toBe("CODE");
    expect(code.querySelector("strong")).toBeNull();
  });

  /*
   * ⚠️ **처음 이 검사를 「그린 것 == 원문」으로 썼다가 틀렸다.** 표기를 지우는
   * 것이 이 부품의 일이므로 그 등식은 성립할 수가 없다. 지켜야 하는 성질은
   * 그것이 아니라 **표기 말고는 아무것도 잃거나 더하지 않는다**이다 — 글자가
   * 먹히거나 순서가 바뀌면 「원문 그대로」가 거짓말이 된다.
   */
  const bare = (value: string) => value.replace(/[*`]/g, "");

  it.each([
    "평범한 한 줄",
    "**앞에서 시작** 하고 `가운데` 도 있고 **끝도 강조**",
    "짝이 안 맞는 * 별표 하나와 ** 둘",
    "닫히지 않은 `백틱 하나",
    "빈 강조 **** 와 빈 코드 ``",
    "여러 개 **하나** 사이 **둘** 사이 `셋`",
    "줄바꿈이\n들어간 글",
    "`a` `b` `c` 연달아",
  ])("표기 말고는 한 글자도 안 잃는다: %s", (text) => {
    expect(bare(drawn(text))).toBe(bare(text));
  });

  it.each([
    "평범한 한 줄",
    "짝이 안 맞는 * 별표 하나와 ** 둘",
    "닫히지 않은 `백틱 하나",
    "빈 강조 **** 와 빈 코드 ``",
  ])("짝이 없으면 표기까지 그대로 남긴다 — 함부로 지우지 않는다: %s", (text) => {
    expect(drawn(text)).toBe(text);
  });
});

// 실측에서 마지막까지 새던 자리 — 굵게가 코드를 **감싸는** 모양.
describe("굵게 안의 파일 이름", () => {
  it("굵게가 코드를 감싸도 백틱이 글자로 남지 않는다", () => {
    render(
      <p>
        <StepText text={"**`headless: false` — 창을 띄워 놓고 잰다.**"} />
      </p>,
    );
    const code = screen.getByText("headless: false");
    expect(code.tagName).toBe("CODE");
    expect(code.closest("strong")).not.toBeNull();
    expect(document.body.textContent).not.toContain("`");
  });
});
