"use client";

import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/shared/lib/cn";
import type { UseGuidedTourResult } from "../model/use-guided-tour";
import {
  computeCardPlacement,
  resolveAnchorRect,
  type AnchorBox,
} from "../model/resolve-anchor-rect";
import { GuidedTourCard } from "./GuidedTourCard";

/** 4단계 funnel 구멍의 프로브 대비 여유 — 시각 노드와의 순간 오차 흡수. */
const TOUR_HOLE_PADDING = 16;

export interface GuidedTourOverlayProps {
  tour: UseGuidedTourResult;
  /**
   * 캔버스 노드 앵커(2·4단계) 측정 프로브 — `TopologyMapV2` 가 매 프레임
   * `worldToScreen` transform 을 써넣는 같은 div(HomePage 가 만들어 양쪽에
   * 내려준다, realm "전개" 버튼 선례와 동형). 프로브 자체는 페인트가 없다 —
   * 스크림/컷아웃 원은 이 오버레이가 z-70 에서 그린다(2026-07-23 Guardian
   * 정정: 위젯 내부 z-40 스크림은 상단 툴바 등 바깥 크롬을 못 덮어 testid
   * 단계와 감광이 어긋났다).
   */
  canvasAnchorRef: RefObject<HTMLDivElement | null>;
}

/**
 * 스크림 + 컷아웃 + blocker + 카드 + 진행 점을 그리는 오버레이. 모든 단계의
 * 스크림/컷아웃이 같은 z-70 레이어에서 그려져 감광이 균일하다. 인터랙티브
 * (4단계)는 전면 통과가 아니라 **컷아웃 구멍만 통과하는 4-스트립 blocker**
 * (funnel) — 스포트라이트된 노드 외의 크롬(투어 타일 재진입, 검색, 툴바)은
 * 클릭이 막힌다(stacked-transient-UI 금지 계약).
 */
