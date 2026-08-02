---
name: design-system-audit
description: Find the parts of the product that were built outside the design system — off-ramp values, parallel token systems, and above all the gate holes that let them in. Run before a release, after absorbing a large surface, or whenever "왜 이 화면만 다르지" comes up. This is not /design-audit (which measures one finished change in the rendered DOM) and not /responsive-sweep (which measures breakpoints): this one asks whether the system is enforced at all, and its primary output is closed gates, not fixed values.
---

# /design-system-audit — 값이 아니라 **문**을 찾는다

## 왜 값부터 세면 안 되나

2026-08-03 전수조사가 이 스킬을 낳았다. 세 감사자가 표면을 나눠 재고 독립적으로
같은 결론에 도달했다: **이탈 값 300여 건은 증상이고, 원인은 게이트 넷이었다.**

그날 실측:

| 구멍 | 결과 |
|---|---|
| lint 셀렉터가 `text-[13px]` 같은 **대괄호 문법만** 봤다 | `text-sm`·`rounded-md` 같은 이름 있는 Tailwind 기본 스텝 **268건**이 어떤 룰도 안 거치고 렌더됐다 |
| 제품의 **중심 표면 둘**이 warn 목록에 있었고 `pnpm lint` 에 `--max-warnings` 가 없었다 | 그 둘의 이탈 66건이 아무것도 실패시키지 않았다 |
| raw-color 검사기가 한 디렉터리를 **통째로** 건너뛰었다 | 그 안의 색 리터럴은 검사받은 적이 없다 |
| 한 표면이 헌장과 **평행한 4단 램프**를 정의하고 주석으로 문서화까지 해 뒀다 | 한 화면 33개 중 17개가 램프 밖 |

**값만 고치면 반년 뒤 되돌아온다.** 문이 열려 있으면 다시 들어온다.

그리고 이 스킬은 형제 둘과 겹치지 않는다 — `/design-audit` 은 *끝낸 변경 하나*를
렌더된 DOM 에서 재고, `/responsive-sweep` 은 *브레이크포인트*를 잰다. 이 스킬은
**시스템이 강제되고 있는가**를 묻는다.

## 0. 램프를 먼저 읽는다 — 기억으로 감사하지 않는다

`app/globals.css` 의 `@theme`/`:root` 에서 **실제 정의된 값**을 뽑는다.
`docs/DESIGN-SYSTEM.md` 는 설명이고 진실원이 아니다.

```bash
grep -oE "\-\-text-[a-z-]+:\s*[0-9.]+px" app/globals.css | sort -u
grep -oE "\-\-radius-[a-z-]+:\s*[0-9.]+px" app/globals.css | sort -u
grep -oE "\-\-leading-[a-z-]+:" app/globals.css | sort -u
grep -oE "\-\-shadow-elevation-[a-z0-9-]+:" app/globals.css | sort -u
```

## 1. 게이트의 사정거리를 잰다 (이 절이 이 스킬의 핵심)

각 규격에 대해 **룰이 무엇을 못 보는지**를 묻는다. 「룰이 있다」는 답이 아니다.

1. **문법 사각지대** — 셀렉터가 한 문법만 보고 있지 않은가?
   - 대괄호(`text-[13px]`)만 보고 **이름 있는 스텝**(`text-sm`)은 놓치는가
   - `#hex` 만 보고 `rgba(...)` 는 놓치는가
   - JSX 클래스만 보고 `style={{ boxShadow }}` 인라인은 놓치는가
   - variant 스태킹(`motion-safe:active:scale-`)이 앵커를 빠져나가는가
   - 글리프(`→`)만 보고 아이콘 컴포넌트(`<ArrowUpRight />`)는 놓치는가
2. **경로 사각지대** — 룰이 적용되는 글롭 밖에 무엇이 있나?
   ```bash
   # 위반이 있는데 eslint 는 조용한 파일 = 경로 사각지대
   pnpm exec eslint <파일> ; grep -c "text-\[" <파일>
   ```
   `app/**` 이 빠져 있어 경계 페이지 넷의 이탈 22줄이 침묵 통과한 실측이 있다.
3. **레벨 사각지대** — `warn` 인데 `--max-warnings` 가 없으면 **게이트가 아니다**.
   `package.json` 의 lint 스크립트와 warn 강등 목록을 함께 본다.
4. **면제 사각지대** — 검사 스크립트의 `shouldSkip*`/`ALLOWLIST`/`ignores` 를 열어
   **디렉터리째 면제**가 있는지 본다. 파일 단위 + 사유 주석이 이 저장소의 규격이다.
5. **평행 시스템** — 한 표면이 자기 램프를 정의하고 있지 않은가. 징후는 토큰 이름의
   접두(`--chrome-*`, `--topology-*`)와 **그 값이 헌장 램프와 1~4px 어긋나는 것**.
6. **서식을 재는 게이트** — 게이트가 규격이 아니라 이웃 클래스 이름·따옴표를 못박고
   있지 않은가. 그런 게이트는 규격을 올릴 때 붉어져서, 다음 사람이 게이트 대신
   **규격을 되돌린다**. 실측 2건(`rounded-xl` 못박기, `"/download/"` 따옴표).

## 2. 실물에서 센다 — 소스가 아니라 화면이 진실이다

소스 grep 은 «쓰였나»를 알려주고, computed style 은 «렌더됐나»를 알려준다. 둘은
다르다(토큰이 램프 밖 값을 담고 있으면 소스는 깨끗한데 화면은 어긋난다).

