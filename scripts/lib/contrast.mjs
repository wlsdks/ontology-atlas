/**
 * 대비 계산 — **순수 함수**. DOM 도 브라우저도 모른다.
 *
 * ## 왜 이 파일이 필요한가
 *
 * `/design-council` 은 「도해」석에게 *"design-infoviz must measure contrast"* 라고
 * 명령하고, 그 자리의 브리프도 *"대비를 실측한다 — 인접 세그먼트의 합성 대비를
 * 재고 3:1 미만이면 색-무관 구분자가 있어야 한다"* 를 판정 전 필수로 건다.
 * **그런데 잴 도구가 없었다.** 2026-08-03 기준 이 저장소의 어떤 스크립트도 대비를
 * 계산하지 않았고, `/design-audit` 은 색을 **토큰 집합과 대조**할 뿐 비율을 내지
 * 않았다 — 토큰을 썼는지와 읽히는지는 다른 질문이다.
 *
 * 명령만 있고 계기가 없으면 그 자리는 눈으로 재고 「괜찮아 보인다」를 실측이라
 * 부르게 된다. 실제로 2026-07-26 에 그 비용을 냈다: 앰버/유칼립투스 쌍이 트랙 위
 * 합성 대비 **1.14:1** 이라 휘도로는 전혀 안 갈리고 hue 로만 갈렸는데, 그 hue 축이
 * 적록 색약(남성 약 8%)이 가장 못 가르는 축이었다. 색이 정체를 나른다는 전제
 * 자체가 틀렸고, 그걸 밝힌 것은 눈이 아니라 숫자였다.
 *
 * ## 근거
 *
 * WCAG 2.2 상대 휘도와 대비 비율 정의(§ Relative luminance · Contrast ratio),
 * 판정 문턱은 1.4.3 Contrast (Minimum) — 본문 4.5:1, 큰 글자(18.66px+bold 또는
 * 24px+) 3:1 — 과 1.4.11 Non-text Contrast 3:1.
 *
 * ⚠️ **알파를 합성하지 않으면 이 계산은 거짓말을 한다.** 이 앱은 텍스트와 보더를
 * 알파 토큰(`--color-overlay-*` · `--color-border-soft`)으로 쓴다. 합성 전 색으로
 * 재면 실제보다 좋게 나온다 — 그래서 여기 합성이 들어 있다.
 */

/** `rgb(r, g, b)` · `rgba(r, g, b, a)` · `#rgb` · `#rrggbb` → `[r, g, b, a]`. */
export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    const h = hex[1];
    const wide = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const n = (i) => parseInt(wide.slice(i * 2, i * 2 + 2), 16);
    return [n(0), n(1), n(2), wide.length >= 8 ? n(3) / 255 : 1];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return [parts[0], parts[1], parts[2], parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1];
  }
  return null;
}

/**
 * 반투명 전경을 불투명 배경 위에 **합성**한다 — source-over.
 *
 * 이 앱의 텍스트·보더는 알파 토큰이다. 합성 없이 재면 실제보다 좋은 수치가 나오고,
 * 그 낙관은 조용하다(숫자가 나오니까).
 */
export function composite(fg, bg) {
  const a = fg[3];
  if (a >= 1) return [fg[0], fg[1], fg[2], 1];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
}

/** WCAG 2.2 상대 휘도. */
export function relativeLuminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * 대비 비율. 두 색 모두 **불투명이어야 한다** — 반투명이면 `composite` 를 먼저.
 * 흰↔검은 21:1, 같은 색끼리는 1:1.
 */
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG 1.4.3 의 「큰 글자」 정의 — 18.66px 이상 bold, 또는 24px 이상.
 * (문서상 14pt bold / 18pt 이고 CSS px 환산이 이 값이다.)
 */
export function isLargeText(fontSizePx, fontWeight) {
  const weight = Number(fontWeight) || (fontWeight === "bold" ? 700 : 400);
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700);
}

/**
 * 한 텍스트에 대한 판정.
 *
 * @param {{ fg: string, bg: string, fontSizePx: number, fontWeight: string|number }} input
 *   `fg`/`bg` 는 computed style 문자열. `bg` 는 **이미 불투명하게 해결된** 배경
 *   (조상까지 거슬러 합성한 것) 이어야 한다.
 */
export function judgeText({ fg, bg, fontSizePx, fontWeight }) {
  const bgc = parseColor(bg);
  const fgc = parseColor(fg);
  if (!bgc || !fgc) return null;
  const solidBg = bgc[3] >= 1 ? bgc : composite(bgc, [0, 0, 0, 1]);
  const ratio = contrastRatio(composite(fgc, solidBg), solidBg);
  const large = isLargeText(fontSizePx, fontWeight);
  const required = large ? 3 : 4.5;
  return { ratio: +ratio.toFixed(2), required, large, passes: ratio >= required };
}

/**
 * 인접한 두 데이터 마크가 **휘도로** 갈리는가 (WCAG 1.4.11 비텍스트 3:1).
 *
 * 이 저장소가 이 함수를 특별히 필요로 하는 이유: 2026-07-26 에 인접 세그먼트가
 * hue 로만 갈리고 휘도로는 1.14:1 이던 사고가 있었다. **hue 는 8% 의 사용자에게
 * 채널이 아니다** — 그래서 「구분된다」의 판정은 hue 가 아니라 이 비율이다.
 * 3:1 미만이면 색-무관 구분자(심 · 라벨 · 패턴 · 순서)가 반드시 있어야 한다.
 */
export function judgeAdjacentMarks({ a, b, over }) {
  const base = parseColor(over) ?? [0, 0, 0, 1];
  const solidBase = base[3] >= 1 ? base : composite(base, [0, 0, 0, 1]);
  const ma = parseColor(a);
  const mb = parseColor(b);
  /**
   * **못 읽은 색은 «통과» 가 아니라 «미측정» 이다** — `judgeText` 와 같은 계약
   * (2026-08-07 코드 리뷰).
   *
   * 종전에는 이 게이트가 없어서 `parseColor` 가 `null` 을 내면 바로 아래
   * `composite` 가 `fg[3]` 을 읽다 **TypeError 를 던졌다.** 형제 함수는 같은
   * 자리에서 `null` 을 돌려주는데 이쪽만 죽는다. `parseColor` 는 `#hex` 와
   * `rgb()/rgba()` 만 읽으므로, 크로미움이 `color(srgb …)` 나 `oklch(…)` 로
   * 직렬화하는 값(색 공간이 넓은 화면·`color-mix()`)이 그 입력이 된다.
   *
   * 이 함수가 수동 계기 안에만 있을 때는 사람이 보고 있었지만, 2026-08-06 에
   * CI 래칫으로 들어가면서 **게이트가 크래시하는 경로**가 됐다. 부르는 쪽은
   * 이미 `if (!judged) continue` 로 미측정을 세고 있었는데 그 줄이 죽어 있었다.
   */
  if (!ma || !mb) return null;
  const ca = composite(ma, solidBase);
  const cb = composite(mb, solidBase);
  const ratio = contrastRatio(ca, cb);
  return {
    ratio: +ratio.toFixed(2),
    passes: ratio >= 3,
    /** 3:1 미만이면 «색-무관 구분자가 있는가» 를 사람이 확인해야 한다는 신호. */
    needsNonColorChannel: ratio < 3,
  };
}
