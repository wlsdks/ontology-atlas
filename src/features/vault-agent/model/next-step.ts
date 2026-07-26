/**
 * **다음 한 걸음** — 한 건 고치고 대화가 멎지 않게 하는 한 줄.
 *
 * ## 왜 추가 호출이 없는가
 *
 * 지금은 제안 하나를 적용하면 거기서 끝난다 — "만들어 나가는" 감각이 사라지는
 * 지점이 정확히 여기다. 그래서 다음 후보를 **모델이 이미 말하고 있는 그 턴의
 * 응답 안에서** 받는다: 시스템 프롬프트가 "쓰기를 제안했으면 마지막 줄에
 * `NEXT:` 로 다음 빈 곳 하나를 적으라" 고 요구하고, 여기서 그 줄만 떼어낸다.
 * 다음 걸음을 얻으려고 모델을 한 번 더 부르면 그건 사용자가 누르지 않은
 * 전송이고, 남의 돈(BYOK 요금)을 한 번 더 쓰는 일이다.
 *
 * ## 다음 걸음은 **말**이지 pending 카드가 아니다
 *
 * 이 줄에서 파생되는 것은 칩 하나뿐이고, 칩은 프리필이다. 살아 있는 제안이
 * 둘이 되는 순간 "뭘 승인했는지" 가 흐려지므로, 다음 걸음이 카드를 만드는
 * 구현은 계약 위반이다.
 */

/** 모델이 다음 걸음을 표시하는 표지. 화면에 그대로 보이지 않는다. */
export const NEXT_STEP_MARKER = 'NEXT:';

/** 칩 한 줄에 앉힐 수 있는 길이. 넘치면 잘라 낸다 — 칩은 문단이 아니다. */
export const NEXT_STEP_MAX_CHARS = 140;

export interface NextStepSplit {
  /** 화면에 그려질 본문. `NEXT:` 줄은 빠져 있다. */
  body: string;
  /** 칩이 될 한 문장. 없으면 null. */
  nextStep: string | null;
}

/**
 * 응답 본문에서 마지막 `NEXT:` 줄을 떼어낸다.
 *
 * 왜 마지막 줄만인가: 본문 가운데의 `NEXT:` 는 모델이 인용하거나 설명하는
 * 경우가 있고, 그것까지 칩으로 만들면 사용자가 시키지 않은 말이 컨트롤이
 * 된다. 표지는 줄 맨 앞에 있을 때만 표지다.
 */
export function splitNextStep(text: string): NextStepSplit {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (!line.startsWith(NEXT_STEP_MARKER)) break;
    const sentence = normalizeNextStep(line.slice(NEXT_STEP_MARKER.length));
    const body = lines.slice(0, index).join('\n').trim();
    return { body, nextStep: sentence || null };
  }
  return { body: text, nextStep: null };
}

/**
 * 칩에 앉을 문장으로 다듬는다. `[[slug]]` 표기는 사람이 입력칸에서 읽고 고칠
 * 글이 아니므로 이름만 남긴다 — 인용 칩은 대화 본문의 문법이지 입력칸의
 * 문법이 아니다.
 */
function normalizeNextStep(raw: string): string {
  const plain = raw
    .replace(/\[\[([^[\]]+)\]\]/g, (_match, slug: string) => tailOf(slug.trim()))
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > NEXT_STEP_MAX_CHARS
    ? `${plain.slice(0, NEXT_STEP_MAX_CHARS - 1).trimEnd()}…`
    : plain;
}

function tailOf(slug: string): string {
  const index = slug.lastIndexOf('/');
  return index >= 0 ? slug.slice(index + 1) : slug;
}