```js
// chrome-devtools evaluate_script — 한 화면의 램프 이탈 census
() => {
  const RADII = new Set(["0px","6px","9px","12px","9999px","50%"]);
  const SIZES = new Set(["9.5px","11px","12.5px","14px","16px","23px","30px","34px"]);
  const badR = {}, badS = {};
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;      // 안 보이는 것은 안 센다
    const cs = getComputedStyle(el);
    const br = cs.borderTopLeftRadius;
    if (br && !RADII.has(br) && !br.includes("%") && parseFloat(br) < 1000) {
      badR[br] = (badR[br] || 0) + 1;
    }
    if (el.childElementCount === 0 && el.textContent?.trim() && !SIZES.has(cs.fontSize)) {
      badS[cs.fontSize] = (badS[cs.fontSize] || 0) + 1;
    }
  }
  return { radius: badR, font: badS };
}
```

**집합은 §0 에서 뽑은 값으로 채운다** — 여기 적힌 목록을 그대로 쓰지 마라. 램프가
바뀌면 이 스킬이 조용히 틀린 답을 낸다.

그림자도 같이 센다(`cs.boxShadow` 히스토그램). **광원이 하나면 더 높이 뜬 표면이
더 짙고 더 퍼진 그림자를 갖는다** — 오프셋이 큰데 알파가 옅은 짝이 나오면 형제
요소가 서로 다른 두 광원 아래 있다는 뜻이다(실측 1건).

## 3. 고치는 **순서**가 계약이다

값을 한 번에 다 고치면 무엇이 화면을 바꿨는지 아무도 모른다.

1. **픽셀 0 변화** — 값이 이미 같은데 이름만 공장 스케일인 것
   (`rounded-md`=chip 6px · `rounded-xl`=panel 12px · `text-sm`=body-lg 14px).
   토큰 리다이렉트(`--chrome-radius: var(--radius-card)`)도 여기다 — **소비처
   코드 변경 0**으로 수십 곳이 램프 위로 올라온다.
2. **0.5~1px** — `text-xs`→body · `rounded-lg`→card. 전후 스크린샷 대조.
3. **눈에 보이는 이동** — 램프 밖 값(4px·16px·20px). 여기부터는 **디자인 판정**이고,
   한 PR 로 못 치우면 래칫에 등재하고 넘긴다.
4. **게이트를 켠다** — 1~3 이 끝난 뒤에. 순서를 뒤집으면 소음이 신호를 덮는다.

## 4. 켜기 전 전수 측정 · 켠 뒤 프로브 (`/gate-probe` 와 같은 규율)

- 켜기 전: 위반을 **패턴별로 분류**하고 한 PR 로 치울 규모인지 판단한다. 아니면
  사정거리를 좁히고 나머지는 래칫에 등재한다 — 그것이 후퇴가 아니라 설계다.
- 켠 뒤: **위반 1줄 + 정상 1줄**짜리 프로브 파일로 실제로 잡는지 증명한다.
  ```bash
  printf 'export const A = "text-sm rounded-md";\nexport const B = "text-body rounded-chip";\n' > src/shared/ui/__probe.tsx
  pnpm exec eslint src/shared/ui/__probe.tsx   # 잡히는가?
  rm src/shared/ui/__probe.tsx
  ```
- **한 번도 붉어질 수 없는 게이트를 만들지 마라.** 켤 때 위반이 0이면 그 0이
  「깨끗해서 0」인지 「안 봐서 0」인지 프로브로 갈라야 한다.

## 5. 새 토큰을 만들 때

**기본은 안 만드는 것이다.** 만들려면 셋을 함께 쓴다: 이름 · 값 · **소비처**.
그리고 *왜 기존 스텝으로 안 되는지*를 대야 한다.

- 소비처가 **하나**면 만들지 않는다 — 이 저장소의 선례는 「두 번째 소비처가
  생기는 순간이 값을 이름으로 올릴 때」다.
- 아무도 안 쓰는 토큰은 규격이 아니라 **오정보**다(`unused-token-ratchet` 이
  붙든다). 쓸 곳과 함께 넣거나, 안 쓸 거면 넣지 마라.
- 값이 두 곳에 적히면 이미 드리프트가 시작된 것이다(Carbon).

## 출력 형식

```md
## 디자인 시스템 감사 — <범위> · <날짜>

### 게이트 (먼저 온다)
| 구멍 | 무엇을 못 보나 | 그래서 몇 건이 샜나 | 처방 |

### 이탈 census — 실물 계측
| 항목 | 램프 안 | 램프 밖 | 대표 값 |
(항목별로 **0건이면 "0건"이라고 쓴다** — 안 쟀는지 재고 0인지 구별돼야 한다)

### 수정 순서
1. 픽셀 0 변화 (N건) · 2. 0.5~1px (N건) · 3. 디자인 판정 필요 (N건) · 4. 게이트

### 새 토큰
없음 / <이름 · 값 · 소비처 N곳 · 기존 스텝으로 안 되는 이유>
```

## 하지 말 것

- **값만 고치고 끝내기.** 문이 열려 있으면 다시 들어온다.
- **소스 grep 만으로 판정하기.** 토큰이 램프 밖 값을 담으면 소스는 깨끗하다.
- **전부 한 번에 치환하기.** 무엇이 화면을 바꿨는지 못 가른다.
- **위반 수백 건짜리 룰을 그냥 켜기.** 소음이 기존 신호까지 덮는다.
- **테스트 파일을 위반으로 세기.** 렌더된 className 을 assert 하는 자리다.
