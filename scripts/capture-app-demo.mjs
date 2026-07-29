#!/usr/bin/env node
/**
 * 관문 시연 영상 캡처 — **내장 Retina 화면에서만 찍는다.**
 *
 * ## 왜 화면을 고르는가
 *
 * 이 머신엔 화면이 셋인데 **내장(Color LCD)만 2x** 이고 외장 둘(1920×1080 ·
 * 2560×1440)은 1x 다. 1x 에서 찍은 텍스트는 어떤 인코더로도 되살아나지 않는다 —
 * 원본에 없는 픽셀이기 때문이다. 실측(2026-07-29): `-D 1 -R …,1200,800` →
 * 산출물 **2400×1600**. 정확히 2배다.
 *
 * ## 왜 `-vf fps=` 를 반드시 거는가
 *
 * `screencapture -v` 는 **가변 프레임률**로 저장한다(정지 화면에선 중복 프레임을
 * 버려서 실측 1.29fps 가 나왔다). 그대로 웹에 올리면 재생기마다 타이밍이 달라
 * 모션이 튄다. 고정 fps 로 다시 깔아야 어느 브라우저에서나 같은 속도로 돈다.
 *
 * ## 왜 두 포맷인가
 *
 * AV1 은 같은 화질에서 H.264 보다 훨씬 작지만 Safari 는 하드웨어 지원에 따라
 * 갈린다. 이 페이지의 주 방문자가 **macOS 사용자**(=Safari)라 떨어질 자리가
 * 있어선 안 된다. `<source>` 순서로 AV1 먼저, MP4 를 최종 보루로 둔다.
 *
 * ## 사용
 *
 *   node scripts/capture-app-demo.mjs --name workbench --seconds 8 \
 *     --rect 0,0,1512,982
 *
 * 결과: `public/demo/<name>.{webm,mp4}` + `<name>-poster.png`
 *
 * ## 포스터가 왜 PNG 인가
 *
 * 이 머신의 ffmpeg 에 webp 인코더가 없고(`sips` 도 webp 는 읽기 전용),
 * JPEG 는 어두운 배경 위 UI 텍스트에서 링잉이 눈에 띈다. 포스터는
 * `prefers-reduced-motion` 사용자가 **영상 대신 보게 될 그림**이라 그 자리에서
 * 화질을 깎으면 안 된다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const OUT_DIR = path.join(process.cwd(), 'public', 'demo');

/** 웹 재생 고정 프레임률. 30 이면 부드럽고, 60 은 파일만 커지고 체감 차가 없다. */
const FPS = 30;
/**
 * 출력 가로 상한. 페이지에서 최대 ~1200 CSS px 로 그려질 것이므로 2x = 2400 이
 * 이론상 상한이지만, 그 크기는 파일이 급격히 커진다. 1920 이면 2x 화면에서도
 * 1.6x 밀도라 육안으로 열화가 안 보이고 용량은 절반 이하다.
 */
const MAX_WIDTH = 1920;

function parseArgs(argv) {
  const args = { seconds: 8, rect: null, name: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--name') args.name = argv[++i];
    else if (key === '--seconds') args.seconds = Number(argv[++i]);
    else if (key === '--rect') args.rect = argv[++i];
  }
  if (!args.name) throw new Error('--name 이 필요하다 (예: --name workbench)');
  if (!args.rect) throw new Error('--rect x,y,w,h 가 필요하다 (논리 좌표)');
  return args;
}

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function probe(file) {
  const out = run('/opt/homebrew/bin/ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    file,
  ]).trim();
  const [w, h] = out.split(',').map(Number);
  return { width: w, height: h };
}

const { name, seconds, rect } = parseArgs(process.argv.slice(2));
fs.mkdirSync(OUT_DIR, { recursive: true });

