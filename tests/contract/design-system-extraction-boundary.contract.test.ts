import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 디자인 시스템 추출 경계 — **코어 부품은 이 앱에 묶이지 않는다** (2026-08-15).
 *
 * ## 왜
 *
 * 2026-08-15 PO 카운슬이 별도 저장소 추출을 보류하면서 「추출하는 날 비용이 0에
 * 수렴하도록 경계만 먼저 긋는다」를 슬라이스로 확정했다. 경계를 문서에만 그으면
 * 다음 사람이 다시 긋는다 — 그래서 여기서 기계가 지킨다.
 *
 * ## 실측이 뒤집은 것
 *
 * 카운슬 브리핑은 「`shared/ui` 8파일이 next-intl/@i18n/sonner 에 결박」이었다.
 * 전수해 보니 **그중 진짜 결함은 1개**였다:
 *
 * | 갈래 | 수 | 판정 |
 * |---|---:|---|
 * | 주석에서 이름만 언급(`transient-surface` · `toast-position`) | 2 | 결박 아님 |
 * | **앱 전용 부품**이라 결박이 정상(관문·지도·라우팅 폴백·크롬 타일) | 5 | 추출 대상이 아니다 |
 * | 범용 부품인데 번역을 직접 읽음(`toast.tsx` 의 `containerAriaLabel` 한 줄) | **1** | **진짜 결함 — 고쳤다** |
 *
 * 「거짓 부채」가 또 나온 셈이다(아이콘 래칫 9건 · 폼 미경유 3파일에 이어 세 번째).
 * **부채를 갚기 전에 그게 정말 부채인지 먼저 잰다.**
 *
 * ## 무엇을 강제하나
 *
 * `src/shared/ui/**` 중 `ATLAS_BOUND` 에 등재되지 않은 파일(= 코어)은 앱 결박을
 * import 하지 못한다. 코어가 자기 문자열·라우팅·상위 레이어를 스스로 가져오면
 * 그 부품은 시스템의 것이 아니라 이 앱의 것이다.
 */

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "src/shared/ui");

/**
 * **앱 결박이 정상인 부품** — 추출 대상이 아니다. 각 줄은 「왜 이 앱의 것인가」를
 * 진다. 이 목록이 알리바이가 되지 않게, 아래 계약이 **등재된 파일이 실제로 앱
 * 결박을 갖거나 Atlas 도메인 어휘를 나르는지** 되묻는다.
 */
const ATLAS_BOUND: ReadonlyArray<readonly [file: string, why: string]> = [
  ["chrome-tile.tsx", "지도 크롬 36px 타일 계약 + i18n Link — 스케일 고정 계약이 이 앱의 것이다"],
  ["chrome-chip.tsx", "같은 크롬 계약(--chrome-tile-size)"],
  ["gateway-entry-fallback.tsx", "관문(/download) 전용 화면"],
  ["map-entry-fallback.tsx", "지도 전용 화면"],
  ["route-focus-manager.tsx", "Next.js 라우팅 + i18n 내비게이션"],
  ["route-loading-fallback.tsx", "Next.js 라우팅 로딩 표면"],
  ["route-memory.tsx", "Next.js 라우팅 기억"],
  ["locale-redirect.tsx", "로케일 라우팅 폴백"],
  ["locale-html-lang.tsx", "로케일 html lang 동기화"],
  ["brand-mark.tsx", "Atlas 브랜드 자산"],
  ["hex-mark.tsx", "Atlas 브랜드 자산"],
  ["github-mark.tsx", "외부 서비스 마크 — 이 앱의 링크 자산"],
  ["x-mark.tsx", "외부 서비스 마크 — 이 앱의 링크 자산"],
  ["topology-v2-kind-glyph.tsx", "온톨로지 kind 데이터 마크"],
  ["evidence-only-badge.tsx", "저작 노드 대 근거-전용 파생 개념의 kind 경계"],
  ["last-edit-subject-row.tsx", "agent | human 타입 유니온 — 제품 정체성 명제"],
  ["mtime-conflict-badge.tsx", "patch_concept 의 expected_mtime 동시성 계약"],
  ["node-explanation-edit.tsx", "노드 본문 = 노드의 설명"],
  ["similar-node-warning.tsx", "중복 노드 경고 — 볼트 어휘"],
  ["frame-meter.tsx", "지도 프레임 계측 — 앱 전용 계기"],
  ["entry-choice-card.tsx", "첫 실행 진입 선택 — 이 앱의 온보딩"],
];

