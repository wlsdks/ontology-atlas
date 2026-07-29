/**
 * 한국어 조사 — **알 수 있을 때 고르고, 모를 때만 병기한다.**
 *
 * ## 왜 만들었나 (2026-07-29 도그푸딩)
 *
 * 실습을 끝내면 화면이 이렇게 말했다: **「결제 취소」 을(를) 만들었습니다.**
 * 「취소」는 받침이 없으니 답은 「를」 하나뿐인데, 문구가 답을 알면서도
 * 사용자에게 괄호를 내밀고 있었다. 병기는 **모를 때의 안전장치**이지 기본값이
 * 아니다 — 이름을 아는 순간 정할 수 있다.
 *
 * 이 저장소의 결이 그렇다: 화면이 아는 것을 사용자에게 되묻지 않는다.
 *
 * ## 언제 병기로 남기나
 *
 * 마지막 글자가 **한글 음절도 숫자도 아닐 때**만이다. 라틴 문자(`order-create`)
 * 로 끝나는 이름의 받침은 읽는 방법이 정해져 있지 않다 — "create" 를
 * 「크리에이트」로 읽으면 받침이 있고 「크리에잇」이면 없다. 여기서 하나를
 * 고르면 절반은 틀린다. **모르면 병기하는 것이 정직**이고, 이 함수의 fallback
 * 이 정확히 그 값을 돌려준다.
 */

/** 앞말의 받침 유무로 갈리는 조사 쌍 — `있음/없음` 순. */
const PAIRS = {
  object: ["을", "를"],
  subject: ["이", "가"],
  topic: ["은", "는"],
  with: ["과", "와"],
  /** 「으로/로」 — ㄹ 받침은 예외적으로 받침 없는 쪽을 쓴다. */
  direction: ["으로", "로"],
} as const;

export type JosaKind = keyof typeof PAIRS;

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 종성 인덱스 8 = ㄹ. 「으로/로」만 이 값을 받침 없음처럼 다룬다. */
const JONG_RIEUL = 8;

/**
 * 숫자로 끝나는 이름의 받침은 **읽는 소리**가 정한다 —
 * 0(영) 1(일) 3(삼) 6(육) 7(칠) 8(팔) 은 받침이 있고 2·4·5·9 는 없다.
 */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  "0": true,
  "1": true,
  "2": false,
  "3": true,
  "4": false,
  "5": false,
  "6": true,
  "7": true,
  "8": true,
  "9": false,
};

interface Batchim {
  /** 받침이 있는가. 판별 불가면 `null`. */
  has: boolean | null;
  /** 종성이 ㄹ 인가 (「으로/로」 전용). */
  rieul: boolean;
}

function readBatchim(word: string): Batchim {
  const trimmed = word.trim();
  if (trimmed === "") return { has: null, rieul: false };
  const last = trimmed[trimmed.length - 1]!;
  const code = last.codePointAt(0)!;
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const jong = (code - HANGUL_FIRST) % 28;
    return { has: jong !== 0, rieul: jong === JONG_RIEUL };
  }
  const digit = DIGIT_HAS_BATCHIM[last];
  if (digit !== undefined) return { has: digit, rieul: last === "1" };
  return { has: null, rieul: false };
}

/**
 * `word` 뒤에 붙일 조사를 고른다. 판별 불가면 「을(를)」 꼴로 병기한다.
 *
 * 이 함수는 조사 **하나만** 돌려준다 — 이름과 붙여 쓰는 일은 호출부(i18n
 * 메시지의 `{name}{josa}`)가 한다. 그래야 다른 언어의 메시지가 이 값을 아예
 * 안 쓰고 지나갈 수 있다.
 */
export function josa(word: string, kind: JosaKind): string {
  const [withBatchim, withoutBatchim] = PAIRS[kind];
  const { has, rieul } = readBatchim(word);
  if (has === null) return `${withBatchim}(${withoutBatchim})`;
  if (kind === "direction" && rieul) return withoutBatchim;
  return has ? withBatchim : withoutBatchim;
}
