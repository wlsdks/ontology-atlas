#!/usr/bin/env node
// 노드 드로우 A/B — `arc + fill + stroke` 대 **스프라이트 `drawImage`** 실측.
//
// 왜 이 벤치가 따로 있나: Canvas 2D 조사(2026-07-31)가 "가장 큰 지렛대 후보"로
// 스프라이트 캐시를 지목했지만 **1차 실측 근거를 못 찾았다**. MDN 최적화 문서가
// "반복 도형은 오프스크린에 프리렌더하라"고 권할 뿐 숫자가 없다. 우리 렌더러를
// 스프라이트로 갈아엎기 전에 **기법 자체를 격리해서** 먼저 잰다 — 프로덕션
// 코드를 건드리지 않고, 그래서 결과가 실망스러워도 되돌릴 것이 없다.
//
// 프로덕션 계측 금지 관례는 `scripts/perf-realm-transition.mjs` 와 같다. 다만
// 이쪽은 dev 서버도 필요 없다 — about:blank 에 캔버스를 만들어 순수 API 비용만
// 잰다. 재는 것이 **우리 장면**이 아니라 **기법**이기 때문이다.
//
// 사용:
//   node scripts/perf-canvas-sprite.mjs
//   node scripts/perf-canvas-sprite.mjs --nodes=10000 --frames=120 --json
//   node scripts/perf-canvas-sprite.mjs --headed
//
// 출력: 방식별 프레임당 중앙값/p95(ms) + 배수. 판정은 사람이 한다 — 이 스크립트는
// 예산을 걸지 않는다(무엇이 "충분히 빠른가"는 장면마다 다르다).

import { chromium } from "@playwright/test";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}
const NODES = Number(arg("nodes", "3000"));
const FRAMES = Number(arg("frames", "60"));
const HEADED = process.argv.includes("--headed");
const JSON_OUT = process.argv.includes("--json");

/**
 * 페이지 안에서 도는 벤치. 두 방식이 **같은 장면**을 그려야 비교가 성립한다:
 * 같은 좌표·같은 반지름·같은 알파 램프. 우리 지도의 실제 조건을 흉내낸다 —
 * 노드마다 알파가 다르고(램프), 반지름이 kind 별로 몇 단이며, 매 프레임
 * 카메라가 조금씩 움직인다.
 */
async function runBench(page, nodes, frames) {
  return page.evaluate(
    async ({ nodes, frames }) => {
      const W = 1512;
      const H = 950;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext("2d", { alpha: false });

      // 장면 — 결정적으로 생성(실행 간 비교 가능하게).
      let seed = 12345;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const RADII = [3, 4.5, 6, 9]; // element / capability / domain / project 근사
      const scene = [];
      for (let i = 0; i < nodes; i += 1) {
        scene.push({
          x: rand() * W,
          y: rand() * H,
          r: RADII[i % RADII.length],
          a: 0.15 + rand() * 0.85, // dim(0.15) ~ full — 실제 알파 분포를 흉내
        });
      }

      const FILL = "#3a3a44";
      const STROKE = "#60606d";

      // ── 방식 A: 노드마다 arc + fill + stroke (현행)
      const drawDirect = (t) => {
        ctx.fillStyle = "#08090a";
        ctx.fillRect(0, 0, W, H);
        for (const n of scene) {
          ctx.globalAlpha = n.a;
          ctx.beginPath();
          ctx.arc(n.x + t, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = FILL;
          ctx.fill();
          ctx.strokeStyle = STROKE;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };

      // ── 방식 B: 반지름 단마다 스프라이트를 굽고 drawImage
      // DPR 배 해상도로 굽고 **그릴 크기와 1:1** 로 그린다(리샘플링 회피).
      const dpr = window.devicePixelRatio || 1;
      const sprites = new Map();
      for (const r of RADII) {
        const pad = 2;
        const size = Math.ceil((r + pad) * 2);
        const s = document.createElement("canvas");
        s.width = Math.ceil(size * dpr);
        s.height = Math.ceil(size * dpr);
        const sc = s.getContext("2d");
        sc.scale(dpr, dpr);
        sc.beginPath();
        sc.arc(size / 2, size / 2, r, 0, Math.PI * 2);
        sc.fillStyle = FILL;
        sc.fill();
        sc.strokeStyle = STROKE;
        sc.lineWidth = 1;
        sc.stroke();
        sprites.set(r, { canvas: s, size });
      }
      const drawSprite = (t) => {
        ctx.fillStyle = "#08090a";
        ctx.fillRect(0, 0, W, H);
        for (const n of scene) {
          const sp = sprites.get(n.r);
          ctx.globalAlpha = n.a;
          ctx.drawImage(sp.canvas, n.x + t - sp.size / 2, n.y - sp.size / 2, sp.size, sp.size);
        }
        ctx.globalAlpha = 1;
      };

      const time = (fn) =>
        new Promise((resolve) => {
          const samples = [];
          let i = 0;
          const step = () => {
            const t0 = performance.now();
            fn(i * 0.3); // 매 프레임 살짝 이동 — 정지 장면의 캐시 효과 배제
            // 드로우 명령이 실제로 래스터되게 강제하지 않으면 GPU 가 뒤로 미룬다.
            // 1px 읽기로 파이프라인을 flush 한다(측정 왜곡을 최소화한 형태).
            ctx.getImageData(0, 0, 1, 1);
            samples.push(performance.now() - t0);
            i += 1;
            if (i < frames) requestAnimationFrame(step);
            else resolve(samples);
          };
          requestAnimationFrame(step);
        });

      // 워밍업 — JIT·GPU 텍스처 업로드가 첫 측정에 섞이지 않게.
      await time(drawDirect, 10);
      await time(drawSprite, 10);

      const direct = await time(drawDirect);
      const sprite = await time(drawSprite);

      const stat = (xs) => {
        const s = [...xs].sort((a, b) => a - b);
        return {
          median: s[Math.floor(s.length / 2)],
          p95: s[Math.floor(s.length * 0.95)],
        };
      };
      return { direct: stat(direct), sprite: stat(sprite), dpr };
    },
    { nodes, frames },
  );
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
await page.goto("about:blank");
const result = await runBench(page, NODES, FRAMES);
await browser.close();

const ratio = result.direct.median / result.sprite.median;
if (JSON_OUT) {
  console.log(JSON.stringify({ nodes: NODES, frames: FRAMES, ...result, ratio }, null, 2));
} else {
  console.log(`노드 ${NODES.toLocaleString()} · 프레임 ${FRAMES} · DPR ${result.dpr}`);
  console.log(
    `  arc+fill+stroke   중앙값 ${result.direct.median.toFixed(2)}ms · p95 ${result.direct.p95.toFixed(2)}ms`,
  );
  console.log(
    `  drawImage 스프라이트 중앙값 ${result.sprite.median.toFixed(2)}ms · p95 ${result.sprite.p95.toFixed(2)}ms`,
  );
  console.log(`  → 스프라이트가 ${ratio.toFixed(2)}배 ${ratio > 1 ? "빠름" : "느림"}`);
}