/** 코어 부품이 가지면 안 되는 것 — 이 앱의 라우팅·번역·상위 레이어. */
const APP_COUPLING = [
  { pattern: "next-intl", why: "번역을 스스로 읽으면 이 앱의 메시지 네임스페이스에 묶인다" },
  { pattern: "@/i18n", why: "이 앱의 로케일 라우팅에 묶인다" },
  { pattern: "next/navigation", why: "Next.js 라우터에 묶인다" },
  { pattern: "@/entities", why: "FSD 상위 레이어 — 도메인 지식이 부품에 새어 든다" },
  { pattern: "@/features", why: "FSD 상위 레이어" },
  { pattern: "@/views", why: "FSD 상위 레이어" },
  { pattern: "@/widgets", why: "FSD 상위 레이어" },
] as const;

export function importSources(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

function coreFiles(): string[] {
  const bound = new Set(ATLAS_BOUND.map(([f]) => f));
  return readdirSync(UI_DIR)
    .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."))
    .filter((f) => !bound.has(f))
    .sort();
}

describe("디자인 시스템 추출 경계", () => {
  const core = coreFiles();

  it("탐지기가 공회전하지 않는다 — 코어가 실재하고 주요 부품을 담는다", () => {
    expect(core.length, "코어 부품을 하나도 못 찾았다").toBeGreaterThan(15);
    for (const known of ["button.tsx", "input.tsx", "checkbox.tsx", "dialog.tsx", "segmented-control.tsx", "control-class.ts", "toast.tsx"]) {
      expect(core, `${known} 이 코어에서 빠졌다`).toContain(known);
    }
  });

  it("코어 부품은 앱 결박을 import 하지 않는다", () => {
    const offenders: string[] = [];
    for (const file of core) {
      const sources = importSources(readFileSync(path.join(UI_DIR, file), "utf8"));
      for (const { pattern, why } of APP_COUPLING) {
        if (sources.some((s) => s === pattern || s.startsWith(`${pattern}/`))) {
          offenders.push(`${file} → ${pattern} (${why})`);
        }
      }
    }
    expect(
      offenders,
      "코어 부품이 이 앱에 묶였다. 문자열은 **prop 으로 주입**하고(toast.tsx 의 " +
        "notificationsLabel 이 선례), 라우팅이 필요하면 그 부품은 코어가 아니라 " +
        "ATLAS_BOUND 다 — 근거와 함께 등재하라.",
    ).toEqual([]);
  });

  it("ATLAS_BOUND 는 알리바이가 아니다 — 등재 파일은 실재하고 근거를 진다", () => {
    const existing = new Set(readdirSync(UI_DIR));
    const problems: string[] = [];
    for (const [file, why] of ATLAS_BOUND) {
      if (!existing.has(file)) problems.push(`${file}: 실재하지 않는다`);
      if (why.trim().length < 8) problems.push(`${file}: 근거가 비었다`);
    }
    expect(problems).toEqual([]);
  });

  /* ── 상주 프로브 (/gate-probe) ── */
  it("프로브: import 출처를 정확히 뽑는다", () => {
    const sample = [
      "import { useTranslations } from 'next-intl';",
      "import { Link } from \"@/i18n/navigation\";",
      "const m = await import('@/features/x');",
      "import { cn } from '@/shared/lib/cn';",
    ].join("\n");
    expect(importSources(sample)).toEqual([
      "next-intl",
      "@/i18n/navigation",
      "@/shared/lib/cn",
      "@/features/x",
    ]);
  });
});
