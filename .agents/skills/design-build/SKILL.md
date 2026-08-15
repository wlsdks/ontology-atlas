---
name: design-build
description: Build a screen from this repo's design system deterministically — which primitive to reach for, which ramp owns each value, how a surface appears and leaves, and which instrument proves it afterwards. Use whenever you are about to write UI: a new screen, a new panel or dialog, a new control, or a visual change to an existing one. It exists because the gap between "make me a screen" and a screen that matches the system was never the model's taste — it was missing assets and an unwritten order of operations. Skip only for copy-only edits and pure build plumbing.
---

# /design-build — 명령에서 화면까지, 같은 순서로

## 이게 왜 필요한가

먼저 이 문서에 계속 나오는 말 셋:

- **프리미티브** — 버튼·칩처럼 이미 만들어 둔 공용 UI 부품. 새로 만들지 말고
  이걸 가져다 쓰라는 뜻이다.
- **램프(ramp)** — 글자 크기·간격·반경 같은 값을 미리 몇 단계로 정해 둔 사다리.
  「램프 밖 값」은 그 사다리에 없는 값을 손으로 쓴 것을 말한다.
- **하드컷** — 화면이 애니메이션 없이 한 프레임에 툭 나타나거나 사라지는 것.

2026-08-03 에 재 봤더니, 「명령만 하면 디자인 시스템대로 나온다」를 막고 있던
것은 모델의 취향이 아니라 **가져다 쓸 부품이 없다는 것과 작업 순서가 안 적혀
있다는 것**이었다:

| 재 본 것 | 값 |
|---|---|
| 실제 화면의 생 `<button>` 중, 이미 있던 프리미티브로 덮이던 것 | **419개 중 1개** |
| 조건에 따라 나타나는 화면 중, 애니메이션 없이 툭 튀어나오던 것 | **20개 중 11개** |
| 칩 하나가 쓰는 (높이·`px`·`py`·글자 크기) 조합의 가짓수 | **143개에 50종** (그중 가장 많이 쓰인 3종이 23%) |
| 3개월 동안 실제 화면에서 한 번도 안 쓰인 프리미티브 | **3개** (대신 램프에 없는 `text-lg` 를 쓰고 있었다) |

그래서 이 스킬은 **매번 고를 것을 줄인다.** 새로 정하지 않는 것이 품질의 대부분이다.

## 0-Z. ⚠️ 새 값을 만들기 전에 — **이미 있는지 먼저 찾아라**

**2026-08-03 사고가 정확히 이걸 안 해서 났다.** 컨트롤 높이를 정하는 단 하나의
출처인 `--control-h-{sm,md,lg}`(28/32/40)가 `app/globals.css` 에 **이미 있었는데**
찾아보지 않고 24/30/34 를 새로 만들어 썼다. 30 과 34 는 이 앱 어디에도 없던
값이고, 그 값이 기존 계약과 부딪히자 **값을 고치는 대신 「이 경우는 예외」라는
설정을 하나 더 만들었다.** 그 결과 한 화면 안에 컨트롤 높이가 8~9종이 됐다.

새 치수·색·간격이 필요하면 그 자리에서 멈추고 넷을 하라:

1. `app/globals.css` 에서 그 역할을 하는 토큰(token — 색·크기 같은 값에 이름을
   붙여 한 곳에 모아 둔 것)이 이미 있는지 찾는다
2. `docs/DESIGN-SYSTEM.md` 의 **「시스템을 늘리는 규칙」** 절을 읽는다 — 일곱
   조항이 있고, 이게 그 0번이다
3. `git log --oneline -- app/globals.css | head -20` 으로 그 값이 왜 지금 값이
   됐는지 본다
4. 그래도 없으면 **그때 비로소** 새 값을 제안한다. 이때 「지금 방식으로는 몇
   군데가 막히는지」를 세어서 근거로 댄다

> **찾아보지 않고 만든 값은 시스템을 늘린 게 아니라, 시스템을 하나 더 만든 것이다.**

## 0-A. ⚠️ 규격을 바꾸려는가 — 그러면 혼자 정하지 마라

**아래 파일을 고치려면 「체계」(`design-system`) 를 반드시 부른다.** 회의를 열지
말지 네가 판단하는 게 아니라, **이 목록에 걸리면 부른다**가 규칙이다:

- `src/shared/ui/control-class.ts` — 컨트롤의 모양 · 크기 · 색조, 그리고 그 위에
  얹는 옵션(`active`/`inline`/… — 이 문서에서 「축」이라고 부르는 것)
