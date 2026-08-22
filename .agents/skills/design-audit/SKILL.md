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

## 0. 매번 똑같은 화면이 나오게 고정한다 (안 하면 잰 값이 전부 쓰레기다)

```
창 크기 고정 · 데이터 고정 · 폰트가 다 로드될 때까지 대기 ·
"이 요소가 뜨면 준비 끝"이라고 콕 집어 대기(그냥 networkidle 로 기다리지 말 것) ·
마우스를 아무 데도 올려 두지 않기 ·
움직이지 않는 화면을 찍을 거면 prefers-reduced-motion: reduce
```

`networkidle`(네트워크가 조용해질 때까지 기다리기)을 기본으로 쓰지 않는다 —
hydration 이 무거운 화면에서는 아직 준비가 안 됐는데 네트워크만 조용해져서 그
상태로 찍힌다. 특정 요소가 나타날 때까지 기다려라.

### 첫 방문 안내를 끈다 — `?guides=off` (2026-07-28)

지도와 여섯 목적지(문서함·스튜디오·분석·프로젝트·스킬·기록)는 **처음 방문하면 화면을
반투명 막과 안내 카드로 덮는다.** 재려는 것을 그대로 가려 버리므로, 이걸 안 끄면
감사 자체가 성립하지 않는다.

```
http://localhost:3000/ko/topology/?guides=off      ← 모든 첫 방문 안내를 "봤음" 으로
http://localhost:3000/ko/topology/?guides=reset    ← 되돌리기(안내 자체를 검수할 때)
```

**안내를 손으로 눌러 닫지 마라.** 닫는 동작 자체가 화면을 바꾸고 포커스를 옮긴다
— 모션을 재는 감사에서는 하필 그 프레임이 재려던 바로 그 프레임이다. 안내를
「봤음」으로 표시하는 키 목록은 `src/features/guided-tour/model/first-run-seen.ts`
한 곳에만 있고 `DESTINATION_TOURS` 에서 자동으로 만들어지므로, 안내가 늘어나면
목록도 같이 는다. Playwright 에서는 같은 목록을 쓰는 `seedFirstRunSeen(page)` 를
그대로 쓴다.

## 1. 겹침 — 두 요소의 사각형이 얼마나 포개지나

### ⚠️ 무엇을 잴지부터 정한다 — 잘못된 지적은 전부 여기서 나온다

**`getBoundingClientRect()` 로 크기가 나온다고 해서 그게 화면에 보인다는 뜻은
아니다.** 2026-08-03 실측: `/ko/docs` 에서 겹침 1건과 못 누르는 컨트롤 1건이
잡혔는데, 열어 보니 그 버튼은 **접혀 있는 `<details>` 안**에 있었다. 요소 자체는
`visibility: visible` · `opacity: 1` · `display: block` 이었고 사각형 크기도
121×21 로 멀쩡했다. 화면에는 없는데 검사는 전부 통과한 것이다.

재는 대상에서 **반드시** 빼야 하는 것:

```js
const painted = (el) => {
  const c = getComputedStyle(el), b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return false;
  if (c.visibility === 'hidden' || c.display === 'none' || Number(c.opacity) < 0.05) return false;
  // ★ 접힌 디스클로저 — 자식은 스타일도 rect 도 멀쩡한 채 화면에만 없다
  if (el.closest('details:not([open])')) return false;
  // ★ 조상이 클리핑하는데 내가 그 밖 — 스크롤 컨테이너의 화면 밖 내용
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cc = getComputedStyle(n), r = n.getBoundingClientRect();
    if (cc.overflow !== 'visible' && (b.bottom < r.top || b.top > r.bottom)) return false;
    if (cc.contentVisibility === 'hidden' || n.hasAttribute('inert')) return false;
  }
  // ★ 뷰포트 밖은 사용자가 못 본다
  return b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0;
};
```

**이 걸러내기를 안 하면 재는 도구가 멀쩡한 앱을 결함이라고 신고한다.** 그날 나온
지적 세 건이 전부 헛다리였다(램프 밖 34px 이라던 것은 정상 토큰인
`--text-hero-lg` 였고, 겹침과 못 누름은 둘 다 접힌 `<details>` 때문이었다).
그대로 보고했으면 멀쩡한 코드를 고쳤을 것이다. 이 저장소가 늘 하는 경고 그대로다:
**잴 대상을 잘못 고르면, 숫자가 나와도 틀린 숫자다.**

**미리 정해 둔 값 목록(램프 — 글자 크기 같은 값을 몇 단계로 고정해 둔 사다리)은
기억해서 쓰지 말고 `app/globals.css` 에서 읽어 온다:**

```js
// 하드코딩한 램프는 스텝이 추가되는 순간 낡고, 낡은 목록은 정상 값을 결함이라 부른다
const ramp = [...css.matchAll(/--text-([a-z0-9-]+):\s*([0-9.]+px)/g)];
```

