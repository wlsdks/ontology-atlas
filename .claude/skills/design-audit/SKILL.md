---
name: design-audit
description: Audit a finished front-end change against the design system by measuring the rendered DOM, not by looking at it. Run after implementing any UI before calling it done — it catches overlapping elements, ragged dimensions in repeated sets, off-ramp font sizes and hardcoded colours, unreachable controls, and scroll-end gaps. A few pixels of misalignment is not something anyone reliably localises by looking, so this skill measures rects and computed styles first and uses screenshots only as evidence a human can check.
---

# /design-audit — 만든 다음, 재서 확인한다

구현이 끝난 화면을 **눈으로 보고** 판정하지 않는다. 재고 나서 본다.

## 왜 이 순서인가 (이게 이 스킬의 전부다)

사람도 모델도 **간격 · 정렬 · 겹침을 눈으로는 잘 못 잡는다.** 몇 px 어긋난
정렬은 스크린샷에서 "좀 이상한데" 이상으로 특정되지 않고, 특정되지 않으면 고칠
수 없다. 반대로 스크린샷을 보고 없는 결함을 지어내면 멀쩡한 코드를 건드리게 된다.
둘 다 **수치가 없어서** 생기는 실패다.

이 저장소의 전례가 그 근거다 — 반응형 결함 3건은 전부 **rect 를 재서만**
발견됐고, 클래스 문자열은 정상인데 픽셀만 틀린 경우도 있었다.

그래서 순서가 고정이다: **① 잰다 → ② 위반 목록을 만든다 → ③ 스크린샷은 사람이
확인할 증거로 첨부한다.** 모델에게 "어때 보이냐"고 묻는 것은 ③ 다음의 보조
신호이지 판정 근거가 아니다.

## 언제 돌리나

**UI 를 만들고 나서, 완료라고 말하기 전에.** 호출자가 따로 요청하지 않아도
프론트엔드 변경의 마지막 단계로 실행한다 — 요청이 없었다는 것은 생략 사유가
아니다. 예외: 문자열만 바꾼 오타 수정, 순수 로직 변경.

## 0. 결정적 상태 만들기 (안 하면 전부 노이즈다)

```
고정 뷰포트 · 시드/고정 데이터 · 폰트 로드 완료 대기 ·
구체적 준비 신호 대기(맹목적 networkidle 금지) · 커서 호버 없음 ·
정적 촬영이면 prefers-reduced-motion: reduce
```

`networkidle` 을 기본값으로 쓰지 않는다 — hydration 이 무거운 화면에서는 준비되기
전에 찍힌다. 특정 요소의 존재를 기다려라.

## 1. 겹침 — rect 교집합

같은 스태킹 문맥에서 독립이라고 믿는 요소들의 rect 를 전수로 잡아 **쌍별 교집합
넓이**를 구한다. 0 이 아니면 결함이다. 폭 하나에서만 겹치는 경우가 흔하므로
`/responsive-sweep` 의 밴드마다 반복한다.

```js
const rects = [...document.querySelectorAll(SEL)].map(el => [el, el.getBoundingClientRect()]);
const hits = [];
for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
  const [a, ra] = rects[i], [b, rb] = rects[j];
  const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
  const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  if (w > 0.5 && h > 0.5) hits.push({ a: a.dataset.testid ?? a.className, b: b.dataset.testid ?? b.className, w, h });
}
```

**도달 가능성은 별개 검사다.** 겹치지 않아도 sticky/fixed 가 위를 덮으면 못 누른다 —
모든 인터랙티브 요소의 중심점에 `document.elementFromPoint(cx, cy)` 를 쏴서 자기
자신(또는 자손)이 돌아오는지 확인한다.

## 2. 삐뚤빼뚤 — 반복 세트의 치수 편차

헌장의 **치수 규칙성**을 재는 것이다: 반복 카드/행 세트에서 높이가 글자 수로
정해지면 격자가 무너진다.

- 같은 세트 요소들의 `height` 표준편차 → 0 이 아니면 지목한다(의도된 예외는
  작성자가 밝혀야 한다).
- 정렬: 같은 열 요소들의 `left` (또는 `right`) 값이 서로 다르면 결함. baseline 은
  텍스트 노드의 `top + fontSize*ascent` 근사보다 **`getClientRects()` 의 첫 줄
  top** 으로 비교하는 편이 안정적이다.