- `src/shared/ui/controls.tsx` · `surface.tsx` — 프리미티브가 무엇을 보장하는지
- `app/globals.css` 의 램프 — 글자 크기 · 행간 · 반경 · 그림자 · 색 토큰
- `.claude/rules/design.md` 의 「스케일 고정 계약」 절

**이 줄이 왜 여기 있는가 (2026-08-03, 소유자 지적).** 컨트롤 244개를 정리하는
동안 이 자리는 **한 번도 불려 오지 않았다.** 어떤 값을 몇 단계로 둘지 — 색조
8단 · 모양 7종 · 옵션 3개 · 램프 값 — 를 전부 **만드는 쪽이 혼자** 정했고,
아무도 그걸 심사하지 않았다.

결과가 화면에 그대로 나왔다: 50종이던 칩 크기는 3종으로 줄였는데 **한 화면
안의 컨트롤 높이는 여전히 8~9종**이다(`/ko/docs` 9종 · `/ko/topology` 8종).
규칙이 안 맞을 때마다 **규칙을 고치는 대신 「이 경우는 예외」 옵션을 하나씩
더한** 결과다 — `fixedHeight` 가 그렇게 생겼다.

> **혼자 정한 규격은 규격이 아니라 그냥 그 사람 취향이다.** 이 저장소가 카운슬을
> 만든 이유와 똑같은 실패다 — **자기가 만든 것을 자기가 통과시키면 안 된다.**

「체계」는 디자인 팀에서 `design-lead` 와 함께 **가장 높은 두 자리** 중 하나이고,
디자인 회의가 열리면 **반드시 참석하는 자리**다. 그 자리가 없어서 생긴 문제가
아니라 **부르지 않아서** 생긴 문제였다.

## 0. 먼저 — 지을지 고를지

**한눈에 답이 보이지 않는 시각/레이아웃/상호작용/모션 변경이면 `/design-directions`
를 먼저 돌린다.** 가능한 갈래를 안 그려 보고 그중 하나를 바로 지어 버리면,
나중에 카운슬이 그 갈래 찾기를 대신하게 된다 — 그게 가장 비싼 길이다. 이미 정해진
모양 안에서 값만 바꾸는 편집(토큰 교체·문구 수정·간격 조정)이면 건너뛴다.

## 1. 컨트롤 — 손으로 className 을 쓰지 않는다

**누르는 것**:

| 필요한 것 | 쓸 것 |
|---|---|
| 라벨 있는 작은 컨트롤 | `<Chip>` |
| 정사각 아이콘 컨트롤 | `<IconButton label="…">` — `label` 은 **필수** |
| 목록의 한 줄 전체 | `<RowButton>` |
| 표준 버튼(주 행동) | `<Button>` |
| 보더 없는 인셋 (세그먼트 · 탭 · 고스트 버튼) | `controlClass({ shape: 'segment' })` |
| 위에 없는 모양 (pill · card · link · tile) | `controlClass({ shape })` |
| 그 여덟에도 없는 모양 | **멈추고 전체를 다시 센다** — 분류에 없는 모양이 나왔다는 뜻이다 |

**값을 받는 것** (2026-08-15 등재 — 이 표에 없어서 실사용 시험에서 에이전트가
폼을 짓다 멈췄다. 부품은 있는데 안내판이 그리로 안 갔다):

| 필요한 것 | 쓸 것 |
|---|---|
| 한 줄 텍스트 입력 | `<Input label="…">` — 이름(`label` · `aria-label` · `labelledBy`) 셋 중 하나를 **타입이 요구한다** |
| 여러 줄 입력 | `<Textarea label="…">` |
| 오류 · 안내 문구 | `error` / `hint` **prop 으로만** 넘긴다 — `aria-invalid` · `aria-describedby` · `role="alert"` 가 자동으로 배선된다. 손으로 쓰면 배선이 갈라진다 |
| 켜고 끄는 것 하나 | `<Checkbox label="…">` — 라벨이 곧 타깃이다(WCAG 2.5.8) |
| 몇 개 중 하나 고르기 (2~4개 · 라벨이 짧다) | `<SegmentedControl>` — **2택 「켬/끔」도 이것**이다. radiogroup + 화살표 이동이 딸려 온다 |
| 몇 개 중 하나 고르기 (5개 이상 · 라벨이 길다) | `<Select>` |
| 상자를 부모가 이미 냈다 | `frame="bare"` — `boxed` 를 겹치면 상자 속 상자가 된다 |

