import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectSelectorPage } from "@/views/project-selector";
import { absoluteUrl } from "@/shared/config";

export const metadata: Metadata = {
  title: '프로젝트',
  description: '토폴로지 지도에 포함된 프로젝트와 허브 목록.',
  alternates: {
    canonical: absoluteUrl('/projects/'),
  },
};

export default function ProjectsRoute() {
  return (
    <Suspense fallback={null}>
      <ProjectSelectorPage />
    </Suspense>
  );
}