const raw = path.join(OUT_DIR, `.${name}.raw.mov`);
console.log(`● 녹화 ${seconds}s — 내장 Retina(-D 1), 영역 ${rect}`);
console.log('  지금부터 화면을 건드리지 마라. 커서도 시연의 일부다.');
// `-D 1` = 주 디스플레이(내장). 외장에서 찍으면 1x 라 텍스트가 흐려진다.
run('screencapture', ['-v', `-V${seconds}`, '-D', '1', `-R${rect}`, raw]);

const src = probe(raw);
if (src.width < 2000) {
  console.warn(
    `⚠️  산출물이 ${src.width}px 다 — 2x 가 아니다. 외장 화면에서 찍혔을 수 있다.`,
  );
}
console.log(`  원본 ${src.width}×${src.height}`);

const scale = src.width > MAX_WIDTH ? `scale=${MAX_WIDTH}:-2:flags=lanczos` : 'null';
const vf = `fps=${FPS},${scale}`;

const mp4 = path.join(OUT_DIR, `${name}.mp4`);
console.log('● H.264 (모든 브라우저의 최종 보루)');
run(FFMPEG, [
  '-y', '-loglevel', 'error', '-i', raw,
  '-vf', vf,
  '-c:v', 'libx264', '-crf', '20', '-preset', 'slow',
  '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  // 스트리밍 시작을 앞당긴다 — 이게 없으면 브라우저가 파일 끝의 인덱스를
  // 받을 때까지 첫 프레임을 못 그린다.
  '-movflags', '+faststart',
  '-an',
  mp4,
]);

const webm = path.join(OUT_DIR, `${name}.webm`);
console.log('● AV1 (지원되는 곳에서 훨씬 작다)');
run(FFMPEG, [
  '-y', '-loglevel', 'error', '-i', raw,
  '-vf', vf,
  '-c:v', 'libsvtav1', '-crf', '32', '-preset', '6',
  '-pix_fmt', 'yuv420p', '-an',
  webm,
]);

const poster = path.join(OUT_DIR, `${name}-poster.png`);
console.log('● 포스터 (reduced-motion 사용자가 영상 대신 볼 것)');
run(FFMPEG, [
  '-y', '-loglevel', 'error', '-i', raw,
  '-vf', scale === 'null' ? 'null' : scale,
  '-frames:v', '1',
  poster,
]);

fs.unlinkSync(raw);

const size = (f) => fs.statSync(f).size;
const kb = (f) => `${(size(f) / 1024).toFixed(0)} KB`;
const final = probe(mp4);
console.log(`\n완료 — ${final.width}×${final.height} @ ${FPS}fps`);
console.log(`  ${path.relative(process.cwd(), mp4)}     ${kb(mp4)}`);
console.log(`  ${path.relative(process.cwd(), webm)}    ${kb(webm)}`);
console.log(`  ${path.relative(process.cwd(), poster)}  ${kb(poster)}`);

/**
 * ⚠️ **AV1 이 항상 작지는 않다.** 정지에 가까운 화면에서는 H.264 가 이긴다
 * (실측 2026-07-29, 거의 안 움직이는 4초: mp4 198KB vs webm 277KB). AV1 을
 * 무조건 앞에 두면 어떤 클립에서는 **더 큰 파일을 먼저 받게 하는** 셈이다.
 * 그래서 여기서 재서 알려 주고, 큰 쪽은 지운다 — 두 포맷을 두는 이유가
 * "작은 걸 먼저 준다" 인데 그게 거짓이 되는 순간 둘 다 둘 이유가 없다.
 */
if (size(webm) >= size(mp4)) {
  fs.unlinkSync(webm);
  console.log('\n  → AV1 이 더 크다. 지웠다. `<video>` 는 mp4 하나만 실어라.');
} else {
  const saved = (100 * (1 - size(webm) / size(mp4))).toFixed(0);
  console.log(`\n  → AV1 이 ${saved}% 작다. <source> 순서는 webm 먼저.`);
}