**눌리지 않는 작은 표시**(상태 라벨 · 종류 태그 · 개수 배지)는 컨트롤이 아니다 —
`badgeClass({ shape })` 가 기하를 낸다:

| 필요한 것 | 쓸 것 |
|---|---|
| 아주 작은 표시(개수 · 상태 한 단어) | `badgeClass({ shape: 'micro' })` |
| 일반 태그 | `badgeClass({ shape: 'tag' })` — 기본값 |
| 알약형(대문자 아이브로우가 흔하다) | `badgeClass({ shape: 'pill' })` |

⚠️ **색과 자간은 값 층이 안 낸다.** 실측에서 배지 색 조합이 60종(최대 클러스터
2)이라 수렴할 다수파가 없었고, 그래서 tone 축을 만들면 소비처 0 선택지가 된다.
색은 그 배지가 **무슨 사실을 나르는지**가 정하므로 `className` 으로 넘긴다:
`badgeClass({ shape: 'pill', className: 'bg-[color:var(--color-indigo-a12)] …' })`.
손으로 기하를 다시 쓰면 `static-badge-adoption-ratchet` 이 막는다.

⚠️ **`Checkbox` 와 `SegmentedControl` 이 겹쳐 보일 때** (2026-08-15 두 번째
시험이 지적한 모순): 가르는 것은 옵션 개수가 아니라 **라벨이 무엇의 이름인가**다.
라벨이 **그 항목 자체의 이름**이면(「만들면 바로 공개돼요」) `Checkbox` —
켜고 끄는 것 하나다. 항목 이름이 **행 왼쪽에 이미 있고** 라벨이 **값의
이름**이면(「켬」/「끔」·「개발」/「일반」) `SegmentedControl` 이다. 그래서 설정
행은 거의 항상 세그먼트이고, 폼 안의 동의 한 줄은 거의 항상 체크박스다.

⚠️ **입력의 폭**: `className` 은 입력이 아니라 **래퍼**(라벨+입력+오류를 담는
세로 상자)로 간다. 래퍼가 세로 flex 라 자식이 가로로 늘어나므로, 칸을 꽉
채우려면 **래퍼에** `className="w-full"` 을 준다(입력에 직접 거는 게 아니다).
값 표(`frame` · `size` · `multiline`)는 `docs/DESIGN-SYSTEM.md` 「폼 필드」 절.

게이트: `field-class` · `field-adoption-ratchet`(새 파일의 생 `<input>` 은 0) ·
`checkbox-target-size` · `dialog-adoption-ratchet` · `touch-floor-layer`.

**뒤를 막는 표면**은 `<Surface>` 가 아니라 `<Dialog>` 다 — 아래 2절.

### 폼 하나를 통째로 — **베낄 것이 없어서 짐작하게 두지 않는다**

2026-08-15 두 번째 이식성 시험의 진단: *"번들에 컴포넌트 사용 예제가 0건이라
호출 모양을 전부 타입에서 역산해야 했다"* — 부품과 규격이 다 있어도 **한 번
조립된 모습**이 없으면 매번 소스를 열게 된다. 그래서 여기 한 장을 둔다:

```tsx
<Dialog open={open} onClose={close} labelledBy="new-project-title" size="sm">
  <h2 id="new-project-title" className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
    새 프로젝트 만들기
  </h2>

  <div className="mt-4 flex flex-col gap-3">
    <Input
      label="이름"
      className="w-full"                    {/* 폭은 래퍼에 */}
      value={name}
      onChange={(e) => setName(e.target.value)}
      error={submitted && !name.trim() ? '이름을 입력하세요' : undefined}
    />
    <Textarea
      label="설명"
      className="w-full"
      rows={3}
      hint="나중에 바꿀 수 있어요"
      value={desc}
      onChange={(e) => setDesc(e.target.value)}
    />
    <Checkbox
      label="만들면 바로 공개돼요"
      checked={isPublic}
      onChange={(e) => setPublic(e.target.checked)}
    />
  </div>

  {/* 푸터: 오른쪽 정렬 · 취소가 왼쪽 · 주 행동이 오른쪽(실측 관례) */}
  <div className="mt-4 flex justify-end gap-2">
    <Button variant="ghost" onClick={close}>취소</Button>
    <Button variant="primary" onClick={submit}>만들기</Button>
  </div>
</Dialog>
```

