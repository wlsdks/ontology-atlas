import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectImportPage } from "@/views/settings-project-import";

export const metadata: Metadata = {
  title: '프로젝트 가져오기',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectImportPage />
    </Suspense>
  );
}
