"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ProjectDetailPage } from "@/views/project-detail";

type Resolution = { state: "pending" } | { state: "slug"; slug: string } | { state: "redirect" };

// 브라우저에 도달한 path 에서 slug 를 추출. cleanUrls + trailingSlash
// 정책상 path 는 `/project/<slug>/` 형태. CDN rewrite 가 이 페이지로 unknown
// slug 를 보낼 때 path 는 그대로 사용자가 친 URL — JS 에서 다시 꺼낸다.
// 진입 path 자체가 `/project/fallback/` 이면 (= rewrite 없이 직접 진입) 빈
// 페이지를 안 보여주고 /projects 리스트로 보낸다.
function extractSlug(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const match = path.match(/^(?:\/[a-z]{2})?\/project\/([^/]+)\/?$/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  if (!raw || raw === "fallback") return null;
  return raw;
}

export function ProjectFallbackClient() {
  const router = useRouter();
  const [resolution, setResolution] = useState<Resolution>({ state: "pending" });

  useEffect(() => {
    const slug = extractSlug();
    if (slug) {
      setResolution({ state: "slug", slug });
    } else {
      setResolution({ state: "redirect" });
      router.replace("/projects");
    }
  }, [router]);

  if (resolution.state !== "slug") return null;
  return (
    <ProjectDetailPage
      slug={resolution.slug}
      initialProject={null}
      initialRelated={[]}
    />
  );
}