여기서 읽어야 할 것 넷: ① 제목은 `text-title` + `strong` 이고 `labelledBy`
로 다이얼로그에 묶는다 ② 오류·안내는 **prop 이지 형제 원소가 아니다**
③ 푸터는 `justify-end gap-2` · 취소(`ghost`) 왼쪽 · 주 행동(`primary`)
오른쪽 ④ 세로 리듬은 `gap-3`(필드 사이) · `mt-4`(묶음 사이).

모양 여섯은 419개를 전부 세어서 나온 것이다(칩 128 · 링크형 85 · 행 39 ·
아이콘 36 · pill 32 · 카드 18). **아홉 번째를 감으로 추가하지 않는다** — 나중에
붙은 `tile` 과 `segment` 도 감이 아니라 **몇 번이나 반복해서 필요했는지**를
세어서 들어왔다. 정리 작업을 돌 때마다 「기존 여덟 중에 넣을 자리가 없어서 못
옮겼다」고 적은 사유를 세고, 같은 결론이 여러 번 반복해서 나온 것만 정식 모양으로
올린다(`segment` 는 네 번 연속이었다). 근거 없이 옵션을 하나 더 만드는 것은 그
자체로 시스템을 하나 더 만드는 짓이고, 이 저장소는 아무도 안 쓰는 프리미티브 셋으로
그 실패를 이미 겪었다.

`className` 으로 넘겨도 되는 것은 **이 한 자리에서만 맞는 것**뿐이다 — 위치 ·
폭 · 순서. 여기에 모양·크기·색을 넘기면 이 부품들이 있으나 마나가 된다.

## 2. 나타나는 표면 — `<Surface>` 로 감싼다

```tsx
<Surface open={open} origin="top right" onExited={returnFocus}>…</Surface>
```

이걸 쓰면 넷이 딸려 온다: 사라지는 동안 기다려 주는 시간 · 사라질 때 재생할
애니메이션 클래스 · 사라지는 동안 클릭과 포커스를 막는 `inert` +
`pointer-events-none` · 다 사라진 뒤 한 번 알려 주는 콜백.

**모달이면 `<Surface>` 가 아니라 `<Dialog>` 다** (2026-08-15 체계석 비준).
`design.md` 가 요구하는 모달성 증명 — 뒤를 덮는 막 · `role="dialog"` +
`aria-modal` · Esc · 트랩 · 포커스 복귀 · 스크롤락 — 이 전부 기본으로 딸려
온다:

```tsx
<Dialog open={open} onClose={close} labelledBy="my-title" size="sm">…</Dialog>
```

뼈대를 손으로 짜면 게이트가 막는다(`dialog-adoption-ratchet` — 프리미티브 밖
`role="dialog"` 마크업은 장부를 넘지 못한다). 비모달 표면(뒤가 살아 있어야
하는 패널·팝오버)만 `<Surface>` 로 남는다.

**화면 한가운데서 튀어나오는 팝오버는 반려 사유다.** 누른 버튼 쪽에서 열리도록
`origin` 에 방향을 준다.

## 3. 값 — 어느 램프에서 가져와야 하나

| 값 | 어디서 가져오나 | 안 지키면 |
|---|---|---|
| 글자 크기 | 글자 크기 램프 (`caption`…`hero-lg`) | 램프에 없는 이름을 쓰면 Tailwind 가 클래스를 아예 안 만들어서, **CSS 에 아무 값도 안 남고** 기본값 16px 로 그려진다. 에러도 경고도 안 난다 |
| 행간 | `--leading-*` — 글자 크기와 **한 짝**이다 | 조건에 따라 글자 크기만 바꾸면 행간이 짝을 잃는다 |
| 반경 | `rounded-micro/chip/card/panel/sheet` | — |
| 그림자 | elevation-1/2/3 · dock-* · control-press | 손으로 값을 만지면 빛이 오는 방향이 뒤집히거나, 위에 뜬 것이 더 옅어 보이는 일이 생긴다 |
| 색 | `--color-*` | 새 색상(hue)을 더하는 것은 색 시스템을 하나 더 만드는 것이다 |
| 애니메이션 길이 | `--motion-fast`(눌렸다는 확인) · `base`(위치 이동) · `settle`(결과 확정) | 숫자를 보고 고르지 말고 **무슨 일에 쓰는지**로 고른다 |

## 4. 모션 — 움직임은 주인공에게 몰아준다

- **입력 하나에 사건 하나.** 한 번의 입력이 여러 단계를 일으키면, 그 단계들은
  전부 같은 프레임에 시작한다.
