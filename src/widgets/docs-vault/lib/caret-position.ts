/**
 * textarea 안 **캐럿의 화면 좌표** — 멘션 메뉴가 「적던 자리」에 뜨게 하는 값.
 *
 * ## 왜 필요한가 (2026-08-08, 소유자 지적)
 *
 * `@` 멘션 메뉴가 편집기 **왼쪽 아래 구석**에 떴다. 종전 위키링크 팝오버가
 * 거기 고정돼 있었고 그 자리를 그대로 물려받았기 때문이다. 소유자가 바로
 * 잡았다 — *"적던 위치에 바로 나와야"*. 맞는 지적이고, 이유가 있다: 멘션
 * 메뉴는 **지금 치고 있는 글자의 연장**이라, 눈이 있는 곳에서 멀어지면
 * 「내가 방금 한 행동의 결과」로 안 읽힌다.
 *
 * ## 어떻게 재나 — 미러 방식
 *
 * `textarea` 는 캐럿 좌표를 알려 주는 API 가 없다. 그래서 **같은 글꼴·같은
 * 폭·같은 여백**을 가진 보이지 않는 `div` 를 만들어 캐럿 앞까지의 글자를 넣고,
 * 그 끝에 표식 `span` 을 두어 그 위치를 읽는다. 브라우저가 줄바꿈을 우리 대신
 * 계산해 주므로 우리가 줄바꿈 규칙을 흉내 낼 필요가 없다 — 흉내 내면 한글
 * 줄바꿈·탭·긴 단어에서 반드시 어긋난다.
 *
 * 복사해야 하는 속성이 많은 이유도 그것이다. 하나라도 빠지면 미러의 줄바꿈이
 * 원본과 달라지고, 그러면 좌표가 **조금 틀린 게 아니라 다른 줄**을 가리킨다.
 */

/** 미러가 원본과 같은 모양을 갖기 위해 반드시 복사해야 하는 속성. */
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'tabSize',
] as const;

export interface CaretPoint {
  /** textarea 의 패딩 박스 기준 — 스크롤을 이미 뺀 값. */
  top: number;
  left: number;
  /** 캐럿이 선 줄의 높이. 메뉴를 그 줄 **아래**에 놓을 때 쓴다. */
  lineHeight: number;
}

export function caretPoint(textarea: HTMLTextAreaElement, index: number): CaretPoint {
  const doc = textarea.ownerDocument;
  const style = doc.defaultView?.getComputedStyle(textarea);
  const lineHeight = style ? parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 : 20;
  if (!style) return { top: 0, left: 0, lineHeight };

  const mirror = doc.createElement('div');
  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = style[property];
  }
  // 화면에 나오지 않게 두되 **레이아웃은 실제로 계산되게** 둔다.
  // `display:none` 이면 폭이 0 이라 줄바꿈이 전혀 달라진다.
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';
  // textarea 는 항상 줄바꿈을 유지한다 — computed 값이 `pre-wrap` 이 아니어도.
  mirror.style.whiteSpace = 'pre-wrap';

  mirror.textContent = textarea.value.slice(0, index);
  const marker = doc.createElement('span');
  // 빈 span 은 높이가 0 이라 위치를 못 읽는다 — 폭 0 문자를 하나 둔다.
  marker.textContent = '​';
  mirror.appendChild(marker);

  // 원본 바로 옆에 붙여 폰트 상속·확대 배율까지 같은 조건으로 만든다.
  const host = textarea.parentElement ?? doc.body;
  host.appendChild(mirror);
  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;
  host.removeChild(mirror);

  return {
    top: markerTop - textarea.scrollTop,
    left: markerLeft - textarea.scrollLeft,
    lineHeight,
  };
}

/**
 * 메뉴가 **편집기 밖으로 나가지 않게** 캐럿 좌표를 자리로 옮긴다.
 *
 * 캐럿이 오른쪽 끝이나 아래쪽 끝에 있으면 메뉴가 그대로는 잘린다. 그때는
 * 붙이는 방향을 뒤집는다 — 잘린 메뉴는 없는 것과 같고, 화면 밖으로 밀린 채
 * 스크롤을 만들면 편집 중인 글이 흔들린다.
 */
export function clampMenuToBox({
  caret,
  box,
  menu,
  gap = 6,
}: {
  caret: CaretPoint;
  box: { width: number; height: number };
  menu: { width: number; height: number };
  gap?: number;
}): { top: number; left: number } {
  const belowTop = caret.top + caret.lineHeight + gap;
  // 아래로 못 펴면 캐럿 위로 뒤집는다.
  const top =
    belowTop + menu.height <= box.height ? belowTop : Math.max(gap, caret.top - menu.height - gap);
  const left = Math.max(gap, Math.min(caret.left, box.width - menu.width - gap));
  return { top, left };
}