export function GuidedTourOverlay({ tour, canvasAnchorRef }: GuidedTourOverlayProps) {
  const { open, step } = tour;

  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // testid 앵커 — 정적(레이아웃 안정화 후 고정) rect. 단계 전환/리사이즈에만
  // 재계산 — 컷아웃 이동은 CSS `transition`(180ms) 이 담당(spec §5).
  const [testidRect, setTestidRect] = useState<AnchorBox | null>(null);
  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "testid") {
      setTestidRect(null);
      return undefined;
    }
    const anchorValue = step.anchor.value;
    const recompute = () => setTestidRect(resolveAnchorRect(anchorValue));
    recompute();
    // 마운트 직후 1프레임 뒤 재확인 — 방금 열린 패널(예: 데이터시트)의
    // 슬라이드인 레이아웃이 첫 tick 에 아직 최종 크기가 아닐 수 있다.
    const raf = window.requestAnimationFrame(recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.cancelAnimationFrame(raf);
    };
  }, [open, step]);

  // 캔버스 노드 앵커 — 매 프레임 추종(카메라 스프링 리듬 상속, CSS 전환 없음).
  // 프로브가 아직 투영 전(0-크기)이면 null — 전체 스크림 폴백.
  const [canvasRect, setCanvasRect] = useState<AnchorBox | null>(null);

  useEffect(() => {
    if (!open || !step || step.anchor?.type !== "canvas-node") {
      setCanvasRect(null);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      const el = canvasAnchorRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setCanvasRect(
          r.width > 0 && r.height > 0
            ? { top: r.top, left: r.left, width: r.width, height: r.height }
            : null,
        );
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [open, step, canvasAnchorRef]);

  if (!open || !step) return null;

  const anchorRect =
    step.anchor?.type === "testid" ? testidRect : step.anchor?.type === "canvas-node" ? canvasRect : null;
  const cardWidth = Math.min(360, viewport.width - 32);
  // 실제 카드 높이는 콘텐츠에 따라 auto — 배치 계산은 근사 높이로 충분(카드
  // 자체는 `top`/`left` 고정 후 내용에 맞춰 자란다, 클램프가 여유 마진을 둠).
  // 상수는 1440x900 실측(2026-07-24 투어 다듬기 패스, Playwright
  // `guided-tour.spec.ts` 로 8단계 전부의 렌더된 카드 높이를 측정) 기준 —
  // 실제 높이보다 살짝 크게 잡아야 안전한 방향이다(작게 잡으면 "below"
  // 배치가 카드 실제 하단을 뷰포트 가장자리 밖으로 밀 수 있다). 이전 상수는
  // try-click 이 실측(183.5px)보다 36.5px 나 과대추정(220px, 반대 방향이라
  // 안전하긴 했지만 여백이 불필요하게 컸다)이었고 recent 는 반대로
  // 11.5px 과소추정(240px vs 실측 251.5px)이었다.
  const cardHeight = step.id === "recent" ? 255 : step.interactive ? 195 : 205;
  const placement = computeCardPlacement({
    targetRect: anchorRect,
    cardWidth,
    cardHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });

  const isInteractive = Boolean(step.interactive);
  // 인터랙티브(4단계) 클릭 funnel — 컷아웃 원의 bbox 만 캔버스로 통과.
  // 구멍은 프로브 rect 보다 사방 16px 넓게 뚫는다 — 카메라 스프링 진행 중
  // 스트립(React state, 1프레임 지연)과 그려진 노드 사이의 순간 오차를
  // 흡수해 "밝은 노드를 눌렀는데 안 먹는" 정지를 막는다 (2026-07-24 라이브
  // 관측 하드닝, `guided-tour.spec.ts` "probe center" 회귀).
  const interactiveHole =
    isInteractive && anchorRect
      ? {
          top: anchorRect.top - TOUR_HOLE_PADDING,
          left: anchorRect.left - TOUR_HOLE_PADDING,
          width: anchorRect.width + TOUR_HOLE_PADDING * 2,
          height: anchorRect.height + TOUR_HOLE_PADDING * 2,
        }
      : null;

  return (
    <div data-testid="guided-tour-overlay" data-tour-step={step.id}>
      {/* blocker — 비인터랙티브 단계는 전면 차단(스크림이 곧 dim 증거,
          modal-without-modality 금지 규칙 충족). 인터랙티브(4단계)는 전면
          통과가 아니라 컷아웃 bbox 4방향 스트립 차단 — 스포트라이트된 노드만
          클릭 가능, 나머지 크롬(투어 타일 재진입/검색/"?"/툴바)은 막는다
          (2026-07-23 Guardian 정정 — 전면 pointer-events-none 은 투어 위로
          다른 transient 표면을 쌓을 수 있었다). 구멍이 아직 해석 전이면 전면
          차단 유지(1프레임 폴백). */}
      {interactiveHole ? (
        <>
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed inset-x-0 top-0 z-[70]"
            style={{ height: Math.max(0, interactiveHole.top) }}
          />
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed left-0 z-[70]"
            style={{ top: interactiveHole.top, height: interactiveHole.height, width: Math.max(0, interactiveHole.left) }}
          />
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed right-0 z-[70]"
            style={{
              top: interactiveHole.top,
              height: interactiveHole.height,
              width: Math.max(0, viewport.width - (interactiveHole.left + interactiveHole.width)),
            }}
          />
          <div
            data-testid="guided-tour-blocker-strip"
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-[70]"
            style={{ height: Math.max(0, viewport.height - (interactiveHole.top + interactiveHole.height)) }}
          />
        </>
      ) : (
        <div
          data-testid="guided-tour-blocker"
          data-blocking="true"
          className="pointer-events-auto fixed inset-0 z-[70]"
        />
      )}

      {step.anchor === null ? (
        <div
          data-testid="guided-tour-scrim"
          className="fixed inset-0 z-[70] transition-opacity duration-[var(--topology-tour-transition-ms)] ease-out motion-reduce:transition-none"
          style={{ background: "var(--topology-tour-scrim-surface)" }}
        />
      ) : anchorRect ? (
        <div
          data-testid="guided-tour-cutout"
          data-cutout-shape={step.anchor.type === "canvas-node" ? "circle" : "rect"}
          className={cn(
            "pointer-events-none fixed z-[70] border",
            step.anchor.type === "canvas-node"
              ? // 캔버스 노드 원 — 매 프레임 worldToScreen 추종이 곧 모션이라
                // CSS 전환 없음(카메라 스프링과 싸우지 않는다, spec §5).
                // 보이는 링은 엔진이 캔버스에 직접 그린다(2026-07-24 정합
                // 개선) — 여기는 감광 구멍만 남기고 보더는 투명.
                "rounded-full border-transparent"
              : "rounded-[var(--chrome-radius)] border-[color:var(--color-border-strong)] transition-[top,left,width,height] duration-[var(--topology-tour-transition-ms)] ease-out motion-reduce:transition-none",
          )}
          style={{
            ...(step.anchor.type === "canvas-node"
              ? {
                  top: anchorRect.top,
                  left: anchorRect.left,
                  width: anchorRect.width,
                  height: anchorRect.height,
                }
              : {
                  top: anchorRect.top - 8,
                  left: anchorRect.left - 8,
                  width: anchorRect.width + 16,
                  height: anchorRect.height + 16,
                }),
            // 스크림 페인트 — 9999px 스프레드로 컷아웃 바깥 전체를 어둡게
            // 채운다. blur 0, 색 발광 없음 — design.md 가 금지하는
            // glow/neon `0 0 ...` 링과는 다른 기법이다(그건 blur>0 의 발광
            // 하이라이트, 이건 blur=0 의 불투명 마스크).
            boxShadow: "0 0 0 9999px var(--topology-tour-scrim-surface)",
          }}
        />
      ) : (
        // 레이아웃 안정화 전 — 깜빡이는 반쪽 컷아웃 대신 전체 스크림.
        <div
          data-testid="guided-tour-scrim"
          className="fixed inset-0 z-[70]"
          style={{ background: "var(--topology-tour-scrim-surface)" }}
        />
      )}

      {/* 단계 전환 모션 (2026-07-24 프레임 감사) — 카드는 `transition-opacity`
          만 있어 단계가 바뀌면 top/left 가 **순간이동**했다(30fps 영상에서
          1프레임 점프). 위치 보간(transition)은 캔버스 노드 단계가 매 프레임
          rect 를 추종하는 구조와 충돌하므로(카메라 스프링을 뒤따라 끌린다),
          `key` 로 단계마다 remount 시켜 **기존 패널 크로스페이드 키프레임**을
          재사용한다 — 새 카피가 그 자리에서 떠오르듯 나타나고, 추종 정확도는
          그대로다. */}
      <GuidedTourCard
        key={step.id}
        tour={tour}
        placement={placement}
        width={cardWidth}
        style={{ top: placement.top, left: placement.left }}
      />
    </div>
  );
}
