---
name: motion-verify
description: Verify canvas and UI motion with a real macOS recording, uniform 30fps frames, a visual phase strip, and frame-to-frame pixel-diff statistics.
---

# Motion verification from a recording

Screenshots prove only that an animation reaches sampled states. Jank and frozen
frames hide between them. Record the real macOS display, extract uniform frames,
inspect a phase strip, then measure adjacent-frame change. This method found the
spotlight ring's speed and braided-orbit defects in 2026-07-23.

Run whenever `pnpm design:route` includes `motion-verify`. This is the completion
proof for temporal output, not an optional craft review.

## Preconditions

- The surface is visible on a real monitor. Headless sequential screenshots may
  diagnose a defect but cannot approve motion; if recording is unavailable,
  report the proof as deferred.
- `ffmpeg` is available at `/opt/homebrew/bin/ffmpeg`.
- Put recordings and frames in an external session scratch directory.
- Capture the same app/window/state through the computer-use capability so the accessibility
  owner and screenshot bind the recording to the reviewed surface.

## 1. Prepare a deterministic state

Set the exact URL, zoom, and state. The map sleeps while idle, so confirm the
motion keeps it awake and disable simulated reduced motion unless that is the
subject.

Add `?guides=off`. A first-run overlay contaminates the opening frames; closing it
by hand adds its own animation and focus change. Use `?guides=reset` only when the
guide itself is under test.

## 2. Record and extract

```bash
cd <scratch-directory>
screencapture -v -V 4 motion.mov
mkdir -p vidframes
ffmpeg -y -loglevel error -i motion.mov -vf fps=30 vidframes/f%03d.png
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 motion.mov
```

## 3. Find the crop carefully

Page coordinates differ from recording coordinates because of Retina scaling and
window position. Colour can locate candidates but cannot identify motion. A prior
amber-ring search cropped a static project hexagon and almost concluded that the
ring was frozen. Build and inspect a strip for candidate crops before computing
statistics.

## 4. Build a phase strip

Sample six frames 166ms apart and inspect them visually:

```python
from PIL import Image
box = (x0, y0, x1, y1)
strip = Image.new("RGB", (320 * 6, 320))
for k, i in enumerate([1, 6, 11, 16, 21, 26]):
    frame = Image.open(f"vidframes/f{i:03d}.png").convert("RGB")
    strip.paste(frame.crop(box).resize((320, 320)), (k * 320, 0))
strip.save("phase-strip.png")
```

The marks should advance through each sample; otherwise the crop or animation is
wrong.

## 5. Measure adjacent-frame change

```python
from PIL import Image
import statistics

prev, diffs = None, []
for i in range(1, 121):
    frame = Image.open(f"vidframes/f{i:03d}.png").convert("L").crop(box)
    if prev is not None:
        a, b = frame.tobytes(), prev.tobytes()
        diffs.append(sum(abs(a[j] - b[j]) for j in range(0, len(a), 7)) / (len(a) / 7))
    prev = frame

mean = statistics.mean(diffs)
sd = statistics.pstdev(diffs)
stalls = [i for i, d in enumerate(diffs) if d < mean * 0.25]
spikes = [i for i, d in enumerate(diffs) if d > mean * 3]
print(f"mean={mean:.3f} cv={sd/mean:.2f} min={min(diffs):.3f} stalls={len(stalls)} spikes={len(spikes)}")
```

- `stalls == 0` is the primary pass condition.
- Consecutive stalls suggest idle-gate sleep or dropped browser frames; inspect
  `src/widgets/topology-map-v2/model/idle-gate.ts` activity flags first.
- `cv <= 0.4` is usually compression noise. Periodic spikes may be another motion;
  identify them in the phase strip.
- Do not judge pleasing speed from the statistic. Inspect the strip and apply the
  HIG principle that motion must not compete with content. Repeating above roughly
  twice per second is suspicious; this slowed the spotlight orbit to 750ms.

## Report

State app/window/route, Computer Use screenshot path and accessibility owner,
recording duration and fps, crop target, stalls and cv, the visual phase-strip
finding, reduced-motion result, and before/after values when tuned. Keep raw
recordings and frames in scratch, not the repository. No recording means no
motion approval.
