/**
 * 붙어 있는 데이터 마크의 **화면 쪽 채집기** — 판정은 `contrast.mjs` 가 한다.
 *
 * ## 왜 별도 파일인가 (2026-08-06)
 *
 * 이 채집기는 `measure-contrast.mjs`(사람이 부르는 계기) 안에 살았고, 그래서
 * **CI 게이트는 인접 마크를 한 번도 재지 않았다** — `contrast-ratchet` 은
 * `judgeText` 만 불렀다. 계기에만 있는 검사는 사람이 기억할 때만 도는
 * 검사이고, 이 저장소가 1.14:1 을 놓친 방식이 정확히 그것이다.
 *
 * 그래서 채집기를 여기로 내려 **계기와 게이트가 같은 함수를 쓴다.** 같은
 * 판정 로직을 두 곳에 복사하면 그 순간부터 어긋나기 시작한다(Carbon).
 *
 * ⚠️ 이 함수는 **브라우저 안에서 실행된다**(`page.evaluate`). 그래서 바깥
 * 스코프의 어떤 것도 참조하지 않는다 — 참조하면 직렬화되어 넘어갈 때 죽는다.
 */
export function collectAdjacentMarks() {
  const out = [];
  for (const parent of document.querySelectorAll("body *")) {
    const kids = [...parent.children].filter((k) => {
      const r = k.getBoundingClientRect();
      const c = getComputedStyle(k);
      if (r.width < 2 || r.height < 2 || r.height > 40) return false;
      if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) return false;
      if (c.backgroundColor === "rgba(0, 0, 0, 0)") return false;
      return !(k.textContent || "").trim();
    });
    if (kids.length < 2) continue;
    const track = getComputedStyle(parent).backgroundColor;
    const segs = kids
      .map((k) => ({ el: k, r: k.getBoundingClientRect(), bg: getComputedStyle(k).backgroundColor }))
      .sort((x, y) => x.r.left - y.r.left);
    for (let i = 1; i < segs.length; i++) {
      if (segs[i - 1].bg === segs[i].bg) continue;
      /**
       * ⚠️ **틈이 있으면 인접이 아니다.**
       *
       * `design.md`: *"두 계열의 경계는 색이 아니라 **1px 틈**(트랙 색이 드러나는
       * 간격)이 가른다"* — 그 틈이 바로 WCAG 1.4.11 이 요구하는 색-무관
       * 구분자다. 처음 이 수집기를 붙였을 때 인접 판정을 «틈 2px 이하» 로
       * 잡았더니, 도메인 용량 막대의 `gap-px`(정확히 1px)를 삼켜서 **헌장을
       * 지키고 있는 16쌍을 전부 미달로 신고했다**(2026-08-04 실측). 계기가
       * 처방과 반대로 말하면 멀쩡한 화면을 고치게 된다.
       *
       * 그래서 «맞닿은 것»만 인접으로 센다. 틈이 있는 쌍은 버리지 않고
       * `separated` 로 세어 둔다 — 조용히 빠지면 «잰 것»과 «안 잰 것»이 다시
       * 같은 초록이 된다.
       */
      const gap = segs[i].r.left - segs[i - 1].r.right;
      if (gap >= 0.5) {
        out.push({ separated: true, gapPx: +gap.toFixed(2) });
        continue;
      }
      out.push({
        a: segs[i - 1].bg,
        b: segs[i].bg,
        over: track === "rgba(0, 0, 0, 0)" ? "rgb(15,16,17)" : track,
        selector:
          parent.tagName.toLowerCase() +
          (typeof parent.className === "string"
            ? `.${parent.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : ""),
      });
    }
  }
  return out;
}
