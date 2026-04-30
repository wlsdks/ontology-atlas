"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/entities/project";

const HomePage = dynamic(
  () => import("@/views/home").then((m) => m.HomePage),
  { ssr: false },
);

const PRESETS = [500, 1000, 3000, 10000] as const;
type Preset = (typeof PRESETS)[number];

/**
 * 합성 프로젝트 N 개를 반복 가능한 방식으로 만든다. 허브는 전체의 ~2%
 * 상한. slug 는 고유, 의존은 sparse (평균 2개) — 10k 까지도 실제 Firestore
 * 부하 없이 렌더링 비용만 측정 가능.
 */
function buildSynthProjects(count: number): Project[] {
  const hubCount = Math.min(12, Math.max(3, Math.floor(count * 0.02)));
  const categories = ["in-progress", "planned"] as const;
  const statuses = [
    "idea",
    "planning",
    "developing",
    "deploy-ready",
    "live",
  ] as const;
  const domainKeys = [
    "frontend",
    "backend",
    "data",
    "ml",
    "mobile",
    "infra",
    "security",
    "observability",
    "devops",
    "docs",
  ];

  const now = new Date();
  const projects: Project[] = [];
  for (let i = 0; i < count; i += 1) {
    const isHub = i < hubCount;
    const domain = domainKeys[i % domainKeys.length];
    const slug = isHub ? `${domain}-hub-${i}` : `${domain}-${i}`;
    const angle = (i / count) * Math.PI * 2;
    const radius = 40 + (i % 30);
    projects.push({
      slug,
      name: isHub
        ? `${domain.toUpperCase()} Hub ${i}`
        : `${capitalize(domain)} ${i}`,
      category: categories[i % categories.length],
      status: statuses[i % statuses.length],
      description: `Synthetic ${isHub ? "hub" : "service"} #${i} for stress benchmark.`,
      tags: [],
      stack: [],
      links: [],
      dependencies: [],
      screenshots: [],
      timeline: {},
      isHub,
      position: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      },
      createdAt: now,
      updatedAt: now,
    });
  }
  // sparse edges — 각 비허브 는 랜덤 허브 1개 + 가끔 이웃 비허브 1개.
  for (let i = 0; i < count; i += 1) {
    const project = projects[i];
    if (project.isHub) continue;
    const hubSlug = projects[i % hubCount].slug;
    const neighborSlug =
      i % 5 === 0 && i + 1 < count ? projects[i + 1].slug : null;
    project.dependencies = neighborSlug ? [hubSlug, neighborSlug] : [hubSlug];
  }
  return projects;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function readInitialPreset(): Preset | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace("#", "");
  const count = Number(hash);
  return PRESETS.includes(count as Preset) ? (count as Preset) : null;
}

export default function StressTopologyClient() {
  const [active] = useState<Preset | null>(readInitialPreset);

  // 초기 preset (URL hash 기반) 이 있으면 synthProjects 즉시 주입. setState
  // 호출은 effect body 에서 하지 않음 (hook rule).
  useEffect(() => {
    if (!active) return;
    const synth = buildSynthProjects(active);
    (window as unknown as { __synthProjects?: Project[] }).__synthProjects = synth;
  }, [active]);

  // preset 클릭 시 hash 업데이트 + reload → readInitialPreset 으로 복원.
  const applyPreset = useCallback((count: Preset) => {
    if (typeof window === "undefined") return;
    window.location.hash = String(count);
    window.location.reload();
  }, []);

  return (
    <div className="relative h-screen w-full">
      <div className="pointer-events-auto absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(18,20,26,0.96)] px-2 py-1 shadow-[0_10px_24px_rgba(0,0,0,0.4)]">
        <span className="px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          Stress · synth
        </span>
        {PRESETS.map((count) => {
          const isActive = active === count;
          return (
            <button
              key={count}
              type="button"
              onClick={() => applyPreset(count)}
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                isActive
                  ? "bg-[color:rgba(94,106,210,0.2)] text-[color:var(--color-indigo-accent)]"
                  : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
              }`}
            >
              {count.toLocaleString()}
            </button>
          );
        })}
      </div>
      <HomePage />
    </div>
  );
}
