"use client";

/**
 * 단계 글의 **강조와 파일 이름을 그린다** — 원문은 그대로 두고 그리기만 바꾼다.
 *
 * ## 왜 필요했나 — 실측
 *
 * 실제 스킬 18개의 단계 카드 72장을 세어 보니 **29장(40%)이 `**` 와 백틱을
 * 글자 그대로** 보여 주고 있었다:
 *
 *     3  일부러 틀리게 만들어 놓고 실패하는지 본다 — **이 스킬에서 가장 중요한 단계**
 *     1  `app/globals.css` 에서 그 역할을 하는 토큰을 찾는다
 *
 * 쓴 사람은 「가장 중요한 단계」를 굵게 하려 한 것이고 읽는 사람에게 도착한 것은
 * 별표 넷이다. 마크다운 문법이 화면에 새는 것은 「영어 enum 이 그대로 뜨는 것」과
 * 같은 종류의 결함이다 — 안쪽 표기가 바깥으로 나온 것.
 *
 * ## 무엇을 안 건드리나
 *
 * **데이터는 한 바이트도 안 바뀐다.** `exactText` 는 지문(digest)으로 대조되고
 * 절차 묶음 복사가 그대로 직렬화하는 값이라, 여기서 손대면 「원문 그대로」라는
 * 이 화면의 약속이 깨진다. 그래서 이 부품은 **그리는 층에만** 산다 — 같은
 * 문자열을 조각으로 나눠 span 을 입힐 뿐이고, 붙이면 원문이 그대로 나온다.
 *
 * ## 어디까지만 아나
 *
 * 마크다운 렌더러가 아니다. 단계 한 줄에 실제로 나타나는 둘만 안다 —
 * **굵게**(`**…**`)와 `파일 이름`(백틱). 링크·목록·표는 일부러 모른다: 절차
 * 한 줄에 그것들이 오면 그건 단계가 아니라 문서이고, 그 판정은 파서의 일이다.
 */

/** 백틱 조각과 `**…**` 조각을 **한 번에** 가른다 — 백틱 안의 별표는 강조가 아니다. */
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;

export function StepText({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, index) => {
        const key = `${index}:${part}`;
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={key}
              className="rounded-micro bg-[color:var(--color-overlay-2)] px-1 py-0.5 font-mono text-[color:var(--color-text-secondary)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          /*
           * **굵게 안의 파일 이름도 그린다.** 실측에서 남은 새는 자리가 전부
           * 이 모양이었다 — `**\`headless: false\` — 창을 띄워 놓고 잰다.**`
           * 처럼 굵게가 코드를 **감싸고** 있으면, 굵게가 왼쪽에서 먼저 맞아
           * 백틱을 통째로 삼키고 그 백틱이 글자로 남는다.
           *
           * 한 겹만 더 들어간다. 굵게 안쪽에는 `*` 가 있을 수 없으므로(위 패턴이
           * 배제한다) 이 재귀는 두 겹에서 반드시 멈춘다.
           */
          return (
            <strong key={key} className="font-[var(--font-weight-emphasis)]">
              <StepText text={part.slice(2, -2)} />
            </strong>
          );
        }
        return <span key={key}>{part}</span>;
      })}
    </>
  );
}