- **사용자가 부른 것이 먼저 움직인다.** 정작 부른 화면은 툭 나타나는데 배경만
  부드럽게 움직이면 결함이다.
- 호버와 포커스는 `0~--motion-fast` 안에서 끝낸다. 그보다 긴 이동·확정용 길이는
  하루에 몇 번 일어나는 큰 사건에만 쓴다.
- 「애니메이션 줄이기」 설정(`prefers-reduced-motion`)은 전역 CSS 가 이미 처리한다
  — **여기서 따로 분기하지 않는다**(그 레이어 밖에서 `!important` 를 써도 오히려
  진다).

## 5. 다 지은 뒤 — 눈으로 보지 말고 재서 확인한다

```bash
pnpm checks:changed          # ★ 항상 여기서 시작한다. 손으로 쓴 목록은 늘 좁다
```

그다음, 해당되는 것만 돌린다. 아래 것들을 이 문서에서는 **계기**(재는 도구)라고
부른다:

| 무엇을 건드렸나 | 무엇으로 재나 |
|---|---|
| UI 아무거나 | `/design-audit` — 요소끼리 겹쳤는지 · 반복 세트의 치수가 들쭉날쭉한지 · 램프에 없는 값을 썼는지 · 글자와 배경의 **대비** |
| 모션 | `/motion-verify` — 화면 녹화 없이 내린 판정은 인정 안 된다 |
| 화면 폭에 따른 레이아웃 | `/responsive-sweep` |
| 지도 | `node scripts/measure-graph-readability.mjs` |
| 토큰 | `node scripts/measure-contrast.mjs` |

## 6. 너를 막을 검사들 — 미리 알고 가라

전부 **래칫**(ratchet — 한 번 좋아진 수치가 다시 나빠지지 못하게 상한을 박아 두는
검사)이다. 지금 이미 있는 위반은 그대로 두고 **새로 생기는 위반만** 막는다.

| 검사 | 막는 것 |
|---|---|
| `control-adoption-ratchet` | 프리미티브를 안 쓰고 className 을 손으로 쓴 새 `<button>` |
| `surface-motion-ratchet` | 나타나고 사라지는 애니메이션이 없는 새 화면 |
| `contrast-ratchet` (e2e) | 글자와 배경의 대비를 떨어뜨리는 토큰 수정 |
| `a11y-ratchet` (e2e) | 기준선을 벗어난 접근성 규칙 위반 |
| `disabled-affordance` | 비활성인데 비활성처럼 안 보이는 컨트롤 |
| `control-class` | 램프에 없는 값 · 새 색상 · 서로 다른 두 모양이 같은 값을 쓰는 것 |

**검사가 실패하면 우회하지 말고 시키는 대로 따라라.** 이 검사들은 실제로 그것을
만든 사람을 먼저 잡았다 — 2026-08-03 에 새 다이얼로그의 버튼 둘이 「417 → 419」
로 막혔고, `Surface` 의 `inert` 가 React 19 에서 아무 신호 없이 안 붙던 것도
`Surface` 자기 테스트가 잡았다.

## 7. 새 규격을 만들었으면 그걸 검사하는 코드도 같은 PR 에

**검사가 없는 규격은 안 지켜진다.** 단 검사를 켜기 전에 **지금 위반이 몇 건인지
전부 세어 본다** — 한 PR 로 못 치울 만큼 많이 걸리는 룰은 강제가 아니라 소음이고,
그 소음이 기존에 잘 돌던 신호까지 덮는다(`shadow-[` 를 통째로 금지했다가 lint
경고가 144 → 548 로 뛴 적이 있다). 절차는 `/gate-probe`.

## 이 스킬이 실패하는 방식

| 실패 | 어떻게 알아채나 |
|---|---|
| 모양이 여섯 중에 없어서 className 을 손으로 썼다 | 래칫이 실패한다. 전체를 다시 세어 보라는 신호이지 우회하라는 뜻이 아니다 |
| `className` 에 크기·색을 넘겼다 | 프리미티브가 있으나 마나가 된다. `controls.test.tsx` 가 결과 문자열이 똑같을 것을 요구한다 |
| 화면을 `{open && …}` 로만 그렸다 | 닫힐 때 한 프레임 만에 툭 사라진다 |
| 재 보지도 않고 「괜찮아 보인다」로 끝냈다 | 몇 픽셀 어긋난 것은 사람도 모델도 눈으로 못 짚는다 |
| 검사를 켜기 전에 위반 수를 안 셌다 | 소음이 신호를 덮어 검사 전체가 무력해진다 |
