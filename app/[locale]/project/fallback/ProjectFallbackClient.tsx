"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { resolveProjectFallbackRoute } from "@/entities/project";
import { ProjectDetailPage } from "@/views/project-detail";
import { ProjectEditorPage } from "@/views/project-editor";

export function ProjectFallbackClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const route = useMemo(
    () => resolveProjectFallbackRoute(pathname, search),
    [pathname, search],
  );

  useEffect(() => {
    if (!route) {
      router.replace("/projects");
    }
  }, [route, router]);

  if (!route) return null;

  if (route.mode === "edit") {
    return (
      <ProjectEditorPage
        mode="edit"
        slug={route.slug}
        returnTo={route.returnTo}
        savedNotice={route.savedNotice}
      />
    );
  }

  return (
    <ProjectDetailPage
      slug={route.slug}
      initialProject={null}
      initialRelated={[]}
    />
  );
}
