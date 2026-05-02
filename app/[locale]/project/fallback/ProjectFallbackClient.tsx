"use client";

import { useEffect, useState } from "react";
import { ProjectDetailPage } from "@/views/project-detail";

// 브라우저에 도달한 path 에서 slug 를 추출. cleanUrls + trailingSlash
// 정책상 path 는 `/project/<slug>/` 형태. 자기 자신 (fallback) 진입은 빈 slug 처리.
function extractSlug(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const match = path.match(/^\/project\/([^/]+)\/?$/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  if (!raw || raw === "fallback") return null;
  return raw;
}

export function ProjectFallbackClient() {
  const [slug, setSlug] = useState<string | null>(null);
  // SSR 평가에서 location 접근 불가 — 마운트 후 1 회만 추출.
  useEffect(() => {
    setSlug(extractSlug());
  }, []);
  if (!slug) return null;
  return (
    <ProjectDetailPage slug={slug} initialProject={null} initialRelated={[]} />
  );
}