### 그다음 교집합

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
  (9.5/11/12.5/14/16/23/30/34px)과 대조. **램프 밖 값 = 결함.** 16px 자체는 `--text-title` 이라 정상이다 — 의심할 것은
  `text-*` 스텝을 **요청했는데** 16px 로 렌더된 요소다(미정의 스텝이 클래스를 못
  만들어 루트로 떨어진 경우). 클래스 목록과 함께 본다.
- **행간**: `lineHeight` 를 `--leading-*` 램프와 대조.
- **색**: `color` · `backgroundColor` · `borderColor` 를 토큰 계산값 집합과 대조.
  토큰 밖 값이 있으면 하드코딩이다.
- **radius · shadow**: 램프 밖 값 지목.

```js
const seen = new Set();
document.querySelectorAll('*').forEach(el => {
  const cs = getComputedStyle(el);
  if (el.textContent?.trim()) seen.add(`font ${cs.fontSize} / ${cs.lineHeight}`);
});
[...seen].sort();   // 램프와 대조
```

### 3c. 대비 — 토큰을 썼는가와 읽히는가는 다른 질문이다 (2026-08-03)

위 3번은 색을 **토큰 집합과 대조**한다. 그건 「하드코딩인가」를 답하지 「읽히는가」를
답하지 않는다 — **정당한 토큰 두 개가 서로 안 갈릴 수 있다.** 그 구멍의 값을 이미
치렀다: 2026-07-26 에 인접 세그먼트가 트랙 위 합성 대비 **1.14:1** 이라 휘도로는
전혀 안 갈리고 hue 로만 갈렸는데, 그 hue 축이 적록 색약(남성 약 8%)이 가장 못
가르는 축이었다. 값 규칙은 전부 통과한 상태였다.

```bash
node scripts/serve-static-export.mjs --port=4173 &   # 먼저 pnpm build
node scripts/measure-contrast.mjs [baseUrl] [route...]
```

문턱은 WCAG 1.4.3 — 본문 **4.5:1**, 큰 글자(18.66px+bold 또는 24px+) **3:1** — 과
비텍스트 1.4.11 **3:1**. 계산은 `scripts/lib/contrast.mjs`(순수 함수, fixture
프로브 `tests/contract/contrast.contract.test.ts`)이고 하네스는 채집만 한다.

- **알파를 합성한다.** 이 앱의 텍스트·보더는 알파 토큰이라, 합성 전 색으로 재면
  수치가 실제보다 **좋게** 나오고 그 낙관은 조용하다(숫자는 나오니까).
- **「미측정」을 통과로 세지 않는다.** 파싱 못 한 색은 침묵이 아니라 `⚠️` 로 낸다.
- **인접 데이터 마크**는 `judgeAdjacentMarks` 로 따로 잰다. 3:1 미만이면 색-무관
  구분자(심 · 라벨 · 패턴 · 순서)가 **있어야** 한다 — hue 는 8% 에게 채널이 아니다.

**2026-08-03 전수 census (1512×900, 5개 표면)**: 조합 110 중 미달 **4**.
`/ko` 의 주 CTA 인디고 면 위 흰 글자 **4.42:1**(2건) · `/ko/projects` 의
`--color-text-quaternary` **4.31:1**(2건). 지도 · 문서함 · 공방은 0. 넷 다 헌장
색이 걸린 사안이라 **감사가 단독으로 고치지 않는다** — 처방은 `/design-council`
의 「체계」와 「도해」로 간다.

### 3b. 캔버스 노드 규격 — DOM 계측 밖 (2026-08-01)

토폴로지 지도의 노드는 **캔버스 2D**라 위 3번(`getComputedStyle`)이 안 닿는다.
kind→형태(hex/사각/원/via-pad)·반지름·`magnitudeScale`·각인 숫자를 건드린
변경이면 계측 도구가 다르다:

- **규격 정본**: `docs/DESIGN-SYSTEM.md` "노드 규격" 절.
- **게이트**: `node-shapes.test.ts` / `topology-v2-kind-glyph.test.tsx`
  (각 게이트웨이 자체 일관성) + `tests/contract/node-kind-shape-parity.contract.test.ts`
  (두 게이트웨이 간 일치) — 셋 다 통과가 "재서 확인"의 캔버스 버전이다.
- **화면 좌표 실측**: `?e2e=1` 이 붙은 페이지의 `window.__atlasMap.nodes()` —
  `getComputedStyle` 대신 이 창구가 좌표·`draggable`·kind 를 typed 로 낸다.

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
| 대비 (WCAG 1.4.3/1.4.11) | 조합 N · 미달 N — [비율 · 전경/배경 · 선택자] · 미측정 N |
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
