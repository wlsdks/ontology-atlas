---
name: motion-verify
description: Verify a canvas/UI animation objectively with a real macOS screen recording — record with screencapture, extract uniform 30fps frames with ffmpeg, build a phase strip for visual inspection, and compute frame-to-frame pixel-diff uniformity to prove (or disprove) smoothness. Use after implementing or tuning any topology-map motion (rings, comets, ramps, camera), before claiming "the motion is smooth". Screenshots alone sample too sparsely to catch jank.
---

# /motion-verify — 녹화 기반 모션 판정 파이프라인

스크린샷 몇 장으로는 "일단 돌아가긴 한다"까지만 증명된다. **버벅임(jank)과 아예
멈춘 프레임**은 80~200ms 간격으로 띄엄띄엄 찍은 샷 사이에 숨어 버린다. 이 스킬은
macOS 화면 녹화(원본 60fps)를 30fps 프레임으로 일정 간격으로 뽑아내서 두 가지로
판정한다: ① 뽑은 프레임 몇 장을 한 줄로 이어 붙여 **눈으로** 진행을 확인하고
② 이웃한 두 프레임이 픽셀 단위로 얼마나 달라졌는지를 **숫자로** 재서 멈춘 구간과
튀는 구간을 찾는다. (2026-07-23 스포트라이트 링 검증에서 확립 — 회전 500→750ms
감속과 r+6 궤도 브레이드 결함이 이 방법의 전신인 프레임 검수로 잡혔고, 최종 무결
판정은 이 파이프라인으로 했다.)

## 전제

- 검증할 화면이 **실제 모니터에 떠 있어야** 한다 (chrome-devtools 로 조종하는
  Chrome 창이 열려 있으면 된다. 창 없이 도는 headless 는 녹화가 안 된다 — 그때는
  Playwright 로 스크린샷을 연속으로 뽑는 차선책을 쓴다).
- `ffmpeg` 필요 (`/opt/homebrew/bin/ffmpeg` — 이 프로젝트 머신에 있음).
- 작업 파일은 세션 scratchpad 디렉토리에 둔다 (저장소를 더럽히지 않는다).

## 1. 대상 상태 준비

chrome-devtools 로 검증할 URL/줌/상태를 화면에 세팅한다. 지도는 아무 일도 안
일어나면 그리기를 멈추도록(유휴 상태) 만들어져 있으니, 재려는 모션이 그렇게
멈춰 있지는 않은지 먼저 확인한다 (예: 스포트라이트는 fresh breathing 이 캔버스를
계속 깨워 둔다 — 「애니메이션 줄이기」(reduced-motion) 흉내가 켜져 있으면 끈다).

**URL 에 `?guides=off` 를 붙인다** (2026-07-28). 첫 방문 안내가 반투명 막과 안내
카드로 화면을 덮으면 녹화의 첫 구간이 통째로 그 안내가 된다. **손으로 눌러 닫는
것은 대안이 아니다** — 닫는 동작 자체가 자기 애니메이션을 재생하고 포커스를
옮겨서, 재려던 모션의 첫 프레임과 섞인다. 되돌리려면 `?guides=reset`.
이 목록이 있는 곳은 한 곳뿐이다: `features/guided-tour/model/first-run-seen.ts`.

## 2. 녹화 → 프레임 추출

```bash
cd <scratchpad>
screencapture -v -V 4 motion.mov          # 4초 전체 화면 녹화
mkdir -p vidframes
ffmpeg -y -loglevel error -i motion.mov -vf fps=30 vidframes/f%03d.png
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 motion.mov
```

## 3. 잘라낼 영역 찾기 — ⚠️ 함정 주의

화면 전체를 녹화하므로 **웹페이지 안의 좌표와 녹화 프레임 안의 좌표가 다르다**
(Retina 2배 + 창이 놓인 위치만큼 밀린다). 색으로 후보 영역을 찾되, **색만 같고
움직이지는 않는 요소를 집어 버리는 함정**이 있다 (실례: 앰버 링을 찾다가 가만히
있는 프로젝트 헥사곤을 잘라내는 바람에 「변화량 ≈ 0 = 안 움직인다」라고 오판할
뻔했다). 잘라낸 영역을 이어 붙인 이미지를 **반드시 눈으로 확인**해서 움직이는
대상이 맞는지 검증한 뒤에 숫자 재기로 넘어간다.

```python
# 색 버킷 밀집 셀 찾기 (예: 앰버 r>150, g<r, b<g) → 상위 셀들 각각 크롭해
# 스트립을 만들어 보고, "움직이는" 셀을 고른다.
```

## 4. 프레임을 한 줄로 이어 붙여 눈으로 본다

166ms 간격(매 5번째 프레임)으로 6장을 뽑아 한 줄로 이어 붙인 이미지를 만들고
Read 로 본다 — 파선이나 깜빡임의 위치가 장마다 조금씩 앞으로 나아가고 있으면
그 모션이 실제로 돌고 있다는 뜻이다.

```python
from PIL import Image
box = (x0, y0, x1, y1)  # 3에서 확정한 크롭
strip = Image.new("RGB", (320*6, 320))
for k, i in enumerate([1, 6, 11, 16, 21, 26]):
    strip.paste(Image.open(f"vidframes/f{i:03d}.png").convert("RGB").crop(box).resize((320,320)), (k*320, 0))
strip.save("phase-strip.png")
```

## 5. 프레임 사이의 변화량을 숫자로 잰다 (버벅임 판정)

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

**판정 기준** (`stalls` = 거의 안 변한 프레임 = 멈춘 것 · `spikes` = 갑자기 확
튄 프레임 · `cv` = 변화량이 얼마나 들쭉날쭉한지):

- `stalls == 0` (가장 작은 변화량이 평균의 25% 아래로 안 떨어짐) → 멈춘 프레임이
  없다 = 끊기지 않고 이어졌다. **이게 핵심 합격선.**
- `stalls > 0` 이 여러 프레임 연속으로 나오면 → 아무 일도 없을 때 그리기를 멈추는
  장치가 잘못 걸렸거나 브라우저가 프레임을 건너뛴 것으로 의심하고,
  `idle-gate.ts` 의 활동 플래그부터 조사한다.
- `cv` 가 0.4 이하면 영상 압축 때문에 생기는 잡음 수준이라 문제가 아니다. 일정한
  간격으로 튀는 값은 다른 애니메이션(코멧이 지나가는 것 등)이 끼어든 것일 수
  있으니, 이어 붙인 이미지를 보고 원인을 확인한다.
- 빠르다/느리다는 숫자로 판정하지 않는다. **이어 붙인 이미지를 보고**
  Apple HIG 의 원칙("모션이 콘텐츠와 주목을 두고 경쟁하면 안 된다")으로
  판단한다 — 계속 반복해서 도는 모션이 초당 2회를 넘으면 사용자를 재촉하는
  느낌이라 의심한다(스포트라이트 링은 이 근거로 한 바퀴를 750ms 로 늦췄다).

## 6. 보고

판정문에 반드시 넣을 것: 녹화 길이와 fps, 무엇을 잘라내서 봤는지, `stalls`/`cv`
수치, 이어 붙인 이미지를 눈으로 본 소견, (조정했다면) 전후 비교. 프레임 원본은
scratchpad 에 남긴다 — 저장소에 커밋하지 않는다.
