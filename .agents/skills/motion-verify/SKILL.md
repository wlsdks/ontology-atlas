---
name: motion-verify
description: Verify a canvas/UI animation objectively with a real macOS screen recording — record with screencapture, extract uniform 30fps frames with ffmpeg, build a phase strip for visual inspection, and compute frame-to-frame pixel-diff uniformity to prove (or disprove) smoothness. Use after implementing or tuning any topology-map motion (rings, comets, ramps, camera), before claiming "the motion is smooth". Screenshots alone sample too sparsely to catch jank.
---

# /motion-verify — 녹화 기반 모션 판정 파이프라인

스크린샷 몇 장으로는 "돌아간다"까지만 증명된다. **끊김(jank)·정지 프레임**은
80~200ms 간격 샘플 사이에 숨는다. 이 스킬은 macOS 화면 녹화(60fps 원본)를
30fps 프레임으로 균일 추출해 ① 육안 위상 대조(스트립) ② 프레임간 diff
정량(정지/스파이크 검출) 두 축으로 판정한다. (2026-07-23 스포트라이트 링
검증에서 확립 — 회전 500→750ms 감속과 r+6 궤도 브레이드 결함이 이 방법의
전신인 프레임 검수로 잡혔고, 최종 무결 판정은 이 파이프라인으로 했다.)

## 전제

- 검증 대상 화면이 **실제 모니터에 보이는 상태**여야 한다 (chrome-devtools
  로 조종하는 Chrome 창이 열려 있으면 됨. headless 는 녹화 불가 — 그 경우
  Playwright 로 연속 스크린샷을 뽑는 차선책 사용).
- `ffmpeg` 필요 (`/opt/homebrew/bin/ffmpeg` — 이 프로젝트 머신에 있음).
- 작업 파일은 세션 scratchpad 디렉토리에 둔다 (레포 오염 금지).

## 1. 대상 상태 준비

chrome-devtools 로 검증할 URL/줌/상태를 화면에 세팅한다. 모션이 유휴
게이트에 얼지 않는 상태인지 먼저 확인 (예: 스포트라이트는 fresh breathing
이 캔버스를 깨워 둠 — reduced-motion 에뮬레이션이 켜져 있으면 끄기).

**URL 에 `?guides=off` 를 붙인다** (2026-07-28). 첫 방문 안내가 스크림 + 카드로
화면을 덮으면 녹화의 첫 구간이 통째로 안내가 된다. **손으로 닫는 것은 대안이
아니다** — 닫는 동작이 자기 전환 애니메이션을 재생하고 포커스를 옮겨서, 재려던
모션의 첫 프레임과 섞인다. 되돌리려면 `?guides=reset`.
단일 출처: `features/guided-tour/model/first-run-seen.ts`.

## 2. 녹화 → 프레임 추출

```bash
cd <scratchpad>
screencapture -v -V 4 motion.mov          # 4초 전체 화면 녹화
mkdir -p vidframes
ffmpeg -y -loglevel error -i motion.mov -vf fps=30 vidframes/f%03d.png
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 motion.mov
```

## 3. 대상 영역 찾기 — ⚠️ 함정 주의

전체 화면 녹화라 페이지 좌표 ≠ 프레임 좌표(Retina 2x + 창 오프셋). 색으로
후보를 찾되, **정적인 같은 색 요소를 잡는 함정**이 있다 (실례: 앰버 링을
찾다가 정적 프로젝트 헥사곤을 크롭해 diff≈0 오판 직전까지 감). 반드시
크롭 스트립을 **눈으로 확인**해 움직이는 대상이 맞는지 검증한 뒤 정량으로
넘어간다.

```python
# 색 버킷 밀집 셀 찾기 (예: 앰버 r>150, g<r, b<g) → 상위 셀들 각각 크롭해
# 스트립을 만들어 보고, "움직이는" 셀을 고른다.
```

## 4. 위상 스트립 (육안 판정)

166ms 간격(매 5번째 프레임) 6장을 한 줄로 이어 붙인 스트립을 만들어 Read
로 본다 — 파선/펄스 위상이 프레임마다 진행하면 회전/흐름 확인.

```python
from PIL import Image
box = (x0, y0, x1, y1)  # 3에서 확정한 크롭
strip = Image.new("RGB", (320*6, 320))
for k, i in enumerate([1, 6, 11, 16, 21, 26]):
    strip.paste(Image.open(f"vidframes/f{i:03d}.png").convert("RGB").crop(box).resize((320,320)), (k*320, 0))
strip.save("phase-strip.png")
```

## 5. diff 정량 (jank 판정)

```python
from PIL import Image
import statistics
prev, diffs = None, []
for i in range(1, 121):
    f = Image.open(f"vidframes/f{i:03d}.png").convert("L").crop(box)
    if prev is not None:
        a, b = f.tobytes(), prev.tobytes()
        diffs.append(sum(abs(a[j]-b[j]) for j in range(0, len(a), 7)) / (len(a)/7))
    prev = f
mean, sd = statistics.mean(diffs), statistics.pstdev(diffs)
stalls = [i for i, d in enumerate(diffs) if d < mean*0.25]
spikes = [i for i, d in enumerate(diffs) if d > mean*3]
print(f"mean={mean:.3f} cv={sd/mean:.2f} min={min(diffs):.3f} stalls={len(stalls)} spikes={len(spikes)}")
```

**판정 기준**:
- `stalls == 0` (min diff 가 mean 의 25% 아래로 안 떨어짐) → 정지 프레임
  없음 = 연속 모션. **이게 핵심 합격선.**
- `stalls > 0` 이 연속 구간이면 → 유휴 게이트 동결/rAF 드랍 의심 —
  `idle-gate.ts` 활동 플래그부터 조사.
- cv ≤ ~0.4 는 압축 노이즈 수준. 주기적 스파이크는 다른 애니메이션(코멧
  통과 등) 간섭일 수 있으니 스트립으로 원인 확인.
- 속도 감각 판정(빠르다/느리다)은 정량이 아니라 **위상 스트립을 보고**
  HIG deference("모션이 콘텐츠와 경쟁 금지") 렌즈로 — 지속 모드 모션이
  ~2Hz 이상이면 재촉 의심(스포트라이트 링은 이 근거로 750ms/주기 감속).

## 6. 보고

판정문에 반드시 포함: 녹화 길이·fps, 크롭 대상(무엇을 보았나), stalls/cv
수치, 스트립 육안 소견, (조정했다면) before/after. 프레임 원본은
scratchpad 에 보존한다 — 레포에 커밋하지 않는다.