- 간격 리듬: 형제 간 세로 gap 목록을 뽑아 **고유값 개수**를 센다. 반복 세트에서
  gap 이 3종 이상이면 누군가 손으로 고른 것이다.

## 3. 디자인 시스템 이탈 — computed style 대 토큰

정적 lint 는 리터럴만 본다. **존재하지 않는 램프 스텝은 리터럴을 남기지 않으므로**
(Tailwind 가 클래스를 아예 안 만들고 루트 16px 로 렌더된다) 이 검사는 lint 로
못 잡는 층을 맡는다.

- **폰트 크기**: 화면의 모든 텍스트 노드 `fontSize` 집합을 뽑아 램프 값
  (9.5/11/12.5/14/16/23/30px)과 대조. **램프 밖 값 = 결함.** 16px 자체는 `--text-title` 이라 정상이다 — 의심할 것은
  `text-*` 스텝을 **요청했는데** 16px 로 렌더된 요소다(미정의 스텝이 클래스를 못
  만들어 루트로 떨어진 경우). 클래스 목록과 함께 본다.
- **행간**: `lineHeight` 를 `--leading-*` 램프와 대조.
- **색**: `color` · `backgroundColor` · `borderColor` 를 토큰 계산값 집합과 대조.
  토큰 밖 값이 있으면 하드코딩이다.
- **radius · shadow**: 램프/사다리 밖 값 지목.

```js
const seen = new Set();
document.querySelectorAll('*').forEach(el => {
  const cs = getComputedStyle(el);
  if (el.textContent?.trim()) seen.add(`font ${cs.fontSize} / ${cs.lineHeight}`);
});
[...seen].sort();   // 램프와 대조
```

## 4. 스크롤 끝 · 예약고

컨테이너를 끝까지 스크롤한 뒤 마지막 콘텐츠의 `bottom` 과 하단 바의 `top` 을
비교한다. 콘텐츠가 바 아래로 들어가면 결함. `<lg` 에서는
`--topology-mobile-bottom-tab-reserve` + `env(safe-area-inset-bottom)` 이 **함께**
쌓여야 한다.

## 5. 증거 — 스크린샷은 여기서 찍는다

측정이 끝난 뒤 1512×900 과 390 을 찍어 **첨부**한다. 스크린샷의 역할은 사람이
숫자를 대조할 대상을 주는 것이지 판정하는 것이 아니다. DPR 을 명시한다 —
Retina 캡처는 CSS 픽셀의 2배라 크롭 좌표가 어긋난다.

**모델에게 보여주고 의견을 물어도 된다** — 시각 비평은 실제로 도움이 된다. 단
그 의견은 **①~④ 의 수치로 교차 확인한 뒤에만 결함으로 승격한다.** 수치로 특정되지
않는 지적은 처방이 될 수 없고, 확인 없이 코드를 고치면 멀쩡한 것을 건드린다.

## 6. 보고 형식

```md
## 디자인 감사 — <화면/변경>

**상태 고정**: [뷰포트 · 데이터 · 대기 신호 · DPR]

| 검사 | 결과 |
|---|---|
| 겹침 (rect 교집합) | N건 — [요소 쌍 · 넓이] |
| 도달 가능성 (elementFromPoint) | N건 — [가려진 컨트롤] |
| 치수 편차 (반복 세트) | 높이 σ=N · 정렬 이탈 N · gap 고유값 N |
| 램프 이탈 (font/leading) | [값 목록 — `text-*` 요청 대비 16px 렌더 있으면 미정의 스텝] |
| 토큰 이탈 (color/radius/shadow) | [하드코딩 값] |
| 스크롤 끝 여백 | [실측 px · 예약 토큰] |

**증거**: [스크린샷 경로 — 1512×900 · 390]

**결함** (수치로 확인된 것만): [목록 + 처방]
**모델 소견 중 교차 확인 실패로 기각한 것**: [있으면 — 환각 기록]
```

## 이 스킬이 하지 않는 것

- **모션 판정.** 정지 화면으로는 원리적으로 불가능하다 → `/motion-verify`.
- **브레이크포인트 전수 스윕.** → `/responsive-sweep`.
- **위계 판정.** "무엇이 이겨야 하는가"는 측정이 아니라 판단이다 →
  `/design-council` 의 「위계」.

셋 다 필요한 변경이면 이 스킬은 그중 하나가 아니라 **마지막 관문**이다.
